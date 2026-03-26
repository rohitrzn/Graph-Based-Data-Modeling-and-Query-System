from sqlalchemy.orm import Session
from sqlalchemy import MetaData
import math

def get_graph_data(db: Session):
    nodes = []
    edges = []
    seen_edges = set()
    seen_nodes = set()

    def add_node(id, label, type, **kwargs):
        if id not in seen_nodes:
            nodes.append({"id": str(id), "label": label, "type": type, **kwargs})
            seen_nodes.add(id)

    def add_edge(source, target, rel_type, is_core=True):
        if source and target and source != target:
            # Sort keys to prevent duplicate bidirectional edges if needed, 
            # but here relationship direction matters (e.g. SO -> BP)
            key = (str(source), str(target), str(rel_type))
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append({
                    "source": str(source), 
                    "target": str(target), 
                    "type": rel_type,
                    "is_core": is_core
                })

    def clean(row_dict):
        return {
            k: (v if not (isinstance(v, float) and math.isnan(v)) else None)
            for k, v in row_dict.items()
        }

    metadata = MetaData()
    metadata.reflect(bind=db.get_bind())

    # 1. Define Core O2C Tables (Headers + Key Entities)
    core_tables = {
        "business_partners",
        "sales_order_headers",
        "sales_order_items",
        "outbound_delivery_headers",
        "outbound_delivery_items",
        "billing_document_headers",
        "billing_document_items",
        "payments_accounts_receivable",
        "journal_entry_items_accounts_receivable",
        "products",
    }

    # 2. Load Nodes and Build Universal ID Map
    table_to_primary_key_cache = {} # table_name -> [(local_id, global_id)]
    universal_id_map = {} # local_id -> global_id (for fallback linking)

    for table_name, table in metadata.tables.items():
        if table_name not in core_tables:
            continue

        rows = db.execute(table.select()).fetchall()
        first_col = table.columns.keys()[0] if table.columns else None

        for idx, row in enumerate(rows):
            row_dict = dict(row._mapping)
            local_id = str(row_dict.get(first_col, idx))
            # Global ID includes table name to ensure uniqueness across the system
            global_id = f"{table_name}_{local_id}"
            
            table_to_primary_key_cache.setdefault(table_name, []).append((local_id, global_id))
            
            # Universal ID map for fallback linking (using string keys)
            if local_id and local_id.lower() not in ("nan", "none", ""):
                # Note: This might overwrite if multiple tables have same PK value, 
                # but it's a fallback.
                universal_id_map[local_id] = global_id

            kw = clean(row_dict)
            label_primary = str(kw.get(first_col, local_id))
            table_name_str = str(table_name)
            is_item = ("items" in table_name_str or table_name_str.endswith("_items") or "item" in table_name_str)
            # Special case: Journal Entries are a core entity hub despite the table name
            if table_name_str == "journal_entry_items_accounts_receivable":
                is_item = False
            add_node(global_id, f"{table_name_str}: {label_primary}", table_name_str, is_item=is_item, **kw)

    # 3. Explicit Document Flow Wiring (Prioritized)
    node_lookup = {n["id"]: n for n in nodes}
    bp_map = {local_id: gid for local_id, gid in table_to_primary_key_cache.get("business_partners", [])}
    so_map = {local_id: gid for local_id, gid in table_to_primary_key_cache.get("sales_order_headers", [])}
    dlv_map = {local_id: gid for local_id, gid in table_to_primary_key_cache.get("outbound_delivery_headers", [])}
    bill_map = {local_id: gid for local_id, gid in table_to_primary_key_cache.get("billing_document_headers", [])}
    prod_map = {local_id: gid for local_id, gid in table_to_primary_key_cache.get("products", [])}

    # 3a. SO -> BP (soldToParty)
    for local_id, gid in table_to_primary_key_cache.get("sales_order_headers", []):
        node = node_lookup.get(gid)
        if node and str(node.get("soldToParty")) in bp_map:
            add_edge(gid, bp_map[str(node.get("soldToParty"))], "soldToParty", is_core=True)

    # 3b. Delivery -> SO (via outbound_delivery_items)
    dlv_items = metadata.tables.get("outbound_delivery_items")
    if dlv_items is not None:
        rows = db.execute(dlv_items.select()).fetchall()
        for row in rows:
            rd = dict(row._mapping)
            d_id, so_id = str(rd.get("deliveryDocument")), str(rd.get("referenceSdDocument"))
            if d_id in dlv_map and so_id in so_map:
                add_edge(dlv_map[d_id], so_map[so_id], "fulfillsOrder", is_core=True)

    # 3c. Invoice -> Delivery or SO (via billing_document_items)
    bill_items = metadata.tables.get("billing_document_items")
    if bill_items is not None:
        rows = db.execute(bill_items.select()).fetchall()
        for row in rows:
            rd = dict(row._mapping)
            b_id, ref_id = str(rd.get("billingDocument")), str(rd.get("referenceSdDocument"))
            if b_id in bill_map:
                if ref_id in dlv_map:
                    add_edge(bill_map[b_id], dlv_map[ref_id], "billedDelivery", is_core=True)
                elif ref_id in so_map:
                    add_edge(bill_map[b_id], so_map[ref_id], "billedOrder", is_core=True)

    # 3d. Journal Entry -> Invoice (via referenceDocument)
    je_table_cache = table_to_primary_key_cache.get("journal_entry_items_accounts_receivable", [])
    for local_id, gid in je_table_cache:
        node = node_lookup.get(gid)
        if node:
            ref = str(node.get("referenceDocument"))
            if ref in bill_map:
                add_edge(gid, bill_map[ref], "journalForInvoice", is_core=True)
            cust = str(node.get("customer"))
            if cust in bp_map:
                add_edge(gid, bp_map[cust], "journalForCustomer", is_core=True)

    # 3e. Header -> Item -> Product (Granular Wiring)
    # Sales Order Items
    s_items = metadata.tables.get("sales_order_items")
    if s_items is not None:
        rows = db.execute(s_items.select()).fetchall()
        for row in rows:
            rd = dict(row._mapping)
            so_id, mat, item_idx = str(rd.get("salesOrder")), str(rd.get("material")), str(rd.get("salesOrderItem"))
            item_gid = f"sales_order_items_{so_id}_{item_idx}"
            add_node(item_gid, f"SO Item: {item_idx}", "sales_order_items", is_item=True, **rd)
            if so_id in so_map:
                add_edge(so_map[so_id], item_gid, "hasItem", is_core=True)
            if mat in prod_map:
                add_edge(item_gid, prod_map[mat], "isProduct", is_core=True)
                if so_id in so_map: # Restore Phase 1 Shortcut Edge to prevent drifting
                    add_edge(so_map[so_id], prod_map[mat], "orderedProduct", is_core=True)

    # Delivery Items
    d_items = metadata.tables.get("outbound_delivery_items")
    if d_items is not None:
        rows = db.execute(d_items.select()).fetchall()
        for row in rows:
            rd = dict(row._mapping)
            d_id, so_id, mat, item_idx = str(rd.get("deliveryDocument")), str(rd.get("referenceSdDocument")), str(rd.get("material")), str(rd.get("deliveryDocumentItem"))
            item_gid = f"outbound_delivery_items_{d_id}_{item_idx}"
            add_node(item_gid, f"Dlv Item: {item_idx}", "outbound_delivery_items", is_item=True, **rd)
            if d_id in dlv_map:
                add_edge(dlv_map[d_id], item_gid, "hasItem", is_core=True)
            if mat in prod_map:
                add_edge(item_gid, prod_map[mat], "isProduct", is_core=True)
                if d_id in dlv_map: # Restore Phase 1 Shortcut Edge
                    add_edge(dlv_map[d_id], prod_map[mat], "deliveredProduct", is_core=True)

    # Billing Items
    b_items = metadata.tables.get("billing_document_items")
    if b_items is not None:
        rows = db.execute(b_items.select()).fetchall()
        for row in rows:
            rd = dict(row._mapping)
            b_id, ref_id, item_idx = str(rd.get("billingDocument")), str(rd.get("referenceSdDocument")), str(rd.get("billingDocumentItem"))
            item_gid = f"billing_document_items_{b_id}_{item_idx}"
            add_node(item_gid, f"Bill Item: {item_idx}", "billing_document_items", is_item=True, **rd)
            if b_id in bill_map:
                add_edge(bill_map[b_id], item_gid, "hasItem", is_core=True)
            # Link Bill Item to SO or Delivery if possible
            if ref_id in so_map: add_edge(item_gid, so_map[ref_id], "referencesOrder", is_core=True)
            if ref_id in dlv_map: add_edge(item_gid, dlv_map[ref_id], "referencesDlv", is_core=True)

    # 3f. Invoice -> Business Partner (Fallback for floating invoices)
    for head_local, head_gid in table_to_primary_key_cache.get("billing_document_headers", []):
        node = node_lookup.get(head_gid)
        if node:
            sold_to, payer = str(node.get("soldToParty")), str(node.get("payerParty"))
            if sold_to in bp_map:
                add_edge(head_gid, bp_map[sold_to], "billedTo", is_core=True)
            elif payer in bp_map:
                add_edge(head_gid, bp_map[payer], "paidBy", is_core=True)

    # 3g. Items -> Headers (Structural Wiring)
    # Sales Order Items -> SO Header
    if (so_items := metadata.tables.get("sales_order_items")) is not None:
        for row in db.execute(so_items.select()).fetchall():
            rd = dict(row._mapping)
            so_id, item_id = str(rd.get("salesOrder")), str(rd.get("salesOrderItem"))
            item_gid = f"sales_order_items_{so_id}_{item_id}" # Composite key for uniqueness
            if so_id in so_map:
                add_node(item_gid, f"SO Item: {item_id}", "sales_order_items", is_item=True, **rd)
                add_edge(item_gid, so_map[so_id], "itemOfOrder", is_core=True)

    # Outbound Delivery Items -> Delivery Header
    if (dlv_items := metadata.tables.get("outbound_delivery_items")) is not None:
        for row in db.execute(dlv_items.select()).fetchall():
            rd = dict(row._mapping)
            d_id, item_id = str(rd.get("deliveryDocument")), str(rd.get("deliveryDocumentItem"))
            item_gid = f"outbound_delivery_items_{d_id}_{item_id}"
            if d_id in dlv_map:
                add_node(item_gid, f"DLV Item: {item_id}", "outbound_delivery_items", is_item=True, **rd)
                add_edge(item_gid, dlv_map[d_id], "itemOfDelivery", is_core=True)

    # Billing Document Items -> Billing Header
    if (bill_items := metadata.tables.get("billing_document_items")) is not None:
        for row in db.execute(bill_items.select()).fetchall():
            rd = dict(row._mapping)
            b_id, item_id = str(rd.get("billingDocument")), str(rd.get("billingDocumentItem"))
            item_gid = f"billing_document_items_{b_id}_{item_id}"
            if b_id in bill_map:
                add_node(item_gid, f"Bill Item: {item_id}", "billing_document_items", is_item=True, **rd)
                add_edge(item_gid, bill_map[b_id], "itemOfBilling", is_core=True)

    # 4. Universal Fallback Crawler (Catching remaining links)
    for node in nodes:
        source_id = node["id"]
        for key, val in node.items():
            if key in ["id", "label", "type"]: continue
            val_str = str(val)
            if val_str in universal_id_map:
                add_edge(source_id, universal_id_map[val_str], key, is_core=False)

    return {"nodes": nodes, "links": edges}

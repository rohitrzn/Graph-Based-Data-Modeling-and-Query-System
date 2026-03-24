from sqlalchemy.orm import Session
import models

def get_graph_data(db: Session):
    nodes = []
    edges = []
    
    # helper to add node if not exists
    seen_nodes = set()
    def add_node(id, label, type, **kwargs):
        if id not in seen_nodes:
            nodes.append({"id": id, "label": label, "type": type, **kwargs})
            seen_nodes.add(id)
            
    def add_edge(source, target, type):
        if source and target:
            edges.append({"source": source, "target": target, "type": type})

    def clean_dict(obj):
        d = dict(obj.__dict__)
        d.pop('_sa_instance_state', None)
        d.pop('id', None)
        d.pop('type', None)
        return d

    # Customers
    for c in db.query(models.Customer).all():
        add_node(f"customer_{c.id}", f"Customer {c.id}", "Customer", **clean_dict(c))
        
    # Companies
    for c in db.query(models.Company).all():
        add_node(f"company_{c.id}", f"Company {c.id}", "Company", **clean_dict(c))
        
    # Accounting Documents
    for a in db.query(models.AccountingDocument).all():
        add_node(f"accounting_{a.id}", f"Acc Doc {a.id}", "AccountingDocument", **clean_dict(a))
        
    # Billing Documents
    for b in db.query(models.BillingDocument).all():
        node_id = f"billing_{b.id}"
        add_node(node_id, f"Billing {b.id}", "BillingDocument", **clean_dict(b))
        
        # Edges
        if b.customer_id:
            add_edge(f"customer_{b.customer_id}", node_id, "Billed To")
        if b.company_id:
            add_edge(node_id, f"company_{b.company_id}", "Belongs To Company")
        if b.accounting_document_id:
            add_edge(node_id, f"accounting_{b.accounting_document_id}", "Generates Entry")

    return {"nodes": nodes, "links": edges}

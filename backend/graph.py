from sqlalchemy.orm import Session
from sqlalchemy import MetaData
import math

def get_graph_data(db: Session):
    nodes = []
    edges = []
    
    seen_nodes = set()
    def add_node(id, label, type, **kwargs):
        if id not in seen_nodes:
            nodes.append({"id": str(id), "label": label, "type": type, **kwargs})
            seen_nodes.add(id)
            
    def add_edge(source, target, type):
        if source and target:
            edges.append({"source": str(source), "target": str(target), "type": type})

    metadata = MetaData()
    metadata.reflect(bind=db.get_bind())
    
    # 1. Dynamic Table Injection
    table_to_primary_key_cache = {}
    
    for table_name, table in metadata.tables.items():
        if table_name == "sqlite_sequence": continue
        
        # Read the SQLite database row natively
        rows = db.execute(table.select()).fetchall()
        
        # We generically assume the first column holds the primary key identifier in SAP sets
        first_col = table.columns.keys()[0] if table.columns else None
        
        for idx, row in enumerate(rows):
            row_dict = dict(row._mapping)
            
            # Coerce the primary local key to string explicitly
            local_id = str(row_dict.get(first_col, idx))
            
            # Assign a fully unique global D3 ID across all datasets
            global_id = f"{table_name}_{local_id}"
            table_to_primary_key_cache.setdefault(table_name, []).append((local_id, global_id))
            
            # Serialize for React, removing SQLite floats so it doesn't crash the JS stringifier
            clean_kwargs = {k: (v if not (isinstance(v, float) and math.isnan(v)) else None) for k, v in row_dict.items()}
            
            label_primary = str(clean_kwargs.get(first_col, local_id))
            add_node(global_id, f"{table_name}: {label_primary}", table_name, **clean_kwargs)

    # 2. Universal Foreign-Key Linking Algorithm
    universal_id_map = {}
    for t_name, id_pairs in table_to_primary_key_cache.items():
        for local_id, global_id in id_pairs:
            if local_id and local_id.lower() != "nan" and local_id.lower() != "none":
                universal_id_map[str(local_id)] = global_id
                
    # Crawl over every node's metadata dump and reverse-lookup values against the universal ID index
    for node in nodes:
        source_id = node["id"]
        for property_key, property_value in node.items():
            if property_key in ["id", "label", "type", "index", "x", "y", "vx", "vy", "indexColor", "color", "nodeVal"]: 
                continue
                
            val_str = str(property_value)
            
            # Was this property actually an unmapped ForeignKey pointing to another table's primary node?
            if val_str in universal_id_map:
                target_id = universal_id_map[val_str]
                
                # Automatically generate a generic topological edge
                if source_id != target_id:
                    add_edge(source_id, target_id, property_key)

    return {"nodes": nodes, "links": edges}

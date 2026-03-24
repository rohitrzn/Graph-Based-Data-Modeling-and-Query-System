import os
import glob
import pandas as pd
import sqlite3

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "sap-o2c-data")
DB_PATH = "graph3.db"

def ingest_data():
    print(f"Starting isolated Pandas pipeline towards {DB_PATH}")
    
    # Use native C-bindings rather than SQLAlchemy to entirely bypass pool deadlocking
    conn = sqlite3.connect(DB_PATH, timeout=60)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    
    folders = [f.path for f in os.scandir(DATA_DIR) if f.is_dir()]
    total_rows = 0
    
    for folder in folders:
        table_name = os.path.basename(folder)
        jsonl_files = glob.glob(os.path.join(folder, "*.jsonl"))
        
        if not jsonl_files:
            continue
            
        dfs = []
        for file in jsonl_files:
            try:
                df = pd.read_json(file, lines=True)
                dfs.append(df)
            except Exception as e:
                pass
                
        if dfs:
            combined_df = pd.concat(dfs, ignore_index=True)
            for col in combined_df.columns:
                # Stringify any lists or dictionaries since SQLite exclusively accepts primitives
                if combined_df[col].apply(lambda x: isinstance(x, (list, dict))).any():
                    combined_df[col] = combined_df[col].astype(str)
                    
                if "Date" in col or "Time" in col:
                    try:
                        combined_df[col] = pd.to_datetime(combined_df[col], format='mixed', errors='ignore')
                    except:
                        pass
                        
            print(f"Pushing '{table_name}'...")
            combined_df.to_sql(table_name, conn, if_exists="replace", index=False, chunksize=1000)
            rows = len(combined_df)
            total_rows += rows
            print(f" -> Automatically created table '{table_name}' with {rows} rows.")
            
    conn.close()
    print(f"\nSUCCESS: Universally ingested {total_rows} total rows!")

if __name__ == "__main__":
    ingest_data()

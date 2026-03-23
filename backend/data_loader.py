import json
import os
from pathlib import Path
from datetime import datetime
from sqlalchemy.orm import Session
from database import engine, Base, SessionLocal
import models

def parse_file(db: Session, filepath: str):
    print(f"Loading data from: {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            data = json.loads(line)
            
            # create or get Customer
            customer_id = data.get("soldToParty")
            if customer_id and not db.query(models.Customer).filter_by(id=customer_id).first():
                db.add(models.Customer(id=customer_id))
            
            # create or get Company
            company_id = data.get("companyCode")
            if company_id and not db.query(models.Company).filter_by(id=company_id).first():
                db.add(models.Company(id=company_id))
                
            # create or get AccountingDocument
            accounting_id = data.get("accountingDocument")
            if accounting_id and not db.query(models.AccountingDocument).filter_by(id=accounting_id).first():
                db.add(models.AccountingDocument(id=accounting_id))
            
            # Parse dates
            creation_date = data.get("creationDate")
            last_change = data.get("lastChangeDateTime")
            
            try:
                creation_dt = datetime.fromisoformat(creation_date.replace("Z", "+00:00")) if creation_date else None
            except:
                creation_dt = None
                
            try:
                last_change_dt = datetime.fromisoformat(last_change.replace("Z", "+00:00")) if last_change else None
            except:
                last_change_dt = None
            
            # Create BillingDocument
            bill_id = data.get("billingDocument")
            if bill_id and not db.query(models.BillingDocument).filter_by(id=bill_id).first():
                db.add(models.BillingDocument(
                    id=bill_id,
                    type=data.get("billingDocumentType"),
                    creation_date=creation_dt,
                    last_change_datetime=last_change_dt,
                    total_net_amount=float(data.get("totalNetAmount", 0)),
                    currency=data.get("transactionCurrency"),
                    is_cancelled=bool(data.get("billingDocumentIsCancelled")),
                    customer_id=customer_id,
                    company_id=company_id,
                    accounting_document_id=accounting_id
                ))
            
            db.commit()

def load_data_from_directory(data_dir: str):
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    path = Path(data_dir)
    jsonl_files = list(path.rglob("*.jsonl"))
    
    if not jsonl_files:
        print(f"No .jsonl files found recursively in {data_dir}")
        db.close()
        return

    print(f"Found {len(jsonl_files)} JSONL files to process.")
    for file_path in jsonl_files:
        try:
            parse_file(db, str(file_path))
        except Exception as e:
            print(f"Failed loading {file_path}: {e}")
    
    db.close()
    print("All JSONL files processed successfully.")

if __name__ == "__main__":
    # Point this to the root data directory
    data_directory = os.path.join(os.path.dirname(__file__), "..", "data")
    load_data_from_directory(data_directory)

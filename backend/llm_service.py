import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import text
import json
import sqlite3
import datetime
import re
from pathlib import Path
from groq import Groq

# Load environment variables from .env file
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Configure Groq
api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key) if api_key else None

SCHEMA_CONTEXT = """
You are an AI assistant that translates natural language inquiries into SQL queries for an SQLite database focusing on the Order-to-Cash (O2C) flow.

Rules:
1. RESTRICTED DOMAIN: If the prompt is unrelated to the dataset (general knowledge, creative writing, etc.), respond EXACTLY with:
   "This system is designed to answer questions related to the provided dataset only."
2. NO HALLUCINATION: Only use provided schema. No markdown ticks.
3. SINGLE SQL: Output ONLY one contiguous SQL statement. 
4. NO RANDOM LIMITS: Return all matching rows unless specified.
5. EXPLICIT JOINS: Use `LEFT JOIN tableB ON ...` instead of comma separation.
6. PRIMARY KEYS: Always include primary keys (e.g. `soldToParty`, `deliveryDocument`, `billingDocument`) in your SELECT.
7. O2C QUERY LOGIC:
   - MOST BILLED PRODUCTS: Use `billing_document_items` (column `material`) and count.
    - BILLING PARTNERS: If asked "how many billing partners", count from `business_partners.businessPartner` unless the user explicitly asks for billed customers appearing in invoices.
   - FULL FLOW TRACING: Start with `sales_order_headers`, join `outbound_delivery_items` (on `referenceSdDocument`), then `billing_document_items` (on `referenceSdDocument`), then `journal_entry_items_accounts_receivable` (on `referenceDocument`).
   - BROKEN/INCOMPLETE FLOWS (e.g., delivered but not billed):
     `SELECT DISTINCT i.referenceSdDocument FROM outbound_delivery_items i LEFT JOIN billing_document_items b ON i.deliveryDocument = b.referenceSdDocument WHERE b.referenceSdDocument IS NULL`
   - PRODUCT MAPPING: Use `sales_order_items.material` to join with `products.product`.

Step 1: Convert query to SQL. Return ONLY raw SQL.
"""

def apply_domain_overrides(question: str, sql: str) -> str:
    rule_sql = get_rule_based_sql(question)
    if rule_sql:
        return rule_sql

    q = (question or "").lower()
    count_intent = any(token in q for token in ["how many", "count", "number of"])
    mentions_billing_partner = ("billing partner" in q) or ("billing partners" in q)
    explicit_invoice_scope = any(token in q for token in ["invoice", "billing document", "billed to"])

    # Users commonly mean master partner count, not only invoice sold-to values.
    if count_intent and mentions_billing_partner and not explicit_invoice_scope:
        return (
            "SELECT COUNT(DISTINCT businessPartner) AS total_billing_partners, "
            "GROUP_CONCAT(DISTINCT businessPartner) AS billing_partner_ids "
            "FROM business_partners"
        )

    return sql

def is_domain_question(question: str) -> bool:
    q = (question or "").strip().lower()
    if not q:
        return False

    # Fast fail for clearly unrelated requests.
    unrelated_markers = [
        "write a poem", "write a story", "joke", "weather", "capital of",
        "recipe", "movie", "sports", "politics", "stock price", "song",
        "creative writing", "who won", "translate this"
    ]
    if any(marker in q for marker in unrelated_markers):
        return False

    domain_markers = [
        "sales order", "delivery", "billing", "invoice", "journal", "payment",
        "product", "business partner", "o2c", "order-to-cash", "sap",
        "flow", "trace", "dataset", "table", "sql"
    ]
    return any(marker in q for marker in domain_markers)

def _extract_first_numeric_id(question: str):
    m = re.search(r"\b\d{4,}\b", question or "")
    return m.group(0) if m else None

def get_rule_based_sql(question: str):
    q = (question or "").lower()

    count_intent = any(token in q for token in ["how many", "count", "number of"])
    mentions_billing_partner = ("billing partner" in q) or ("billing partners" in q)
    explicit_invoice_scope = any(token in q for token in ["invoice", "billing document", "billed to"])
    if count_intent and mentions_billing_partner and not explicit_invoice_scope:
        return (
            "SELECT COUNT(DISTINCT businessPartner) AS total_billing_partners, "
            "GROUP_CONCAT(DISTINCT businessPartner) AS billing_partner_ids "
            "FROM business_partners"
        )

    # a) Highest billed products
    asks_top_products = (
        ("highest" in q or "most" in q or "top" in q)
        and "product" in q
        and ("billing" in q or "invoice" in q)
    )
    if asks_top_products:
        return (
            "SELECT material AS product_id, "
            "COUNT(DISTINCT billingDocument) AS billing_document_count "
            "FROM billing_document_items "
            "GROUP BY material "
            "ORDER BY billing_document_count DESC, product_id"
        )

    # b) Trace full billing flow
    asks_trace_flow = (
        ("trace" in q or "full flow" in q or ("flow" in q and "billing" in q))
        and "billing document" in q
    )
    if asks_trace_flow:
        doc_id = _extract_first_numeric_id(question)
        where_clause = f" WHERE b.billingDocument = '{doc_id}'" if doc_id else ""
        return (
            "SELECT DISTINCT "
            "so.salesOrder AS sales_order, "
            "di.deliveryDocument AS delivery_document, "
            "b.billingDocument AS billing_document, "
            "je.referenceDocument AS journal_reference_document, "
            "je.customer AS journal_customer "
            "FROM billing_document_headers b "
            "LEFT JOIN billing_document_items bi ON b.billingDocument = bi.billingDocument "
            "LEFT JOIN outbound_delivery_items di ON bi.referenceSdDocument = di.deliveryDocument "
            "LEFT JOIN sales_order_headers so ON (di.referenceSdDocument = so.salesOrder OR bi.referenceSdDocument = so.salesOrder) "
            "LEFT JOIN journal_entry_items_accounts_receivable je ON je.referenceDocument = b.billingDocument"
            f"{where_clause} "
            "ORDER BY billing_document, delivery_document, sales_order"
        )

    # c) Broken or incomplete flows
    asks_broken_flow = any(token in q for token in [
        "broken", "incomplete", "delivered but not billed", "billed without delivery"
    ]) and ("flow" in q or "sales order" in q or "delivery" in q or "billing" in q)
    if asks_broken_flow:
        return (
            "SELECT DISTINCT so.salesOrder AS flow_reference, 'DELIVERED_NOT_BILLED' AS issue_type "
            "FROM sales_order_headers so "
            "JOIN outbound_delivery_items di ON di.referenceSdDocument = so.salesOrder "
            "LEFT JOIN billing_document_items bi ON bi.referenceSdDocument = di.deliveryDocument "
            "WHERE bi.billingDocument IS NULL "
            "UNION "
            "SELECT DISTINCT bi.referenceSdDocument AS flow_reference, 'BILLED_WITHOUT_DELIVERY' AS issue_type "
            "FROM billing_document_items bi "
            "LEFT JOIN outbound_delivery_items di ON bi.referenceSdDocument = di.deliveryDocument "
            "WHERE di.deliveryDocument IS NULL AND bi.referenceSdDocument IS NOT NULL "
            "ORDER BY flow_reference, issue_type"
        )

    return None

def get_dynamic_schema(db: Session) -> str:
    try:
        tables_query = text("SELECT name FROM sqlite_master WHERE type='table';")
        tables = db.execute(tables_query).fetchall()
        
        schema_text = "The database schema is as follows:\n"
        for table in tables:
            table_name = table[0]
            if table_name == "sqlite_sequence": continue
            
            columns_query = text(f"PRAGMA table_info({table_name});")
            columns = db.execute(columns_query).fetchall()
            
            cols_info = [f"{col[1]} {col[2]}" for col in columns]
            schema_text += f"- {table_name} ({', '.join(cols_info)})\n"
            
        return schema_text
    except Exception as e:
        print(f"Error extracting schema: {e}")
        return "The database schema is as follows:\n- No schema could be extracted."

def generate_sql(db: Session, question: str, history: list = None) -> str:
    dynamic_schema = get_dynamic_schema(db)
    
    messages = []
    messages.append({
        "role": "system", 
        "content": f"{SCHEMA_CONTEXT}\n\n{dynamic_schema}\n\nReturn EXACTLY the valid SQL query. Make sure to consider the Conversation History to resolve references. Do not return markdown ticks."
    })
    
    if history:
        for msg in history[-6:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("content", "").strip()})
            
    messages.append({"role": "user", "content": f"New User Question: {question}"})
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.0
        )
        if response.choices:
            sql = response.choices[0].message.content.strip()
            # Clean up potential markdown formatting from the response
            if sql.startswith("```sql"):
                sql = sql[6:]
            if sql.startswith("```"):
                sql = sql[3:]
            if sql.endswith("```"):
                sql = sql[:-3]
            
            # Check for the rejection rule
            if "This system is designed to answer questions related to the provided dataset only." in sql:
                return "" # Return empty string for rejection
            
            return sql.strip()
        return ""
    except Exception as e:
        print(f"Groq API Error in SQL Generation: {e}")
        error_msg = str(e).lower()
        if "rate limit" in error_msg or "quota" in error_msg or "429" in error_msg:
            return "ERROR_API"
        return ""

def execute_sql(db: Session, sql: str):
    try:
        result = db.execute(text(sql))
        rows = [dict(row._mapping) for row in result]
        return rows
    except Exception as e:
        return f"Error executing SQL: {e}"

def generate_nl_response(question: str, sql: str, data: list, history: list = None):
    
    messages = []
    messages.append({
        "role": "system", 
        "content": "You are a helpful AI answering data questions naturally and accurately based on returned SQL data context. Do not output markdown code blocks unless requested. Be concise and helpful. IMPORTANT: Never invent entities, IDs, names, or examples that are not present in SQL data. If only aggregated rows are available, state the aggregate only and do not fabricate sample records. When mentioning specific entities that are present in data, include their exact IDs."
    })
    
    if history:
        for msg in history[-6:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("content", "").strip()})
            
    content = f"Target SQL: {sql}\nDatabase returned: {data}\n\nSummarize the answer to the user's newest question based on this data."
    messages.append({"role": "user", "content": f"New User Question: {question}\n\n{content}"})
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.2,
            stream=True
        )
        for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        print(f"Groq API Error in NL Generation: {e}")
        yield "\nThe backend successfully found your data, but hit a Groq API quota limit while trying to summarize it. You can view the raw data tables below!"

async def process_query(db: Session, question: str, history: list = []):
    def default_serializer(obj):
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        raise TypeError(f"Type {type(obj)} not serializable")

    if not api_key:
        yield f"data: {json.dumps({'error': 'GROQ_API_KEY not set'})}\n\n"
        return

    if not is_domain_question(question):
        yield f"data: {json.dumps({'type': 'error', 'response': 'This system is designed to answer questions related to the provided dataset only.', 'sql': '', 'data': []})}\n\n"
        return
        
    precomputed_sql = get_rule_based_sql(question)
    if precomputed_sql:
        sql = precomputed_sql
    else:
        sql = generate_sql(db, question, history)
        if sql and sql != "ERROR_API":
            sql = apply_domain_overrides(question, sql)
    if sql == "ERROR_API":
        yield f"data: {json.dumps({'type': 'error', 'response': 'I cannot answer this right now because the Groq API quota limit was exceeded. Please wait a moment and try again.', 'sql': '', 'data': []})}\n\n"
        return
    if not sql:
        yield f"data: {json.dumps({'type': 'error', 'response': 'This system is designed to answer questions related to the provided dataset only.', 'sql': '', 'data': []})}\n\n"
        return
        
    data = execute_sql(db, sql)
    if isinstance(data, str) and data.startswith("Error"):
        yield f"data: {json.dumps({'type': 'error', 'response': f'The AI generated an invalid database query that crashed SQLite. Reason: {data}', 'sql': sql, 'data': []})}\n\n"
        return
        
    initial_payload = {
        "type": "metadata",
        "sql": sql,
        "data": data
    }
    yield f"data: {json.dumps(initial_payload, default=default_serializer)}\n\n"
    
    for chunk_text in generate_nl_response(question, sql, data, history):
        chunk_payload = {
            "type": "text",
            "content": chunk_text
        }
        yield f"data: {json.dumps(chunk_payload, default=default_serializer)}\n\n"
        
    yield f"data: {json.dumps({'type': 'end'})}\n\n"

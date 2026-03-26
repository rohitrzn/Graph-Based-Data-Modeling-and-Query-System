import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import text
import json
import sqlite3
import datetime
from groq import Groq

# Load environment variables from .env file
load_dotenv()

# Configure Groq
api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key) if api_key else None

SCHEMA_CONTEXT = """
You are an AI assistant that translates natural language inquiries into SQL queries for an SQLite database.
The data visualized in the Graph UI focuses on the Order-to-Cash (O2C) flow: Business Partners -> Sales Orders -> Outbound Deliveries -> Billing Documents (Invoices) -> Journal Entries / Payments, plus Products. Address queries keeping this visual context in mind.

Rules:
1. Do not hallucinate data. Only use what is provided in the schema.
2. If the user's prompt is completely unrelated to business, datasets, or the schema, respond EXACTLY with:
   "This system is designed to answer questions related to the provided dataset only."
3. Your final response should ONLY output a single text string based on the current context.
4. NO RANDOM LIMITS: Do NOT append arbitrary limit clauses (like LIMIT 5) unless the user specifically asks for "top 5" or "a few". Return all matching rows so the user gets the full visualized context.
5. NO COMMA SEPARATED JOINS: Always use explicit JOIN syntax (e.g. `LEFT JOIN tableB ON tableA.id = tableB.id`) rather than implicit comma separation (`FROM tableA, tableB`).
6. There is no universal 'id' column! You MUST look at the table schema to identify the primary key (e.g. `soldToParty`, `deliveryDocument`) and always include it in your SELECT statements. 
7. CRITICAL SYNTAX RULE: You MUST strictly generate ONLY ONE contiguous SQL statement. NEVER output multiple statements separated by semicolons. If asked to count or query completely unrelated tables simultaneously, YOU MUST WRAP EACH SUBQUERY IN PARENTHESES AND PUT A SINGLE 'SELECT' AT THE VERY BEGINNING!
   - CORRECT: `SELECT (SELECT COUNT(*) FROM tableA) as count_A, (SELECT COUNT(*) FROM tableB) as count_B`
   - WRONG (WILL CRASH): `SELECT COUNT(*) FROM tableA, SELECT COUNT(*) FROM tableB`
8. SCHEMA MAPPING: When querying for a specific product referenced in sales orders, the `sales_order_items` table connects using the `material` column. Never use `product` in `sales_order_items`. Example: `WHERE sales_order_items.material = 'S89...'` or `JOIN products ON products.product = sales_order_items.material`.
9. PROCESS FLOW LOGIC: 
   - A 'Broken Flow' or 'Incomplete Flow' means a Sales Order has a Delivery but NO Billing Document, or a Delivery exists for the SO but the Billing record is missing.
   - Status Codes: In `sales_order_headers`: `overallDeliveryStatus` 'A' (Open/Not yet delivered), 'C' (Completely delivered). The status column `overallOrdReltdBillgStatus` is currently empty.
   - Identifying Incomplete Flows: To correctly find these, you MUST use explicit JOINS between `sales_order_headers`, `outbound_delivery_items`, and `billing_document_items`. 
   - Example (Delivered but not Billed): `SELECT DISTINCT i.referenceSdDocument FROM outbound_delivery_items i LEFT JOIN billing_document_items b ON i.deliveryDocument = b.referenceSdDocument WHERE b.referenceSdDocument IS NULL`
   - Use these joins over row-level status characters when specifically checking for flow consistency across documents.

Step 1: Convert query to SQL.
When provided with a user question, return ONLY the raw SQL query string. No formatting ticks (```), no explanations.
"""

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
    # Truncate the results array so we do not overflow the LLM context limits
    truncated_data = data[:5] if isinstance(data, list) else data
    
    messages = []
    messages.append({
        "role": "system", 
        "content": "You are a helpful AI answering data questions naturally and accurately based on returned SQL data context. Do not output markdown code blocks unless requested. Be concise and helpful."
    })
    
    if history:
        for msg in history[-6:]:
            role = "user" if msg.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("content", "").strip()})
            
    content = f"Target SQL: {sql}\nDatabase returned: {truncated_data}\n\nSummarize the answer to the user's newest question based on this data."
    messages.append({"role": "user", "content": f"New User Question: {question}\n\n{content}"})
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.7,
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
        
    sql = generate_sql(db, question, history)
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

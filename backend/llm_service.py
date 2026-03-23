import os
from dotenv import load_dotenv
import google.generativeai as genai
from sqlalchemy.orm import Session
from sqlalchemy import text

# Load environment variables from .env file
load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

SCHEMA_CONTEXT = """
You are an AI assistant that translates natural language inquiries into SQL queries for an SQLite database containing business entities, and then formats the results into a human-readable response.

The database schema is as follows:
- customers (id TEXT PRIMARY KEY)
- companies (id TEXT PRIMARY KEY)
- accounting_documents (id TEXT PRIMARY KEY)
- billing_documents (
    id TEXT PRIMARY KEY, type TEXT, creation_date DATETIME, last_change_datetime DATETIME,
    total_net_amount FLOAT, currency TEXT, is_cancelled BOOLEAN,
    customer_id TEXT REFERENCES customers(id), company_id TEXT REFERENCES companies(id),
    accounting_document_id TEXT REFERENCES accounting_documents(id)
)

Rules:
1. Do not hallucinate data. Only use what is provided in the schema.
2. If the user's prompt is completely unrelated to business, datasets, or the schema (e.g., "Write a poem", "What is the capital of France?"), you MUST respond EXACTLY with:
   "This system is designed to answer questions related to the provided dataset only."
3. Your final response should ONLY output a single text string based on the current context.
4. Whenever generating a SQL query, you must always append LIMIT 5 to the end of the statement to prevent data overflow.

Step 1: Convert query to SQL.
When provided with a user question, return ONLY the raw SQL query string. No formatting ticks (```), no explanations.
"""

def generate_sql(question: str) -> str:
    model = genai.GenerativeModel('gemini-2.5-flash')
    prompt = f"{SCHEMA_CONTEXT}\n\nUser Question: {question}\n\nReturn EXACTLY the valid SQL query."
    try:
        response = model.generate_content(prompt)
        if response.text:
           sql = response.text.replace("```sql", "").replace("```", "").strip()
           if "This system is designed" in sql:
               return None # Rejection rule
           return sql
    except Exception as e:
        print(f"Gemini API Error in SQL Generation: {e}")
        return "ERROR_API"
    return None

def execute_sql(db: Session, sql: str):
    try:
        result = db.execute(text(sql))
        rows = [dict(row._mapping) for row in result]
        return rows
    except Exception as e:
        return f"Error executing SQL: {e}"

def generate_nl_response(question: str, sql: str, data: list) -> str:
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    # Truncate the results array so we do not overflow the LLM context limits
    truncated_data = data[:5] if isinstance(data, list) else data
    
    prompt = f"User asked: {question}\nTarget SQL: {sql}\nDatabase returned: {truncated_data}\n\nSummarize the answer to the user's question naturally and accurately based on this returned data. Be concise and helpful."
    try:
        response = model.generate_content(prompt)
        return response.text.strip() if response.text else "Failed to generate response."
    except Exception as e:
        print(f"Gemini API Error in NL Generation: {e}")
        return "The backend successfully found your data, but hit a Gemini API quota limit while trying to summarize it. You can view the raw data tables below!"

def process_query(db: Session, question: str):
    if not api_key:
        return {"error": "GEMINI_API_KEY not set", "sql": "", "data": []}
        
    sql = generate_sql(question)
    if sql == "ERROR_API":
        return {"response": "I cannot answer this right now because the Gemini API quota limit (Free Tier) was exceeded. Please wait a moment and try again.", "sql": "", "data": []}
    if not sql:
        return {"response": "This system is designed to answer questions related to the provided dataset only.", "sql": "", "data": []}
        
    data = execute_sql(db, sql)
    if isinstance(data, str) and data.startswith("Error"):
        return {"response": "I encountered an error retrieving that data.", "sql": sql, "data": []}
        
    nl_response = generate_nl_response(question, sql, data)
    return {
        "response": nl_response,
        "sql": sql,
        "data": data
    }

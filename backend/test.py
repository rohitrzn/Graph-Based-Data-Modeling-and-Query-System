import logging
import os
from dotenv import load_dotenv
load_dotenv()

from database import SessionLocal
from llm_service import SCHEMA_CONTEXT, get_dynamic_schema
from groq import Groq

db = SessionLocal()
schema = get_dynamic_schema(db)
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

messages = []
messages.append({
    "role": "system", 
    "content": f"{SCHEMA_CONTEXT}\n\n{schema}\n\nReturn EXACTLY the valid SQL query. Make sure to consider the Conversation History to resolve references. Do not return markdown ticks."
})
messages.append({"role": "user", "content": "New User Question: Can you provide me with the number of products and product plants"})

print("REQUESTING FROM GROQ...")
response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=messages,
    temperature=0.0
)

print("\n--- RAW GROQ OUTPUT ---")
print(response.choices[0].message.content)
print("-----------------------\n")

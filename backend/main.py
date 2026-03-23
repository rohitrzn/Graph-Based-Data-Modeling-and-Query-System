from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db, Base, engine
import graph, llm_service

# Ensure tables are created
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Context Graph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Since this is a local setup
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str

@app.get("/api/graph")
def read_graph_data(db: Session = Depends(get_db)):
    return graph.get_graph_data(db)

@app.post("/api/query")
def execute_query(req: QueryRequest, db: Session = Depends(get_db)):
    if not llm_service.api_key:
        return {
            "response": "GEMINI_API_KEY environment variable is missing. Please set it to use the query interface.",
            "sql": "",
            "data": []
        }
    return llm_service.process_query(db, req.query)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

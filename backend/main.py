from fastapi import FastAPI, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
import os
from database import get_db, engine
import graph, llm_service

app = FastAPI(title="Context Graph API")

cors_origins = os.getenv("CORS_ALLOW_ORIGINS", "*")
allow_origins = ["*"] if cors_origins.strip() == "*" else [o.strip() for o in cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    history: Optional[List[Dict[str, str]]] = []

@app.get("/api/graph")
def read_graph_data(db: Session = Depends(get_db)):
    return graph.get_graph_data(db)

@app.post("/api/query")
def execute_query(req: QueryRequest, db: Session = Depends(get_db)):
    if not llm_service.api_key:
        return {
            "response": "GROQ_API_KEY environment variable is missing. Please set it to use the query interface.",
            "sql": "",
            "data": []
        }
    return StreamingResponse(llm_service.process_query(db, req.query, req.history), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("UVICORN_RELOAD", "false").lower() == "true"
    uvicorn.run("main:app", host=host, port=port, reload=reload)

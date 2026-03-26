# Context Graph Query System

An interactive, LLM-powered SAP Order-to-Cash (O2C) dashboard that combines graph exploration with natural-language data querying.

## Contents
- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Key Technical Decisions](#key-technical-decisions)
- [LLM Strategy and Guardrails](#llm-strategy-and-guardrails)
- [Quick Start](#quick-start)

## Overview
The platform provides two complementary workflows:
- Graph-first exploration through a high-performance 2D force-directed visualization.
- Question-first exploration through an LLM assistant that translates natural language into SQL.

This setup enables users to move smoothly between visual context and query-driven analysis for SAP O2C entities.

## System Architecture

| Layer | Stack | Role |
| :--- | :--- | :--- |
| Frontend | React + `react-force-graph-2d` | Renders an interactive Canvas graph and chat interface. |
| Backend | FastAPI + SQLAlchemy | Serves graph/query APIs, executes SQL, streams responses. |
| Data | SQLite (`graph3.db`) | Stores ingested SAP O2C dataset for low-friction local analysis. |

### Frontend Design: React + `react-force-graph-2d`
- Canvas-based rendering avoids SVG bottlenecks for dense graph scenes and animated flow particles.
- A virtual graph model is used for stable interaction:
    - Backend returns the full graph.
    - Frontend controls a visible subset for readability and performance.

### Backend Design: FastAPI + SQLAlchemy
- FastAPI provides responsive API endpoints for graph operations and LLM-backed query flows.
- SQLAlchemy offers reliable query execution and clean row-to-JSON mapping.

### Database Choice: SQLite
SQLite is used intentionally for this project scope:
1. Zero server setup and excellent portability.
2. Strong performance for read-heavy O2C analysis with multi-table joins.
3. Straightforward relational compatibility with the existing schema.

## Technical Decisions

### 1. Hub-First Initial Graph View
- Problem: Full line-item level rendering creates immediate visual noise.
- Decision: Initial load focuses on 7 document hubs (Business Partners, Sales Orders, Deliveries, Invoices, Payments, Journal Entries, Products).
- Outcome: Users start with a legible business-level map, then drill down on demand.

### 2. Directional Transaction Flow Cues
- Dynamic particles visually encode flow direction (SO -> Delivery -> Invoice).
- This improves scanability of process movement without reading raw metadata.

### 3. Stable Node Expansion
- Item nodes are introduced only when users expand related headers.
- New nodes inherit parent coordinates with slight jitter to avoid layout shock.
- Result: Local expansion feels smooth while preserving global graph stability.

### 4. Metadata Web Toggle (Process vs Data Web)
- Normal Graph (default) shows only directed O2C process edges (Business Partner → Sales Order → Delivery → Invoice → Journal Entry), optimized for a clean "happy path" view.
- The Metadata Web toggle reveals all underlying data relationships (shared product IDs, ship-to addresses, etc.), creating a denser web that supports impact analysis and data discovery.
- Technically, Normal mode applies a strict edge filter for core process links; Metadata mode turns that filter off and surfaces the full relational fabric computed by the backend.

## LLM Strategy and Guardrails

### Prompting Strategy
- Model: Llama-3 via Groq API.
- Approach: Contextual grounding with explicit O2C rules and schema constraints.
- SQL generation constraints:
    - Enforce explicit `LEFT JOIN`/`JOIN` patterns.
    - Return executable SQL only (no markdown wrapping).
    - Keep prompts focused on data retrieval for token efficiency.

### Guardrails
1. Domain restriction: out-of-scope prompts are rejected with a fixed safety response.
2. Read-only intent: query flow is designed for analysis and does not expose mutation workflows.
3. No arbitrary truncation: avoid unrequested `LIMIT` clauses.
4. Memory windowing: keep only recent turns to control context growth.

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- [Groq API Key](https://console.groq.com/) for AI chat features

### Backend
```bash
cd backend
pip install -r requirements.txt
```

Create `.env` in `backend`:
```env
GROQ_API_KEY=your_key_here
```

Run API:
```bash
python main.py
```
Backend default: `http://localhost:8000`

### Frontend
```bash
cd frontend-app
npm install
npm run dev
```
Frontend default: `http://localhost:5173`

---
Made by Rohit


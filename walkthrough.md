# Walkthrough - O2C Graph Expansion

We have successfully expanded the SAP Graph Query System to include **Journal Entries** and **Products**, while significantly improving the visualization's stability and interactive features.

---

## Key Achievements

### 1. Advanced Data Modeling
- **Entities**: Added `journal_entry_items_accounts_receivable` and `products` as first-class nodes.
- **Hybrid Wiring**: Implemented explicit document flow (Sales Order -> Delivery -> Invoice -> Journal Entry) using item-level foreign keys, complemented by a "Universal Fallback" crawler for complete connectivity.

### 2. High-Performance Starburst Visualization
- **Layout Physics Tuning**: Redesigned the D3 physics to mimic the distinct "hub-and-spoke" or starburst patterns seen in professional interfaces.
    - Used a highly negative `charge` (-120) to push distinct clusters apart.
    - Used a tight `linkDistance` (15) to pull connected leaf nodes into structured rings around their hubs.
- **Robust Sizing**: Implemented a multi-stage dimension detection logic with fallback values to ensure the graph always renders correctly, even in complex flex layouts.

### 3. Professional UI/UX Aesthetics
- **Visual Styles**:
    - Transitioned to smaller, more uniform node sizes to prevent visual clutter and overlap.
    - Applied ultra-thin (0.5px), light gray-blue (`#CBD5E1`) connection lines to make the overall graph feel light and legible.

### 4. Premium Dark Mode & Edge Management
- **Dark Theme Interface**: Completely overhauled the entire application interface (`App.jsx`, `ChatPanel.jsx`, and `GraphView.jsx`) to a sleek slate/navy dark mode (`#0B1120`). Node colors were updated to vibrant neon/pastel equivalents to "glow" against the dark background.
- **Theme Toggle**: Introduced a functional Sun/Moon icon toggle in the main header to switch the application between the default "Premium Light Mode" and "Premium Dark Mode".
- **Edge Filtering**: Introduced a "Show Full Metadata Web" floating UI toggle. By default, the graph acts as a clean Order-to-Cash pipeline view. Toggling it on reveals the dense web of universal relational metadata.
- **Flow Particles**: Applied `d3-force` directional particles to explicitly represent data flow on core O2C connections (e.g., from Sales Orders to Deliveries).
- **Node Overlay Polish**: Repositioned the Selected Node overlay to the bottom left under the metadata legend, making it resizable via CSS for easier data reading. Addressed cyclical `d3` rendering crashes ensuring flawless interactions.
- **Hover Interactivity**: The aforementioned Node Details overlay now proactively appears when you **hover** your mouse over a node, allowing for frictionless data surfing.
- **Click-to-Query**: Clicking on any node instantly triggers a handshake with the Query Assistant, cleanly hiding the details overlay and appending the node's type and ID string directly into your chat input ready to send (e.g., `Sales Orders: 934520`).
- **Aesthetic Refinements**: Changed the physical coloring of "Products" to distinct brown/amber shades to prevent visual clashing with the yellow of "Sales Orders".

### Intelligent Viewport Tooltips
The node details overlay was refactored into a high-performance floating tooltip.
*   **Viewport Aware**: The tooltip dynamically tracks cursor positioning and automatically flips upward or leftward if it approaches the edge of the viewport, ensuring that dense info boxes are never cut off by the screen bounds.

---

## Visual Verification

![Premium Light Mode](walkthrough-images/node_selected_confirm_1774440213236.png)
*Figure 1: The Resizable Node Overlay positioned below the legend in Light Mode.*

---

## 5. LLM Query Assistant Enhancements
- **Memory Context Window**: The Query Assistant now intelligently restricts conversation memory to the latest 6 messages (3 turns). This prevents LLM context bloat and ensures the AI focuses strictly on the immediate back-and-forth query chain.
- **SQL Generation Governance**:
   - **No Random Limits**: The system prompt now strictly forbids appending `LIMIT 5` or similar filters to standard queries, ensuring that results match the broad datasets displayed on the graph unless specific limits are requested (e.g., "Top 5 payments").
   - **Modern Join Syntax**: The LLM is forced to use explicit `LEFT JOIN` / `JOIN` architecture rather than comma-separated implicit joins (`FROM tableA, tableB`). This guarantees SQL stability on the SQLite runner.
- **Visual Graph Awareness**: Embedded direct knowledge of the "Order-to-Cash (O2C)" flow into the LLM logic, ensuring it provides answers that complement the exact data entities represented as nodes (Business Partners, Invoices, Deliveries, etc.) on the React canvas.

![Premium Dark Mode Graph](walkthrough-images/graph_verification_dark_mode_1774438530946.png)
*Figure 2: The Premium Dark Mode overhaul featuring neon nodes, interactive edge toggles, and animated flow particles.*

![Node selection details](walkthrough-images/media__1774525086544.png)
*Figure 3: Clicking a node opens the metadata overlay, providing a complete view of the SAP document data.*

### Phase 1: Interactive Neighborhood Highlighting
We have refined the graph's interactivity with a three-tier input model:
*   **Left-Click (Toggle)**: Instantly highlights or unhighlights the selected node and its directly connected neighbors.
*   **Right-Click (Copy)**: Identifies the node entity and copies its summary (Type + ID) directly into the Chat Assistant's input field for rapid querying.
*   **Visual Balance**: Highlighted nodes retain their native colors (Orange, Red, Blue) but feature a 25% size amplification and intensive glows.

---

### Phase 2: Refined Master-Detail Expansion & Highlighting
We have perfected the deep exploration flow and interaction consistency:
*   **7 Core Entities**: The graph starts with clear clusters for exactly **7 document types**: Invoices, Business Partners, Journal Entries, Deliveries, Payments, Products, and Sales Orders.
*   **Stable Interaction**: Clicking nodes for highlighting is now rock-solid with **zero teleportation**. Coordinate preservation ensures that the viewport remains steady.
*   **Deep Highlighting Intelligence**:
    - The AI now lists **all relevant entities** (e.g., all 8 business partners) without truncation.
    - Automated highlighting now uses both **metadata column matching** and **ID-parentheses extraction**, ensuring that every mention in the chat reflects visually on the graph.

![Final 7 Entity View](walkthrough-images/graph_layout_verification_1774512893898.png)
*Figure 4: The initial state showing the beautifully dense, restored interconnected web.*

![Highlighted Partners](walkthrough-images/media__1774525009141.png)
*Figure 5: A successful 'highlight all' command showing all 8 business partners glowing simultaneously.*

---

### Phase 3: LLM Quality & Guardrail Verification
We have rigorously tested the backend intelligence to ensure it meets the O2C domain requirements:
*   **Complex O2C Analytics**: The system accurately calculates product-billing statistics and traces document chains across 4+ tables.
*   **Broken-Flow Detection**: Automated detection of Sales Orders that are 'Delivered but not Billed' (e.g., SO 740506).
*   **Strict Guardrails**: Any out-of-domain requests (e.g., general knowledge) are met with the mandatory security rejection: *"This system is designed to answer questions related to the provided dataset only."*

| Scenario | Result | Image |
| :--- | :--- | :--- |
| **Highest Billed Products** | Success | ![Products](walkthrough-images/highest_billing_documents_response_1774513945774.png) |
| **Broken Flow Detection** | Success | ![Broken Flows](walkthrough-images/broken_flows_response_1774514158020.png) |
| **Trace Flow (SO 740506)** | Success | ![Trace Flow](walkthrough-images/trace_flow_740506_response_1774514036859.png) |
| **Domain Guardrail** | Success | ![Guardrail](walkthrough-images/guardrail_test_response_1774514232083.png) |


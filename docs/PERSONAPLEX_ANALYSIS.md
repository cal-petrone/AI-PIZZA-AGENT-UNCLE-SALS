# PersonaPlex Integration — Repo Analysis

## 1. Core agent entrypoints

| Entrypoint | File | Purpose |
|------------|------|---------|
| **HTTP server** | `server.js` | Express app, Twilio webhooks, health, dashboards |
| **Voice webhook** | `server.js` → `app.post('/incoming-call')` | Twilio "A call comes in" → returns TwiML, connects to Media Stream |
| **Media Stream** | `server.js` → WebSocket `/media-stream` | Twilio streams audio; server forwards to OpenAI Realtime and back |
| **Conversation flow** | `server.js` → `connectToOpenAI(sid, order)` | Single async function: fetches menu, opens OpenAI Realtime WebSocket, sends `session.update` (tools, instructions), handles all events (response.create, tool calls, audio delta), updates `activeOrders`, calls `logOrder` |

**Conclusion:** The only conversation entrypoint is inside `connectToOpenAI`. All business logic (menu, tools, order, logging) is invoked from there or from callbacks triggered by OpenAI events.

---

## 2. Multi-tenant company resolution (current)

- **Today:** No real multi-tenant resolution in code.
  - `getStoreConfig(calledNumber)` is **called** in `server.js` (Media Stream handler) but **never defined** in the repo → always `undefined`/missing, so `storeConfig` is often `null`.
  - `DEFAULT_CLIENT_SLUG` (env) is used only for analytics (call logging), not for menu or persona.
  - In practice, **one Railway deployment per company** (Uncle Sal’s vs Tazza) with different env vars (e.g. `GOOGLE_SHEETS_ID`). Company is implied by deployment, not by request.

- **Needed for PersonaPlex:** Config-driven company resolution so the same codebase can serve multiple companies. Add:
  - `config/companies/` with one folder per company (e.g. `uncle_sals`, `tazza_pizza`).
  - `getStoreConfig(calledNumber)` implemented to map phone number → company id → store config (name, location, taxRate, persona path, etc.).
  - Company id / store config passed into conversation engine and tools so behavior and persona are company-specific.

---

## 3. Google Sheets service layer

- **Module:** `integrations/google-sheets.js`
- **Exports used by server.js:**
  - `calculateOrderTotals(items, taxRate)` — used for totals and logging
  - `computeFinalTotal(orderItems)`
  - `logOrderToGoogleSheets(order, storeConfig)` — writes order to sheet (name, phone, pickup/delivery, address, price, order details)
  - Sheet names and structure are driven by env (`GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_MENU_SHEET`, etc.) and fixed column semantics; no per-company schema in code.
- **Menu fetch:** `fetchMenuFromGoogleSheets()` lives in **server.js** (not in google-sheets.js); it uses the same credentials/sheet ID and builds `menu`, `menuText`, `wingOptions`, etc.
- **Conclusion:** Order logging and totals must remain as-is (same functions, same schema). PersonaPlex integration must not change Sheet schema or logging behavior; any new engine must call the same helpers.

---

## 4. Existing conversation / response generation

- **Model:** OpenAI Realtime API (WebSocket) in `server.js`:
  - `session.update` sends tools (add_item_to_order, set_delivery_method, set_address, set_customer_name, confirm_order, get_item_description), instructions (from `buildCompactInstructions(order, menu, context)`), and turn_detection.
  - Responses are streamed as `response.output_item.delta` (audio) and tool calls in `response.content_part.added`.
- **Instructions:** Built in `server.js` from `getCoreRulesPrompt()`, `buildCompactInstructions()`, and menu text. No company-specific persona files today.
- **Conclusion:** The “conversation engine” today is effectively “OpenAI Realtime + server.js event handlers.” To add PersonaPlex as a pluggable layer we need an abstraction (e.g. `IConversationEngine`) and a default engine that wraps this existing behavior, plus a PersonaPlex engine (adapter to external PersonaPlex service) that can be swapped in per company when configured.

---

## 5. PersonaPlex (NVIDIA) — external service

- **What it is:** Python-based, GPU-oriented, full-duplex speech-to-speech (Moshi-based). Runs as `python -m moshi.server` with Web UI (e.g. port 8998). Uses text prompts and voice prompts (.pt); supports customer-service style personas.
- **Integration constraint:** No documented headless REST/WebSocket API for server-to-server use. Integration options:
  - **Option A:** Run PersonaPlex as a sidecar and implement a **gateway** (Node or Python) that exposes a stable API (e.g. HTTP or WebSocket) and translates to/from PersonaPlex (audio + prompts). Our code then talks only to the gateway.
  - **Option B:** Implement a **PersonaPlexConversationEngine** in this repo that:
    - Calls a configurable gateway URL (e.g. `PERSONAPLEX_GATEWAY_URL`).
    - On success, uses the gateway’s response (e.g. audio/text) in the same pipeline as today.
    - On failure/timeout/disabled, falls back to the existing default engine so all companies keep working.

**Conclusion:** We implement Option B: pluggable engine interface, default engine = current behavior, PersonaPlex engine = gateway client with fallback. No change to Twilio contracts or Google Sheets; PersonaPlex is optional and config-driven per company.

---

## 6. Summary

- **Entrypoints:** `server.js` (incoming-call, media-stream, connectToOpenAI).
- **Multi-tenant:** Add config-driven company resolution and `getStoreConfig`; company id + store config feed engine and tools.
- **Sheets:** Keep `integrations/google-sheets.js` and all call sites unchanged; no schema or column changes.
- **Conversation:** Abstract behind `IConversationEngine`; default engine = current OpenAI Realtime path; PersonaPlex engine = gateway adapter with fallback.
- **PersonaPlex:** Treated as external service behind a gateway; this repo only adds the adapter and config surface so all companies can opt in via config and env without code duplication.

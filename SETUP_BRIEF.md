# PersonaPlex Pizza Receptionist Bot — Setup Brief

## Project Overview

Pizza receptionist bot using:

- **PersonaPlex** (NVIDIA speech-to-speech AI)
- **Twilio** (phone integration)
- **Google Sheets** (order logging)
- **Railway** (deployment)
- **Node.js agent** (this repo) + **PersonaPlex gateway** (in-repo)

The agent and gateway are in this repo. PersonaPlex (NVIDIA) runs separately (e.g. your machine with GPU or a GPU host) and is connected via the gateway.

---

## Architecture

```
Incoming Call (Twilio)
    ↓
Twilio Webhook → Node.js Agent (server.js)
    ↓
Agent starts session with PersonaPlex Gateway (POST /session/start)
    ↓
Agent opens WebSocket to Gateway → Gateway forwards to PersonaPlex Server
    ↓
Speech-to-speech AI response (PersonaPlex)
    ↓
Audio back: PersonaPlex → Gateway → Agent → Twilio → Caller
    ↓
Order logging in Agent → Google Sheets (unchanged)
```

- **Agent:** Handles Twilio Media Stream, company config, tools; when `CONVERSATION_ENGINE=personaplex` it uses the gateway and streams audio to/from it.
- **Gateway:** `services/personaplex-gateway/` — bridges agent ↔ PersonaPlex WebSocket. Deploy as a second Railway service.
- **PersonaPlex:** Run separately (see “Run PersonaPlex” below); expose its WebSocket and set `PERSONAPLEX_WEBSOCKET_URL` on the gateway.

---

## Installation Requirements

### Prerequisites

- **Node.js 18+** (for agent and gateway)
- **This repo** (agent + gateway in one repo)
- **PersonaPlex** (NVIDIA): clone and run separately when you want voice from PersonaPlex

```bash
# This repo (agent + gateway)
git clone <your-repo>
cd ai
npm install

# Gateway (separate deploy root)
cd services/personaplex-gateway
npm install
```

### Environment Variables

**Agent (main app / DEMO):**

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI (used when PersonaPlex is off or as fallback) |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio |
| `CONVERSATION_ENGINE` | No | `default` or `personaplex` (default: `default`) |
| `PERSONAPLEX_GATEWAY_URL` | If personaplex | Gateway URL (e.g. `https://personaplex-gateway.railway.app`), no trailing slash |
| Google Sheets vars | As needed | `GOOGLE_SHEETS_ID`, credentials path or base64, etc. |

**Gateway (Railway service):**

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Railway sets this (default 3010) |
| `GATEWAY_PUBLIC_URL` | No | Public URL of this gateway (optional; can use request Host) |
| `PERSONAPLEX_WEBSOCKET_URL` | For voice | PersonaPlex server WebSocket (e.g. `wss://your-personaplex.ngrok.io/ws`) |

**PersonaPlex (when you run it):**

| Variable | Required | Description |
|----------|----------|-------------|
| `HF_TOKEN` | Yes | Hugging Face token (accept PersonaPlex model license first) |

---

## Pizza Shop Prompt Template

Use this style for your receptionist persona (in PersonaPlex text prompt or in `config/companies/<id>/persona.json`):

```
You work for [SHOP_NAME] and your name is [RECEPTIONIST_NAME].
Information:
- Hours: 11 AM - 11 PM daily
- Menu: Margherita ($12), Pepperoni ($14), Vegetarian ($13)
- Delivery: 30-45 minutes
- Payment: Card and Cash
- Phone: [PHONE_NUMBER]
Be friendly, professional, and help customers place orders or answer questions.
```

Company-specific prompts live in `config/companies/<company_id>/persona.json` (role, tone, business_rules, greeting). The agent sends that persona to the gateway at session start.

---

## Voice Selection (PersonaPlex)

When running PersonaPlex (NVIDIA), use:

- **NATF1.pt** — natural female voice, professional tone  
- **NATM0.pt** — natural male voice  

Configure in PersonaPlex (e.g. `--voice-prompt NATF1.pt` or via its Web UI).

---

## Deployment Steps

1. **Hugging Face:** Create account, accept PersonaPlex model license, get `HF_TOKEN`.
2. **Railway – Gateway:** In the same project as your agent, add a new service from this repo; set **Root Directory** to `services/personaplex-gateway`. Deploy and **Generate Domain**. Copy the gateway URL.
3. **Railway – Agent:** In the **agent** service Variables, set `CONVERSATION_ENGINE=personaplex` and `PERSONAPLEX_GATEWAY_URL=<gateway URL>` (no trailing slash). Redeploy.
4. **PersonaPlex (when ready):** Run PersonaPlex somewhere (e.g. machine with GPU, or cloud GPU). Expose its WebSocket (e.g. ngrok). In the **gateway** service Variables, set `PERSONAPLEX_WEBSOCKET_URL` to that WebSocket URL. Redeploy gateway.
5. **Twilio:** Webhook already points at your agent; no change needed if you’re already receiving calls.
6. **Google Sheets:** Already configured in the agent; no change for PersonaPlex.

Detailed click-by-click: **`docs/RAILWAY_PERSONAPLEX_CLICK_BY_CLICK.md`**.

---

## Testing Flow

1. **Agent + gateway only:** Deploy gateway and set agent vars. Call the number; agent will use the gateway (you may hear silence until PersonaPlex is connected).
2. **PersonaPlex locally:**  
   `SSL_DIR=$(mktemp -d); HF_TOKEN=... python -m moshi.server --ssl "$SSL_DIR" --cpu-offload`  
   Open Web UI (e.g. https://localhost:8998). Test voice/prompt there.
3. **Full flow:** Expose PersonaPlex WebSocket (e.g. ngrok), set `PERSONAPLEX_WEBSOCKET_URL` on the gateway, redeploy. Call again; you should hear PersonaPlex.
4. **Fallback:** If the gateway is down or PersonaPlex is not set, the agent falls back to the default (OpenAI) engine so calls still work.

---

## Known Considerations

- **PersonaPlex** benefits from a GPU for real-time performance. Use `--cpu-offload` if GPU memory is limited (requires `accelerate`).
- **Railway:** The gateway runs on Railway (no GPU). PersonaPlex runs elsewhere (your machine or a GPU host); connect via `PERSONAPLEX_WEBSOCKET_URL`.
- **libopus-dev:** Required to run PersonaPlex (NVIDIA); not needed for the Node agent or gateway.
- **Model license:** PersonaPlex weights are under the NVIDIA Open Model License; accept on Hugging Face before use.

---

## File Reference

| Item | Location |
|------|----------|
| Agent entrypoint | `server.js` |
| PersonaPlex gateway | `services/personaplex-gateway/` |
| Company config & persona | `config/companies/<company_id>/` |
| Railway deploy (click-by-click) | `docs/RAILWAY_PERSONAPLEX_CLICK_BY_CLICK.md` |
| PersonaPlex run & phone setup | `docs/PERSONAPLEX_PHONE_SETUP.md` |

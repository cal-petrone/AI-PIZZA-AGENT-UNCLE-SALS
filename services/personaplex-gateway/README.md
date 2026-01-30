# PersonaPlex Gateway

Bridges your AI agent (Twilio audio) to PersonaPlex. Deploy this as a **separate Railway service** and set your agent’s `PERSONAPLEX_GATEWAY_URL` to this service’s URL.

## Env vars (Railway or .env)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default 3010). Railway sets this. |
| `GATEWAY_PUBLIC_URL` | No | Public URL of this gateway (e.g. `https://personaplex-gateway.railway.app`). If unset, the gateway uses the request Host. |
| `PERSONAPLEX_WEBSOCKET_URL` | For voice | PersonaPlex server WebSocket URL (e.g. `wss://your-personaplex.ngrok.io/ws`). If unset, agent audio is received but not forwarded (call may be silent until you connect PersonaPlex). |

## Deploy to Railway (same repo, different service)

1. In your Railway project, add a **new service**.
2. Connect the **same GitHub repo** as your agent.
3. Set **Root Directory** to `services/personaplex-gateway`.
4. Set **Start Command** to `npm start` (or leave default).
5. Add variables: `GATEWAY_PUBLIC_URL` = your gateway’s public URL (Railway gives you a URL; use that). Optionally `PERSONAPLEX_WEBSOCKET_URL` when you have PersonaPlex running.
6. Deploy. Copy the service URL (e.g. `https://personaplex-gateway-production.up.railway.app`).
7. In your **agent** service variables, set `PERSONAPLEX_GATEWAY_URL` to that URL (no trailing slash).

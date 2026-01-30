# Click-by-Click: Put PersonaPlex Into Your Railway (So It Works on Your Phone Call)

The repo now includes a **PersonaPlex gateway** in `services/personaplex-gateway/`. Do **Part A** to deploy the gateway, then **Part B** to point your agent at it. Use your **base/DEMO** project if you want all clients to get it.

---

## Part A: Deploy the gateway (new Railway service)

### A1. Open Railway

1. Go to **https://railway.app** and log in.
2. Open the **project** where your AI agent runs (e.g. DEMO or Uncle Sal’s).

### A2. Add a new service

1. In the project, click **+ New** (or **Add Service**).
2. Choose **GitHub Repo** (or **Empty Service** if you prefer to connect repo later).
3. If GitHub: select the **same repo** as your agent (the one with the pizza agent code). Confirm.
4. A new service is created. Click it to open.

### A3. Set root directory to the gateway

1. In the new service, open **Settings** (or the **Settings** tab).
2. Find **Root Directory** (or **Build** / **Deploy** settings).
3. Set **Root Directory** to exactly:  
   **`services/personaplex-gateway`**  
   **Do not type quotes** — use only the path. (So Railway runs the gateway, not the main app.)
4. **Start Command** (if shown): leave as `npm start` or set to `node index.js`. The gateway also has `railway.json` so Railway knows how to build and start.
5. Save (e.g. **Apply changes**). Redeploy after saving.

### A4. Deploy and get the gateway URL

1. Go to the **Deployments** tab.
2. Trigger a deploy if needed (e.g. **Deploy** or **Redeploy**). Wait until it shows **Success** / **Active**.
3. Open **Settings** → **Networking** (or **Generate Domain**). Click **Generate Domain** if you don’t have a public URL yet.
4. Copy the **public URL** (e.g. `https://personaplex-gateway-production-xxxx.up.railway.app`). This is your **gateway URL**. No trailing slash.

### A5. (Optional) Set gateway variables

1. In the **gateway** service, open **Variables**.
2. **GATEWAY_PUBLIC_URL** (optional): set to the same URL you copied (e.g. `https://personaplex-gateway-production-xxxx.up.railway.app`). This is only needed if the URL Railway gives you is different from the request Host.
3. **PERSONAPLEX_WEBSOCKET_URL** (optional for now): when you have PersonaPlex running somewhere (e.g. with ngrok), set this to its WebSocket URL (e.g. `wss://your-personaplex.ngrok.io/ws`). Until then, the call will connect to the gateway but you may hear silence until PersonaPlex is connected.

---

## Part B: Point your agent at the gateway

### B1. Open your agent service

1. In the **same** Railway project, click the **service** that runs your Node.js AI agent (not the gateway).

### B2. Open Variables

1. Click **Variables** (or **Settings** → **Variables**).

### B3. Add or edit these two variables

1. **CONVERSATION_ENGINE**  
   - Value: `personaplex`

2. **PERSONAPLEX_GATEWAY_URL**  
   - Value: the **gateway URL** you copied in A4 (e.g. `https://personaplex-gateway-production-xxxx.up.railway.app`).  
   - No trailing slash.

3. Save. Railway will redeploy the agent.

### B4. Wait for redeploy

1. Go to **Deployments** for the agent service.
2. Wait until the latest deployment is **Success** / **Active**.

---

## You’re done

- **Gateway** is running as a second service; your **agent** is configured to use it.
- When you call your Twilio number, the agent will start a session with the gateway and stream audio to it. If you set **PERSONAPLEX_WEBSOCKET_URL** on the gateway to a running PersonaPlex server, you’ll hear PersonaPlex on the call. If not, the call may be silent until you connect PersonaPlex (or the agent will fall back to the default engine if the gateway fails).

---

## Quick checklist

| Part | Step | What you did |
|------|------|------------------|
| A | A1 | Opened Railway and the project |
| A | A2 | Added a new service from the same GitHub repo |
| A | A3 | Set **Root Directory** to `services/personaplex-gateway` |
| A | A4 | Deployed and copied the gateway’s public URL |
| A | A5 | (Optional) Set GATEWAY_PUBLIC_URL and PERSONAPLEX_WEBSOCKET_URL on the gateway |
| B | B1–B4 | On the **agent** service, set CONVERSATION_ENGINE=personaplex and PERSONAPLEX_GATEWAY_URL to the gateway URL; waited for redeploy |

---

## Connecting PersonaPlex (NVIDIA) for real voice

To hear PersonaPlex (NVIDIA) on the call:

1. Run PersonaPlex somewhere (e.g. your machine with GPU, or a cloud GPU). See `docs/PERSONAPLEX_PHONE_SETUP.md` Part 3.
2. Expose its WebSocket (e.g. with ngrok: `ngrok http 8998` and use the `wss://` URL for the WebSocket path PersonaPlex uses).
3. In the **gateway** service on Railway, set **PERSONAPLEX_WEBSOCKET_URL** to that WebSocket URL.
4. Redeploy the gateway if needed.

The gateway in this repo expects PersonaPlex to speak the same JSON format: `{ type: 'audio', payload: '<base64>' }`. If PersonaPlex uses a different protocol, the gateway may need a small update to translate (see `services/personaplex-gateway/index.js`).

/**
 * PersonaPlex Gateway
 * - POST /session/start: agent starts a call session; returns wsUrl for audio streaming.
 * - WebSocket /session/:sessionId/ws: agent sends Twilio audio here; gateway can forward to PersonaPlex and return audio.
 * Set PERSONAPLEX_WEBSOCKET_URL to connect to a running PersonaPlex server (e.g. wss://your-personaplex.ngrok.io/ws).
 * Set GATEWAY_PUBLIC_URL (e.g. https://personaplex-gateway.railway.app) so the returned wsUrl is correct.
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = parseInt(process.env.PORT || '3010', 10);
const GATEWAY_PUBLIC_URL = process.env.GATEWAY_PUBLIC_URL || '';
const PERSONAPLEX_WEBSOCKET_URL = process.env.PERSONAPLEX_WEBSOCKET_URL || '';

const app = express();
app.use(express.json());

const sessions = new Map(); // sessionId -> { createdAt, agentWs?, personaplexWs? }

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'personaplex-gateway', ts: new Date().toISOString() });
});

app.post('/session/start', (req, res) => {
  const { sessionId, company_id, companyContext, order } = req.body || {};
  const id = sessionId || `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  sessions.set(id, { createdAt: Date.now() });

  const host = GATEWAY_PUBLIC_URL ? GATEWAY_PUBLIC_URL.replace(/^https?:\/\//, '').replace(/\/$/, '') : (req.headers.host || 'localhost:' + PORT);
  const wsUrl = `wss://${host}/session/${id}/ws`;

  console.log(`[gateway] session/start sessionId=${id} company_id=${company_id || 'n/a'} wsUrl=${wsUrl}`);
  res.status(200).json({ ok: true, sessionId: id, wsUrl });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`).pathname;
  const match = pathname.match(/^\/session\/([^/]+)\/ws$/);
  if (!match) {
    socket.destroy();
    return;
  }
  const sessionId = match[1];
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, sessionId);
  });
});

wss.on('connection', (ws, request, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    ws.close(4000, 'session not found');
    return;
  }
  session.agentWs = ws;
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'audio' && msg.payload) {
        if (session.personaplexWs && session.personaplexWs.readyState === 1) {
          session.personaplexWs.send(JSON.stringify({ type: 'audio', payload: msg.payload }));
        }
        // If no PersonaPlex connected, we don't send audio anywhere (caller may hear silence until PersonaPlex is wired)
      }
    } catch (e) {
      // ignore
    }
  });
  ws.on('close', () => {
    session.agentWs = null;
    if (session.personaplexWs) {
      try { session.personaplexWs.close(); } catch (_) {}
      session.personaplexWs = null;
    }
  });

  if (PERSONAPLEX_WEBSOCKET_URL) {
    try {
      const personaplexWs = new (require('ws'))(PERSONAPLEX_WEBSOCKET_URL, { rejectUnauthorized: false });
      session.personaplexWs = personaplexWs;
      personaplexWs.on('open', () => console.log(`[gateway] PersonaPlex connected for session ${sessionId}`));
      personaplexWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'audio' && msg.payload && session.agentWs && session.agentWs.readyState === 1) {
            session.agentWs.send(JSON.stringify({ type: 'audio', payload: msg.payload }));
          }
        } catch (_) {}
      });
      personaplexWs.on('close', () => { session.personaplexWs = null; });
      personaplexWs.on('error', (err) => { console.warn('[gateway] PersonaPlex WS error:', err.message); session.personaplexWs = null; });
    } catch (err) {
      console.warn('[gateway] Could not connect to PersonaPlex:', err.message);
    }
  } else {
    console.log(`[gateway] No PERSONAPLEX_WEBSOCKET_URL; agent audio received but not forwarded. Set it to connect to PersonaPlex.`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PersonaPlex gateway listening on port ${PORT}`);
  if (!GATEWAY_PUBLIC_URL) console.log('Using request Host for wsUrl (set GATEWAY_PUBLIC_URL to override, e.g. https://your-gateway.railway.app)');
  if (!PERSONAPLEX_WEBSOCKET_URL) console.warn('Set PERSONAPLEX_WEBSOCKET_URL to connect to PersonaPlex (e.g. wss://your-personaplex.ngrok.io/ws)');
});

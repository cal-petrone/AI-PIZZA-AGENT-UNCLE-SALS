# Real-Time AI Pizza Ordering Assistant

Production-ready AI phone receptionist for pizza shops using Twilio Media Streams and OpenAI Realtime API.

## Features

- ✅ **Real-time conversation** - Low-latency audio streaming (no "record → HTTP → speak" delays)
- ✅ **Natural interruptions** - Customers can interrupt the AI mid-sentence
- ✅ **Robust error handling** - Graceful recovery from network issues, API failures
- ✅ **Idempotent logging** - Prevents duplicate orders with retry logic
- ✅ **Production-ready** - Structured logging, health checks, environment validation
- ✅ **Modular architecture** - Clean, testable, maintainable code

## Architecture

```
┌─────────────┐
│   Twilio    │
│   Phone     │
└──────┬──────┘
       │
       │ HTTP POST (TwiML)
       ▼
┌─────────────────┐
│  Express Server │
│  /incoming-call │
└──────┬──────────┘
       │
       │ WebSocket (Media Stream)
       ▼
┌─────────────────┐      ┌──────────────┐
│  Media Stream   │◄─────►│   OpenAI     │
│     Handler     │       │  Realtime    │
└──────┬──────────┘       └──────────────┘
       │
       │ Order Data
       ▼
┌─────────────────┐
│  Order Manager  │
└──────┬──────────┘
       │
       │ Finalized Order
       ▼
┌─────────────────┐
│  Logger Service │
│  (Zapier)       │
└─────────────────┘
```

## Project Structure

```
.
├── src/
│   ├── config/
│   │   └── menu.js              # Menu configuration
│   ├── routes/
│   │   ├── incoming-call.js     # Twilio webhook handler
│   │   ├── media-stream.js      # WebSocket handler
│   │   └── health.js             # Health check endpoint
│   ├── services/
│   │   ├── order-manager.js      # Order state management
│   │   ├── openai-service.js    # OpenAI Realtime API client
│   │   └── logger.js             # Zapier logging with retries
│   └── utils/
│       └── validation.js         # Environment validation
├── tests/
│   ├── order-manager.test.js     # Order logic tests
│   └── menu.test.js              # Menu tests
├── server-new.js                 # Main server (new modular version)
├── server.js                      # Original server (legacy)
├── .env                          # Environment variables
└── package.json
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file:

```env
# Required
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
OPENAI_API_KEY=your_openai_api_key
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/your/webhook/url
PORT=3000

# Optional
GOOGLE_SHEETS_CREDENTIALS_PATH=./google-credentials.json
GOOGLE_SHEETS_ID=your_google_sheets_id
NGROK_URL=https://your-ngrok-url.ngrok.io
```

### 3. Start Server

```bash
npm start
```

Or use the new modular server:

```bash
node server-new.js
```

### 4. Expose with ngrok

In a separate terminal:

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### 5. Configure Twilio

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to Phone Numbers → Manage → Active Numbers
3. Click on your phone number
4. Under "Voice & Fax", set:
   - **A CALL COMES IN**: Webhook
   - **URL**: `https://your-ngrok-url.ngrok.io/incoming-call`
   - **HTTP**: POST

### 6. Test

Call your Twilio number and place a test order!

## API Endpoints

### `POST /incoming-call`
Twilio webhook that returns TwiML to start Media Stream.

**Request**: Twilio webhook payload  
**Response**: TwiML XML

### `GET /health`
Health check endpoint for monitoring.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-06T21:30:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

### `WebSocket /media-stream`
WebSocket endpoint for Twilio Media Streams.

**Connection**: Twilio automatically connects when call starts  
**Messages**: Audio data and stream events

## Order Flow

1. **Call starts** → Twilio connects WebSocket → Server connects to OpenAI
2. **AI greets** → "Thanks for calling Uncle Sal's Pizza! What would you like to order?"
3. **Customer orders** → AI uses tools to add items to order
4. **Follow-up questions** → Size, quantity, delivery method, address
5. **Order summary** → AI reads back complete order with totals
6. **Customer confirmation** → "Yes, that's correct"
7. **Order logged** → Sent to Zapier webhook with retry logic
8. **Call ends** → Cleanup and resource release

## Error Handling

- **Network failures**: Automatic retry with exponential backoff
- **API errors**: Graceful degradation, fallback responses
- **Duplicate orders**: Idempotency checks prevent duplicate logging
- **Connection drops**: Automatic cleanup, order logged on close if ready

## Testing

Run tests:

```bash
npm test
```

Or manually:

```bash
node tests/order-manager.test.js
node tests/menu.test.js
```

## Production Checklist

- [ ] Environment variables validated at startup
- [ ] Health check endpoint configured for monitoring
- [ ] Error logging to external service (optional)
- [ ] Rate limiting on webhook endpoints (optional)
- [ ] SSL/TLS certificate (use ngrok or deploy to HTTPS server)
- [ ] Process manager (PM2, systemd, etc.)
- [ ] Log rotation configured
- [ ] Monitoring/alerting setup

## Troubleshooting

### Server won't start
- Check environment variables are set correctly
- Verify `.env` file exists and is readable
- Check port 3000 is not in use

### Calls not connecting
- Verify ngrok is running and URL is correct
- Check Twilio webhook URL is set correctly
- Verify firewall allows incoming connections

### OpenAI connection fails
- Check `OPENAI_API_KEY` is valid
- Verify API key has Realtime API access
- Check network connectivity

### Orders not logging
- Verify `ZAPIER_WEBHOOK_URL` is correct
- Check Zapier webhook is active
- Review server logs for error messages

## License

ISC






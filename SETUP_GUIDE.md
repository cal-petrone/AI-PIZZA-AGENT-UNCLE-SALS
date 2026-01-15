# Setup Guide - Real-Time AI Pizza Ordering Assistant

Step-by-step instructions to get your production-ready AI phone receptionist running.

## Prerequisites

- Node.js 18+ installed
- Twilio account with a phone number
- OpenAI API key with Realtime API access
- Zapier account (or webhook URL)
- ngrok installed (for local development)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment Variables

Create a `.env` file in the project root:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here

# OpenAI Configuration
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Zapier Webhook (for order logging)
ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/xxxxx/xxxxx

# Server Configuration
PORT=3000

# Optional: Google Sheets (if using)
GOOGLE_SHEETS_CREDENTIALS_PATH=./google-credentials.json
GOOGLE_SHEETS_ID=your_sheet_id_here

# Optional: ngrok URL (auto-detected if not set)
NGROK_URL=https://your-ngrok-url.ngrok.io
```

**Important**: Never commit `.env` to version control!

## Step 3: Get Your API Keys

### Twilio
1. Go to [Twilio Console](https://console.twilio.com)
2. Copy your **Account SID** and **Auth Token** from the dashboard
3. Purchase a phone number (if you don't have one)

### OpenAI
1. Go to [OpenAI Platform](https://platform.openai.com)
2. Create an API key
3. Ensure you have access to the Realtime API (may require waitlist)

### Zapier
1. Create a Zap with a "Catch Hook" trigger
2. Copy the webhook URL
3. Set up your action (Google Sheets, email, etc.)

## Step 4: Start the Server

### Option A: Use New Modular Server (Recommended)

```bash
node server-new.js
```

### Option B: Use Original Server

```bash
npm start
```

You should see:
```
✓ Environment variables validated
🚀 Server running on port 3000
📞 Incoming call webhook: POST /incoming-call
📡 Media stream WebSocket: /media-stream
❤️  Health check: GET /health
✓ Server initialized and ready to accept calls
```

## Step 5: Expose with ngrok

In a **separate terminal**:

```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

## Step 6: Configure Twilio Webhook

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your phone number
4. Scroll to **Voice & Fax** section
5. Under **A CALL COMES IN**, set:
   - **Webhook**: `https://abc123.ngrok.io/incoming-call`
   - **HTTP**: `POST`
6. Click **Save**

## Step 7: Test the System

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-01-06T21:30:00.000Z",
  "uptime": 3600,
  "environment": "development"
}
```

### Test 2: Make a Call

1. Call your Twilio phone number
2. You should hear: "Thanks for calling Uncle Sal's Pizza! What would you like to order today?"
3. Try ordering: "I'd like a large pepperoni pizza"
4. AI should confirm and ask follow-up questions
5. Complete an order and verify it logs to Zapier

## Step 8: Verify Order Logging

1. Check your Zapier webhook logs
2. Verify the order data structure:
   ```json
   {
     "callSid": "CAxxxxx",
     "timestamp": "2024-01-06T21:30:00.000Z",
     "customerName": "John Doe",
     "items": [...],
     "total": 25.99,
     "status": "completed"
   }
   ```

## Troubleshooting

### Server won't start
- **Error**: "Missing required environment variables"
  - **Fix**: Check your `.env` file has all required variables

- **Error**: "Port 3000 already in use"
  - **Fix**: Change `PORT` in `.env` or kill the process using port 3000

### Calls not connecting
- **Issue**: Call connects but no audio
  - **Check**: ngrok is running and URL is correct
  - **Check**: Twilio webhook URL matches ngrok URL
  - **Check**: Server logs for connection errors

- **Issue**: "Connection refused"
  - **Fix**: Ensure server is running
  - **Fix**: Verify ngrok is forwarding correctly

### OpenAI connection fails
- **Error**: "401 Unauthorized"
  - **Fix**: Check `OPENAI_API_KEY` is correct
  - **Fix**: Verify API key has Realtime API access

- **Error**: "WebSocket connection failed"
  - **Fix**: Check internet connectivity
  - **Fix**: Verify OpenAI API status

### Orders not logging
- **Issue**: Order completes but doesn't appear in Zapier
  - **Check**: `ZAPIER_WEBHOOK_URL` is correct
  - **Check**: Zapier webhook is active
  - **Check**: Server logs for error messages
  - **Check**: Order has customer name (required for logging)

## Production Deployment

### Option 1: Deploy to Heroku

```bash
heroku create your-app-name
heroku config:set TWILIO_ACCOUNT_SID=xxx
heroku config:set TWILIO_AUTH_TOKEN=xxx
heroku config:set OPENAI_API_KEY=xxx
heroku config:set ZAPIER_WEBHOOK_URL=xxx
git push heroku main
```

### Option 2: Deploy to Railway

1. Connect your GitHub repo
2. Add environment variables in Railway dashboard
3. Deploy automatically on push

### Option 3: Deploy to AWS/DigitalOcean

1. Set up Node.js server (PM2 recommended)
2. Configure environment variables
3. Set up reverse proxy (nginx)
4. Configure SSL certificate
5. Update Twilio webhook URL to production domain

## Monitoring

### Health Check Endpoint

Monitor server health:
```bash
curl https://your-domain.com/health
```

### Logs

Check server logs for:
- Connection errors
- Order logging failures
- API errors

### Zapier Monitoring

Set up Zapier alerts for:
- Failed webhook deliveries
- Missing order data

## Next Steps

- [ ] Customize menu in `src/config/menu.js`
- [ ] Adjust AI instructions in `src/services/openai-service.js`
- [ ] Set up monitoring/alerting
- [ ] Configure production domain with SSL
- [ ] Set up log aggregation (optional)
- [ ] Add rate limiting (optional)

## Support

For issues or questions:
1. Check server logs
2. Review error messages
3. Verify environment variables
4. Test health endpoint
5. Check Twilio/OpenAI status pages






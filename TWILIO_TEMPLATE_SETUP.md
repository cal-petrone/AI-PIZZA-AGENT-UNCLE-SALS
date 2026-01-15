# Twilio Template Setup Guide
## Real-time AI Voice Assistant for Pizza Ordering

This guide will help you set up and customize the official Twilio template for Uncle Sal's Pizza.

---

## Step 1: Clone the Template
**Time: 5 minutes**

```bash
# Navigate to your project directory
cd /Users/calvinpetrone/Desktop/ai

# Clone the Node.js version (or Python if you prefer)
git clone https://github.com/twilio-samples/speech-assistant-openai-realtime-api-node.git

# Or clone the Python version:
# git clone https://github.com/twilio-samples/speech-assistant-openai-realtime-api-python.git

cd speech-assistant-openai-realtime-api-node
```

---

## Step 2: Install Dependencies
**Time: 5 minutes**

```bash
npm install
```

This installs:
- `twilio` - Twilio SDK
- `express` - Web server
- `ws` - WebSocket support
- `dotenv` - Environment variables

---

## Step 3: Set Up Environment Variables
**Time: 5 minutes**

Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
OPENAI_API_KEY=your_openai_api_key

# Optional: Port (default is 3000)
PORT=3000
```

**Get your Twilio credentials:**
- Go to [Twilio Console](https://console.twilio.com/)
- Account SID and Auth Token are on the dashboard

---

## Step 4: Set Up ngrok (for Local Development)
**Time: 10 minutes**

```bash
# Install ngrok (if not already installed)
# macOS:
brew install ngrok

# Or download from: https://ngrok.com/download
```

```bash
# Start ngrok tunnel
ngrok http 3000
```

This gives you a public URL like: `https://abc123.ngrok.io`

**Important:** Copy the HTTPS URL - you'll need it for Twilio webhook configuration.

---

## Step 5: Configure Your Twilio Phone Number
**Time: 5 minutes**

1. Go to [Twilio Console → Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click on your phone number (or buy one)
3. Under "Voice & Fax" → "A Call Comes In":
   - Set to: **Webhook**
   - URL: `https://your-ngrok-url.ngrok.io/incoming-call`
   - Method: **POST**
4. Save

---

## Step 6: Test Basic Connection
**Time: 5 minutes**

```bash
# Start the server
npm start

# You should see:
# Server running on port 3000
# WebSocket server ready
```

**Test:**
1. Call your Twilio phone number
2. You should hear the AI assistant respond
3. Try speaking - you should get a real-time response

---

## Step 7: Customize for Pizza Ordering
**Time: 30-60 minutes**

### A. Update the System Prompt

Edit the file where the system prompt is set (likely `server.js` or `index.js`):

**Find the `session.update` configuration and update the `instructions` field:**

```javascript
// Find this section in the code
await openaiClient.send({
  type: 'session.update',
  session: {
    instructions: `You are a friendly pizza ordering assistant for Uncle Sal's Pizza. 
You help customers place orders over the phone in a natural, conversational way.

AVAILABLE MENU ITEMS:
- cheese pizza (sizes: small, medium, large) - $12.99/$15.99/$18.99
- pepperoni pizza (sizes: small, medium, large) - $14.99/$17.99/$20.99
- margherita pizza (sizes: small, medium, large) - $15.99/$18.99/$21.99
- white pizza (sizes: small, medium, large) - $14.99/$17.99/$20.99
- supreme pizza (sizes: small, medium, large) - $17.99/$20.99/$23.99
- veggie pizza (sizes: small, medium, large) - $16.99/$19.99/$22.99
- calzone (regular) - $12.99
- pepperoni calzone (regular) - $14.99
- garlic bread (regular) - $5.99
- garlic knots (regular) - $6.99
- mozzarella sticks (regular) - $7.99
- french fries (sizes: regular, large) - $4.99/$6.99
- salad (sizes: small, large) - $6.99/$9.99
- soda (regular) - $2.99
- water (regular) - $1.99

INSTRUCTIONS:
1. Understand natural language - "fries" means french fries, "pop" means soda, "large pepperoni" means large pepperoni pizza
2. Help customers build their order by asking clarifying questions when needed (size, quantity)
3. Only ask about pickup/delivery when they indicate they're done ordering
4. Ask for delivery address only if they choose delivery
5. Ask payment preference (cash or card) before confirming
6. When confirming the order, summarize items, calculate 8% NYS sales tax, and provide total
7. Be friendly and conversational, not robotic
8. After confirmation, mention that the order will be ready in 20-30 minutes for pickup or 30-45 minutes for delivery

Keep responses brief and natural for phone conversations.`
  }
});
```

### B. Add Order State Tracking

Create a simple order tracking system. Add this near the top of your server file:

```javascript
// Order state storage (in production, use a database)
const activeOrders = new Map(); // streamSid -> order object
```

Update the WebSocket handler to track orders:

```javascript
// When a new stream starts
const order = {
  items: [],
  deliveryMethod: null,
  address: null,
  paymentMethod: null,
  confirmed: false
};
activeOrders.set(streamSid, order);
```

### C. Parse AI Responses for Order Data

In the section where you handle OpenAI events, add logic to extract order information:

```javascript
// In the OpenAI message handler
if (event.type === 'response.audio_transcript.delta') {
  const transcript = event.delta;
  
  // Simple keyword detection (or use OpenAI function calling for better extraction)
  // Check for items, sizes, quantities, etc.
  // Update the order state accordingly
}
```

### D. Handle Order Confirmation

When the order is confirmed, send to Zapier:

```javascript
// After order confirmation
if (order.confirmed && order.items.length > 0) {
  // Calculate totals
  let subtotal = 0;
  order.items.forEach(item => {
    subtotal += item.price * item.quantity;
  });
  const tax = subtotal * 0.08;
  const total = subtotal + tax;
  
  // Send to Zapier webhook
  const zapierWebhookUrl = 'YOUR_ZAPIER_WEBHOOK_URL';
  
  await fetch(zapierWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: order.items,
      deliveryMethod: order.deliveryMethod,
      address: order.address,
      paymentMethod: order.paymentMethod,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      timestamp: new Date().toISOString()
    })
  });
}
```

---

## Step 8: Test the Customized Version
**Time: 15 minutes**

1. Restart your server: `npm start`
2. Call your phone number
3. Test conversation flow:
   - "I'd like a large pepperoni pizza"
   - "And some garlic knots"
   - "I'm all set"
   - Answer pickup/delivery
   - Answer payment method
   - Confirm order

---

## Step 9: Deploy to Production (Optional)
**Time: 30-60 minutes**

### Option A: Deploy to Heroku

```bash
# Install Heroku CLI
# macOS:
brew install heroku/brew/heroku

# Login
heroku login

# Create app
heroku create your-app-name

# Set environment variables
heroku config:set TWILIO_ACCOUNT_SID=your_sid
heroku config:set TWILIO_AUTH_TOKEN=your_token
heroku config:set OPENAI_API_KEY=your_key

# Deploy
git push heroku main
```

### Option B: Deploy to Railway/Render/Fly.io

Similar process - follow their deployment guides.

### Option C: Keep ngrok for Testing

For initial testing, ngrok works fine. For production, use a proper hosting service.

---

## Key Files to Customize

1. **Server Entry Point** (`server.js` or `index.js`):
   - System prompt instructions
   - Order state tracking
   - Zapier webhook integration

2. **WebSocket Handlers**:
   - Audio processing
   - Order data extraction
   - Conversation flow logic

3. **TwiML Response** (`/incoming-call` route):
   - Initial greeting
   - Stream configuration

---

## Troubleshooting

### "WebSocket connection failed"
- Make sure ngrok is running
- Check the URL in Twilio phone number settings
- Verify the server is running on the correct port

### "OpenAI API error"
- Check your API key is correct
- Verify you have credits in your OpenAI account
- Check rate limits

### "No audio" or "Can't hear AI"
- Check WebSocket connections are established
- Verify audio format matches (8 kHz mu-law)
- Check server logs for errors

### "Order not tracking"
- Verify order state map is being updated
- Check that `streamSid` is consistent
- Add console.log statements to debug

---

## Next Steps

1. **Improve Order Extraction:**
   - Use OpenAI function calling for structured data extraction
   - More reliable than keyword matching

2. **Add Menu Management:**
   - Pull menu from database or API
   - Update menu dynamically

3. **Enhanced Error Handling:**
   - Handle disconnections
   - Retry logic
   - Fallback responses

4. **Analytics:**
   - Track order completion rates
   - Monitor latency
   - Log conversations

---

## Resources

- **Template Repository:** https://github.com/twilio-samples/speech-assistant-openai-realtime-api-node
- **Python Version:** https://github.com/twilio-samples/speech-assistant-openai-realtime-api-python
- **Blog Tutorial:** https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-python
- **OpenAI Realtime API Docs:** https://platform.openai.com/docs/guides/realtime

---

## Estimated Total Time

- **Initial Setup:** 30-45 minutes
- **Customization:** 30-60 minutes
- **Testing:** 15-30 minutes
- **Total:** 1.5-2.5 hours

Much faster than building from scratch!






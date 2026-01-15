# Migration Guide: Studio → Real-Time Template

## ⚠️ Important: You Cannot Mix Studio + Real-Time Template

**Twilio Studio and the Real-Time Template are incompatible:**
- **Studio:** Uses HTTP requests, Gather widgets, TwiML
- **Real-Time Template:** Uses WebSockets, Media Streams, direct server connection

**You must choose one:**
- Option A: Keep Studio (current setup) - simpler, but not real-time
- Option B: Use Real-Time Template - real-time, but requires replacing Studio

---

## If You Choose Real-Time Template: Steps

### Step 1: Clone & Set Up Template
```bash
cd /Users/calvinpetrone/Desktop/ai
git clone https://github.com/twilio-samples/speech-assistant-openai-realtime-api-node.git
cd speech-assistant-openai-realtime-api-node
npm install
```

### Step 2: Create `.env` File
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
OPENAI_API_KEY=your_openai_api_key
PORT=3000
```

### Step 3: Start ngrok (for local testing)
```bash
ngrok http 3000
```
Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Step 4: Configure Phone Number to Bypass Studio

**Critical:** Your phone number must point DIRECTLY to the template server, NOT Studio.

1. Go to [Twilio Console → Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click your phone number
3. Under "Voice & Fax" → "A Call Comes In":
   - **Remove/Change:** The Studio flow webhook
   - **Set to:** `https://your-ngrok-url.ngrok.io/incoming-call`
   - **Method:** POST
4. **Save**

**Your phone number now bypasses Studio entirely.**

### Step 5: Start the Template Server
```bash
npm start
```

### Step 6: Customize the AI Prompt

Edit `server.js` (or main server file) and find the `session.update` section:

```javascript
await openaiClient.send({
  type: 'session.update',
  session: {
    instructions: `You are a friendly pizza ordering assistant for Uncle Sal's Pizza. 
You help customers place orders over the phone in a natural, conversational way.

AVAILABLE MENU ITEMS:
- cheese pizza (sizes: small $12.99, medium $15.99, large $18.99)
- pepperoni pizza (sizes: small $14.99, medium $17.99, large $20.99)
- margherita pizza (sizes: small $15.99, medium $18.99, large $21.99)
- white pizza (sizes: small $14.99, medium $17.99, large $20.99)
- supreme pizza (sizes: small $17.99, medium $20.99, large $23.99)
- veggie pizza (sizes: small $16.99, medium $19.99, large $22.99)
- calzone (regular $12.99)
- pepperoni calzone (regular $14.99)
- garlic bread (regular $5.99)
- garlic knots (regular $6.99)
- mozzarella sticks (regular $7.99)
- french fries (sizes: regular $4.99, large $6.99)
- salad (sizes: small $6.99, large $9.99)
- soda (regular $2.99)
- water (regular $1.99)

INSTRUCTIONS:
1. Greet the caller: "Thanks for calling Uncle Sal's Pizza! What can I get started for you today?"
2. Understand natural language - "fries" means french fries, "pop" means soda, "large pepperoni" means large pepperoni pizza
3. Help build the order by asking clarifying questions (size, quantity) when needed
4. Only ask about pickup/delivery when they indicate they're done ordering (say "done", "that's it", "I'm all set")
5. Ask for delivery address only if they choose delivery
6. Ask payment preference (cash or card) before confirming
7. When confirming: summarize items, calculate 8% NYS sales tax, provide total
8. Be friendly, brief, and conversational - like talking to a real person
9. After confirmation: mention ready time (20-30 min pickup, 30-45 min delivery)

Keep responses natural and brief for phone conversations.`
  }
});
```

### Step 7: Add Order Tracking (Optional)

Add order state management to track the conversation:

```javascript
// At top of file
const activeOrders = new Map(); // streamSid -> order object

// When stream starts (in the WebSocket handler)
const order = {
  items: [],
  deliveryMethod: null,
  address: null,
  paymentMethod: null,
  confirmed: false,
  streamSid: streamSid
};
activeOrders.set(streamSid, order);

// In OpenAI event handler, extract order data from transcript
// You can use OpenAI function calling or parse the transcript
```

### Step 8: Add Zapier Webhook (When Order Confirmed)

When the order is confirmed, send to Zapier:

```javascript
// After order confirmation detected
const order = activeOrders.get(streamSid);

if (order.confirmed && order.items.length > 0) {
  // Calculate totals
  let subtotal = 0;
  order.items.forEach(item => {
    subtotal += item.price * item.quantity;
  });
  const tax = subtotal * 0.08;
  const total = subtotal + tax;
  
  // Send to Zapier
  const zapierWebhookUrl = 'YOUR_ZAPIER_WEBHOOK_URL';
  
  fetch(zapierWebhookUrl, {
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
      phoneNumber: fromNumber,
      timestamp: new Date().toISOString()
    })
  }).catch(err => console.error('Zapier webhook error:', err));
}
```

### Step 9: Test

1. Call your phone number
2. You should immediately hear the AI (no Studio greeting)
3. Have a conversation - the AI will respond in real-time
4. Test ordering flow

---

## Key Differences: Studio vs Template

| Feature | Studio (Current) | Real-Time Template |
|---------|------------------|-------------------|
| **Latency** | 3-5 seconds | ~1 second |
| **Audio** | Record → Process → Play | Streams in real-time |
| **Interruptions** | Must wait for response | Can interrupt AI mid-sentence |
| **Setup** | Visual flow builder | Code/server setup |
| **Flexibility** | Limited to Studio widgets | Full programmatic control |
| **Conversation** | Turn-based | Natural bidirectional flow |

---

## What Happens to Your Current Studio Flow?

**It will be bypassed.** Once you point your phone number to the template server:
- Studio flow is no longer used
- All calls go directly to the template
- You can keep Studio for reference, but it won't receive calls

**You can always switch back** by changing the phone number webhook back to Studio.

---

## Quick Start Checklist

- [ ] Clone template repository
- [ ] Install dependencies (`npm install`)
- [ ] Create `.env` with credentials
- [ ] Start ngrok tunnel
- [ ] Configure phone number to point to template (not Studio)
- [ ] Start server (`npm start`)
- [ ] Customize AI prompt for pizza ordering
- [ ] Test with a phone call
- [ ] Add order tracking (optional)
- [ ] Add Zapier webhook (optional)
- [ ] Deploy to production (Heroku, Railway, etc.)

---

## Need Help?

If you get stuck, check:
1. Template README: https://github.com/twilio-samples/speech-assistant-openai-realtime-api-node
2. Twilio Blog Tutorial: https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-python
3. Server logs for errors
4. ngrok web interface (http://127.0.0.1:4040) to see incoming requests

---

## Production Deployment

For production (not just testing):

1. **Deploy server to hosting:**
   - Heroku (easiest)
   - Railway
   - Render
   - Fly.io
   - AWS/GCP

2. **Update phone number webhook:**
   - Point to your production URL (not ngrok)

3. **Set environment variables:**
   - On your hosting platform

4. **Test thoroughly:**
   - Make multiple test calls
   - Test edge cases
   - Monitor costs

---

## Estimated Time

- **Setup:** 15-30 minutes
- **Customization:** 30-60 minutes  
- **Testing:** 15-30 minutes
- **Total:** 1-2 hours

Much faster than building from scratch!






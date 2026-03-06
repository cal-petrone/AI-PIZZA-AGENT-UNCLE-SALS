# Selling Guide: Start with OpenAI, Upgrade to PersonaPlex Later

**Strategy:** Use your existing OpenAI Realtime API to close deals and generate revenue. Once you have paying clients, upgrade them to PersonaPlex for better conversation quality.

---

## ✅ Current Setup: Using OpenAI (Default Engine)

Your system is already configured to use **OpenAI Realtime API** by default. This is perfect for selling because:

- ✅ **No GPU costs** (~$0.20-0.25/min vs $0.35-1.00/hour for GPU)
- ✅ **Fast and reliable** (low latency, proven to work)
- ✅ **Already deployed** and working on Railway
- ✅ **Easy to demo** - just call your Twilio number

### Verify You're Using OpenAI (Default)

**In Railway:**

1. Open your **agent** service (the main Node.js app)
2. Go to **Variables**
3. Check `CONVERSATION_ENGINE`:
   - **Should be:** `default` (or not set at all)
   - **Should NOT be:** `personaplex`
4. If it says `personaplex`, change it to `default` and redeploy

**That's it!** Your calls are using OpenAI Realtime API.

---

## 🚀 Next Steps: Start Selling

### 1. Prepare Your Demo

**What to show clients:**
- **Call your Twilio number** and demonstrate:
  - Natural conversation flow
  - Menu item recognition
  - Order taking
  - Price calculation
  - Address/phone capture
  - Order logging to Google Sheets

**Demo script:**
1. "Hi, I'd like to order a large pepperoni pizza"
2. "Can I also get some fries?"
3. "What's my total?"
4. "My address is 123 Main St"
5. "My phone number is 555-1234"

**Expected result:** Agent understands everything, calculates total, logs to Google Sheets.

---

### 2. Pricing Strategy

**Cost per call:**
- **Twilio:** ~$0.013-0.015 per minute
- **OpenAI Realtime:** ~$0.20-0.25 per minute
- **Total:** ~$0.21-0.27 per minute ≈ **$12-16 per hour** of calls

**What to charge clients:**
- **Per-call pricing:** $0.50-1.00 per call (2-4x markup)
- **Monthly flat rate:** $200-500/month for unlimited calls (if they do 20-40 hours/month)
- **Per-minute pricing:** $0.50-0.75 per minute (2-3x markup)

**Recommendation:** Start with **per-call pricing** ($0.50-1.00/call) - easier to understand and sell.

---

### 3. Sales Pitch

**Key selling points:**

1. **"AI Phone Ordering System"**
   - "Never miss an order - AI answers every call"
   - "24/7 availability - no staff needed for phone orders"
   - "Natural conversation - customers don't know it's AI"

2. **"Seamless Integration"**
   - "Works with your existing Google Sheets menu"
   - "Logs orders directly to your system"
   - "No changes to your current workflow"

3. **"Proven Technology"**
   - "Built on OpenAI's latest Realtime API"
   - "Used by major restaurants and businesses"
   - "Fast, accurate, and reliable"

4. **"Easy Setup"**
   - "We handle all the technical setup"
   - "You just need a Google Sheet with your menu"
   - "Up and running in 1-2 days"

**Objection handling:**

- **"What if it makes mistakes?"**
  - "The AI is trained on your menu - it only suggests items you have"
  - "All orders are logged to Google Sheets for review"
  - "You can review orders before fulfilling them"

- **"How much does it cost?"**
  - "Starting at $0.50 per call - much cheaper than hiring staff"
  - "No setup fees, no monthly minimums"
  - "Pay only for what you use"

- **"What if I want to cancel?"**
  - "No long-term contracts"
  - "Cancel anytime"
  - "Your Google Sheet and menu stay yours"

---

### 4. Onboarding New Clients

**Step-by-step process:**

1. **Get client info:**
   - Business name
   - Phone number (for Twilio)
   - Google Sheet URL (or help them create one)
   - Menu items, prices, modifiers

2. **Set up their company config:**
   - Create config file: `config/companies/<company_id>/config.json`
   - Add their Google Sheet ID
   - Add their Twilio number mapping
   - Set menu items, modifiers, etc.

3. **Deploy to Railway:**
   - Add their config to your repo
   - Push to GitHub
   - Railway auto-deploys
   - Test with a call

4. **Train them:**
   - Show them how to update Google Sheet menu
   - Show them where orders are logged
   - Give them your support contact

**Time estimate:** 1-2 days per client (mostly waiting for them to provide menu data)

---

### 5. Track Your Sales

**Metrics to track:**
- **Calls per client:** Monitor in Twilio dashboard
- **Cost per call:** Track OpenAI usage
- **Revenue per client:** Track what you charge
- **Profit margin:** Revenue - (Twilio + OpenAI costs)

**Tools:**
- **Twilio Console:** Call logs, duration, costs
- **OpenAI Dashboard:** API usage, costs
- **Google Sheets:** Order logs (client-specific)

---

## 🔄 Later: Upgrade Clients to PersonaPlex

Once you have paying clients and want to offer them a premium experience:

### When to Upgrade

**Upgrade when:**
- ✅ Client is happy and wants better conversation quality
- ✅ You have 3+ paying clients (spread GPU costs)
- ✅ Client is doing 50+ calls/month (worth the upgrade)

**Don't upgrade if:**
- ❌ Client is still testing/trialing
- ❌ You only have 1-2 clients (GPU costs too high)
- ❌ Client is happy with current quality

---

### How to Upgrade a Client

**Option 1: Upgrade all clients at once (recommended)**

1. **Set up PersonaPlex GPU instance** (follow `PERSONAPLEX_ALWAYS_ON.md`)
2. **Deploy PersonaPlex gateway** (follow `RAILWAY_PERSONAPLEX_CLICK_BY_CLICK.md`)
3. **In Railway, on your agent service:**
   - Set `CONVERSATION_ENGINE=personaplex`
   - Set `PERSONAPLEX_GATEWAY_URL=<your gateway URL>`
   - Redeploy

**Result:** All clients automatically get PersonaPlex (better conversation quality)

**Cost:** ~$250-730/month for GPU (spread across all clients)

---

**Option 2: Upgrade specific clients only**

1. **Set up PersonaPlex** (same as Option 1)
2. **In client's config file** (`config/companies/<id>/config.json`):
   ```json
   {
     "conversation_engine": "personaplex",
     ...
   }
   ```
3. **Keep global** `CONVERSATION_ENGINE=default` (other clients stay on OpenAI)

**Result:** Only that client gets PersonaPlex

**Use case:** Premium tier clients pay extra for PersonaPlex

---

### Pricing for PersonaPlex Upgrade

**Charge clients extra:**
- **+$50-100/month** for PersonaPlex upgrade
- Or **+$0.10-0.20 per call** for PersonaPlex

**Why charge more:**
- GPU costs $250-730/month
- Better conversation quality (natural turn-taking, persona)
- Premium feature = premium pricing

---

## 📊 Cost Comparison

| Feature | OpenAI (Default) | PersonaPlex (Upgrade) |
|---------|------------------|------------------------|
| **Cost per call** | ~$0.21-0.27/min | ~$0.35-1.00/min + GPU |
| **Latency** | ~200-300ms | ~100-200ms |
| **Conversation** | Good | Excellent (natural turn-taking) |
| **Persona** | Basic | Customizable |
| **Setup** | Already done ✅ | Requires GPU instance |
| **Best for** | Selling, testing | Premium clients |

---

## ✅ Action Items

**This week:**
1. ✅ Verify `CONVERSATION_ENGINE=default` in Railway
2. ✅ Test your demo call (make sure it works)
3. ✅ Prepare your sales pitch
4. ✅ Create a simple pricing sheet

**Next week:**
1. 📞 Reach out to 5-10 potential clients
2. 📞 Schedule demos
3. 📞 Close your first deal
4. 📞 Onboard first client

**When you have 3+ paying clients:**
1. 🚀 Set up PersonaPlex GPU instance
2. 🚀 Deploy PersonaPlex gateway
3. 🚀 Upgrade all clients to PersonaPlex
4. 🚀 Charge premium pricing

---

## 🎯 Summary

**Your strategy is perfect:**
- ✅ Use OpenAI (default) to close deals - **no GPU costs**
- ✅ Generate revenue with proven technology
- ✅ Upgrade to PersonaPlex when you have paying clients
- ✅ Charge premium for PersonaPlex upgrade

**You're ready to sell!** Your system is already working with OpenAI. Just verify `CONVERSATION_ENGINE=default` in Railway and start calling potential clients.

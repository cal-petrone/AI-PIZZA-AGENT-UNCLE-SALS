# How to Add Your OpenAI API Key to Twilio Function

## Step 1: Get Your OpenAI API Key

If you don't have one yet:
1. Go to https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (it starts with `sk-...`)
5. **Save it somewhere safe** - you won't be able to see it again!

## Step 2: Add API Key to Your Twilio Function

### Option A: Through Twilio Console (Recommended)

1. **Go to Twilio Console**
   - Navigate to: https://console.twilio.com/
   - Sign in to your account

2. **Find Your Function**
   - Click on **Functions** in the left sidebar
   - Find your function (the one that handles pizza orders)
   - Click on it to open

3. **Configure Environment Variables**
   - In your function, look for **"Config"** or **"Settings"** tab
   - Find **"Environment Variables"** section
   - Click **"Add"** or **"Add Environment Variable"**

4. **Add the Variable**
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Paste your OpenAI API key (starts with `sk-...`)
   - Click **"Save"**

5. **Deploy/Save the Function**
   - Make sure to click **"Deploy"** or **"Save"** to apply changes

### Option B: Through Twilio CLI (Alternative)

If you prefer using command line:

```bash
# Install Twilio CLI if you haven't
npm install -g twilio-cli

# Login to Twilio
twilio login

# Set the environment variable
twilio serverless:env:set OPENAI_API_KEY "sk-your-key-here" --service-sid YOUR_SERVICE_SID
```

## Step 3: Test Your Function

1. Make a test call to your Twilio phone number
2. Try saying natural things like:
   - "I'd like a large pepperoni pizza"
   - "Can I get some fries?"
   - "I want a pop"
3. The AI should understand these naturally now!

## Troubleshooting

### "OPENAI_API_KEY not found" Error
- Make sure you spelled it exactly: `OPENAI_API_KEY` (all caps, with underscores)
- Make sure you saved/deployed the function after adding it
- Try redeploying the function

### API Rate Limits
- If you hit rate limits, you might need to upgrade your OpenAI account
- Free tier has limited requests per minute

### Function Still Not Working
- Check Twilio Function logs in the console
- Look for error messages
- Make sure your OpenAI account has credits

## Security Notes

- **Never** commit your API key to git/public repositories
- The API key is stored securely in Twilio's environment variables
- Only your Twilio Function can access it
- If you suspect your key is compromised, revoke it in OpenAI dashboard and create a new one

## Cost Estimation

Using `gpt-4o-mini`:
- Very affordable: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- A typical order conversation: ~500-1000 tokens ≈ $0.001-0.002 per call
- Much cheaper than GPT-4, but still gives great results!

If you want better quality (optional):
- Change `gpt-4o-mini` to `gpt-4` in the code (line 136)
- More expensive but even better understanding






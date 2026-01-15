# ngrok Setup Instructions

ngrok requires a free account and authtoken to use.

## Quick Setup (2 minutes):

### Step 1: Sign Up / Sign In
1. Go to: https://dashboard.ngrok.com/signup
2. Sign up with your email (free account)
3. Or sign in if you already have an account

### Step 2: Get Your Authtoken
1. After signing in, go to: https://dashboard.ngrok.com/get-started/your-authtoken
2. Copy your authtoken (it's a long string)

### Step 3: Configure ngrok
Run this command (replace YOUR_AUTHTOKEN with your actual token):

```bash
./ngrok config add-authtoken YOUR_AUTHTOKEN
```

### Step 4: Start ngrok
```bash
./ngrok http 3000
```

That's it! You'll now see your forwarding URL.






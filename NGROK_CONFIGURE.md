# Configure ngrok with Your Authtoken

## Step-by-Step:

### 1. Copy Your Authtoken from ngrok Dashboard
- On the ngrok page you're viewing, click the **eye icon** (👁️) to reveal the token
- Or click the **"Copy"** button to copy it directly
- The token looks like: `2abc123def456ghi789...` (long string)

### 2. Open Terminal

### 3. Run This Command:
```bash
cd /Users/calvinpetrone/Desktop/ai
./ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

**Replace `YOUR_AUTHTOKEN_HERE` with the actual token you copied.**

Example:
```bash
./ngrok config add-authtoken 2abc123def456ghi789jkl012mno345pqr678stu901vwx234
```

### 4. You should see:
```
Authtoken saved to configuration file: /Users/calvinpetrone/.ngrok2/ngrok.yml
```

### 5. Then Start ngrok:
```bash
./ngrok http 3000
```

### 6. You'll see output like:
```
Session Status                online
Account                       Your Name
Forwarding                    https://abc123.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (https://abc123.ngrok.io) - you'll use this for Twilio!






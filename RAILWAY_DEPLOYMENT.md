# Railway Deployment Guide

## Quick Setup Steps

### 1. Push to GitHub (if not already done)
```bash
# Create a new repository on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Railway
1. Go to Railway dashboard
2. Click "+ Create" → "GitHub Repo"
3. Select your repository
4. Railway will auto-detect Node.js and deploy

### 3. Add Environment Variables
In Railway project → Variables tab, add:
- `OPENAI_API_KEY` = (your OpenAI key)
- `TWILIO_ACCOUNT_SID` = (your Twilio SID)
- `TWILIO_AUTH_TOKEN` = (your Twilio token)
- `GOOGLE_SHEETS_MENU_ID` = (your Google Sheet ID)
- `GOOGLE_SHEETS_MENU_SHEET` = `Menu`
- `PORT` = `3000` (Railway sets this automatically)

### 4. Get Your Public URL
After deployment, Railway provides a URL like:
`https://your-app.railway.app`

### 5. Update Twilio Webhook
1. Go to Twilio Console → Phone Numbers
2. Click your phone number
3. Set Voice webhook URL to:
   `https://your-app.railway.app/incoming-call`
4. Save

## Important Notes
- ✅ No ngrok needed - Railway provides public URL
- ✅ Server runs 24/7 in the cloud
- ✅ Auto-deploys on git push
- ⚠️ Google credentials file needs to be uploaded or converted to env vars


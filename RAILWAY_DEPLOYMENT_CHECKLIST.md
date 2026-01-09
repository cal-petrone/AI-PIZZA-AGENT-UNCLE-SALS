# Railway Deployment Checklist

## ✅ Step 1: Environment Variables Added
You've already added these to Railway:
- ✅ OPENAI_API_KEY
- ✅ TWILIO_ACCOUNT_SID
- ✅ TWILIO_AUTH_TOKEN
- ✅ GOOGLE_SHEETS_MENU_ID
- ✅ GOOGLE_SHEETS_MENU_SHEET
- ✅ PORT
- ✅ ZAPIER_WEBHOOK_URL
- ✅ GOOGLE_SHEETS_ID
- ✅ GOOGLE_SHEETS_CREDENTIALS_PATH

## ⚠️ Step 2: Google Credentials File Issue
**Problem:** `GOOGLE_SHEETS_CREDENTIALS_PATH=./google-credentials.json` won't work on Railway because the file doesn't exist there.

**Solution Options:**

### Option A: Upload File to Railway (Easiest)
1. In Railway, go to your service
2. Look for "Volumes" or "Files" tab
3. Upload `google-credentials.json`
4. Update path to match Railway's file system

### Option B: Convert to Environment Variables (Recommended)
Convert the JSON credentials to individual environment variables. I can help with this.

## ✅ Step 3: Save Variables
- Click "Update Variables" button in Railway

## ✅ Step 4: Wait for Deployment
- Railway will automatically restart your service
- Check "Logs" tab for build progress
- Should take 2-5 minutes

## ✅ Step 5: Get Your Public URL
- After deployment, Railway provides a URL like: `https://your-app.railway.app`
- Copy this URL

## ✅ Step 6: Update Twilio Webhook
1. Go to Twilio Console → Phone Numbers
2. Click your phone number
3. Set Voice webhook URL to: `https://your-app.railway.app/incoming-call`
4. Save

## ✅ Step 7: Test
- Call your phone number
- Should connect to Railway server (no more "application error"!)



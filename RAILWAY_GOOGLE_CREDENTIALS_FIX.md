# Fix Google Credentials for Railway

## The Problem
Your code uses `GOOGLE_SHEETS_CREDENTIALS_PATH=./google-credentials.json`, but this file doesn't exist on Railway's servers.

## Solution Options

### Option A: Upload File to Railway (Simplest)
1. In Railway, go to your service
2. Click on "Settings" tab
3. Look for "Volumes" or "Files" section
4. Upload `google-credentials.json` file
5. Update the path in environment variables to match Railway's file system

### Option B: Use Base64 Encoding (Recommended for Railway)
Convert the JSON file to a base64-encoded environment variable:

1. I'll create a script to convert your credentials
2. Add `GOOGLE_SHEETS_CREDENTIALS_BASE64` environment variable
3. Modify the code to decode it at runtime

### Option C: Individual Environment Variables
Convert each field from the JSON to separate environment variables:
- `GOOGLE_SHEETS_TYPE`
- `GOOGLE_SHEETS_PROJECT_ID`
- `GOOGLE_SHEETS_PRIVATE_KEY_ID`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- etc.

## Recommendation
**Option B (Base64)** is cleanest for Railway. I can help you implement this.



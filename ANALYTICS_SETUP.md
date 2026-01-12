# Phase 1 Analytics Dashboard - Setup Guide

## ✅ Implementation Complete

The Phase-1 analytics dashboard has been successfully added to your project without modifying any existing call flow.

## 📁 Files Created

- `apps/api/db.js` - Database module (SQLite)
- `apps/api/calls.js` - API routes for logging and stats
- `apps/dashboard/public/index.html` - Client dashboard frontend
- `data/calls.db` - SQLite database (created automatically, gitignored)

## 🔧 Configuration

### 1. Environment Variables (Optional)

Add to your `.env` file:

```bash
# Analytics (optional - enabled by default)
ENABLE_ANALYTICS=true  # Set to 'false' to disable
DEFAULT_CLIENT_SLUG=unclesals  # Default client slug for calls
```

### 2. Configure Twilio Status Callback

**Important:** You need to configure Twilio to send call status updates.

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to: Phone Numbers → Manage → Active Numbers
3. Click your phone number
4. Scroll to "Voice & Fax" section
5. Under "Status Callback URL", enter:
   ```
   https://your-domain.com/api/calls/twilio-status
   ```
6. Set Method: `POST`
7. Click "Save"

**For Railway deployment:**
- Use your Railway public URL: `https://your-app.railway.app/api/calls/twilio-status`

## 🚀 Testing

### 1. Test the API

```bash
# Log a test call
curl -X POST http://localhost:3000/api/calls/log \
  -H "Content-Type: application/json" \
  -d '{
    "call_sid": "CA1234567890",
    "client_slug": "unclesals",
    "call_date": "2024-01-12",
    "duration_sec": 120,
    "answered": true,
    "ai_handled": true
  }'

# Get stats
curl "http://localhost:3000/api/calls/stats?client=unclesals"
```

### 2. Test the Dashboard

1. Start your server: `npm start`
2. Visit: `http://localhost:3000/unclesals`
3. You should see the analytics dashboard

### 3. Test with Real Call

1. Make a test call to your Twilio number
2. Complete the call
3. Check logs for: `✓ Call logged: CA..., Xs, unclesals`
4. Visit dashboard to see the call logged

## 📊 Dashboard Features

- **Minutes Used Today** - Total minutes from today's calls
- **Minutes Used This Week** - Total minutes from last 7 days
- **Minutes Used This Month** - Total minutes from last 30 days
- **Daily Usage Chart** - Line chart showing last 7 days

## 🔒 Security Notes

- Dashboard is currently open (no auth)
- Add authentication later for production
- Database is stored in `data/` directory (gitignored)
- Client slug validation prevents injection

## 🛠️ Troubleshooting

### Dashboard shows "Error loading statistics"
- Check that API is running: `curl http://localhost:3000/api/calls/stats?client=unclesals`
- Check browser console for errors
- Verify database exists: `ls -la data/calls.db`

### Calls not being logged
- Verify Twilio Status Callback URL is configured
- Check server logs for: `✓ Call logged: ...`
- Verify `ENABLE_ANALYTICS` is not set to `false`
- Check that calls are completing (status = 'completed')

### Database errors
- Check file permissions: `chmod 755 data/`
- Verify SQLite is installed: `npm list better-sqlite3`
- Check disk space

## 📝 Next Steps

1. **Add Authentication** - Protect dashboard with login
2. **Multi-Client Support** - Map phone numbers to client slugs
3. **Advanced Analytics** - Add more metrics (call count, avg duration, etc.)
4. **Export Data** - Add CSV/PDF export functionality

## 🔄 Rollback

If you need to disable analytics:

1. Set `ENABLE_ANALYTICS=false` in environment variables
2. Remove Twilio Status Callback URL
3. Restart server

The existing call flow will continue working normally.

## 📞 Support

All analytics code is isolated and non-blocking. It will never interrupt your existing call flow.


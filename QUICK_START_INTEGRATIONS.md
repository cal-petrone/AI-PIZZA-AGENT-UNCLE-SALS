# Quick Start: Order Logging Integrations

## What's Been Added

✅ **Google Sheets Integration** - Logs all orders directly to a Google Sheet
✅ **POS System Integration** - Supports Square and Toast (easily extensible)
✅ **Backward Compatible** - Still works with your existing Zapier webhook

## Quick Setup (5 minutes)

### Google Sheets (Recommended - Easiest)

1. **Create Google Sheet**
   - Go to [Google Sheets](https://sheets.google.com)
   - Create new sheet named "Pizza Orders"
   - Copy the Sheet ID from URL (the long string between `/d/` and `/edit`)

2. **Get Credentials** (Automated)
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create project → Enable "Google Sheets API"
   - Create Service Account → Download JSON key
   - Save as `google-credentials.json` in project folder

3. **Share Sheet**
   - In your Google Sheet, click **Share**
   - Add the service account email (from JSON file)
   - Give **Editor** permission

4. **Add to .env**
   ```env
   GOOGLE_SHEETS_CREDENTIALS_PATH=./google-credentials.json
   GOOGLE_SHEETS_ID=your-sheet-id-here
   ```

5. **Restart Server**
   ```bash
   npm start
   ```

You should see: `✓ Google Sheets initialized`

### Square POS (Optional)

1. Get credentials from [Square Developer Dashboard](https://developer.squareup.com/)
2. Add to `.env`:
   ```env
   SQUARE_ACCESS_TOKEN=your-token
   SQUARE_LOCATION_ID=your-location-id
   SQUARE_ENVIRONMENT=sandbox
   POS_SYSTEM=square
   ```

### Toast POS (Optional)

1. Get API credentials from Toast
2. Add to `.env`:
   ```env
   TOAST_API_KEY=your-key
   TOAST_RESTAURANT_ID=your-id
   POS_SYSTEM=toast
   ```

## How It Works

When an order is confirmed, the system automatically:

1. ✅ Logs to Google Sheets (if configured)
2. ✅ Creates order in POS system (if configured)
3. ✅ Sends to Zapier webhook (if configured)

All integrations run in parallel - if one fails, others still work.

## Testing

1. Make a test call
2. Complete an order
3. Check your Google Sheet - you should see a new row
4. Check your POS system (if configured)

## Troubleshooting

**No orders in Google Sheets?**
- Check server logs for errors
- Verify credentials file path is correct
- Make sure service account has access to sheet
- Verify Sheet ID is correct

**POS not working?**
- Check API credentials
- Verify menu items are mapped (see INTEGRATION_SETUP.md)
- Check POS system logs

## Next Steps

- See `INTEGRATION_SETUP.md` for detailed setup instructions
- Customize column order in Google Sheets
- Map your menu items to POS catalog items
- Add custom fields to order logging






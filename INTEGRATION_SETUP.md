# Integration Setup Guide

This guide explains how to set up Google Sheets and POS system integrations for order logging.

## Google Sheets Integration

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Name it something like "Pizza Order Logging"

### Step 2: Enable Google Sheets API

1. In Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Google Sheets API"
3. Click **Enable**

### Step 3: Create Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Name it (e.g., "pizza-order-logger")
4. Click **Create and Continue**
5. Skip role assignment (click **Continue**)
6. Click **Done**

### Step 4: Create and Download Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Download the file
6. Save it in your project folder (e.g., `google-credentials.json`)
7. **IMPORTANT:** Add this file to `.gitignore` to keep it secure!

### Step 5: Create Google Sheet

1. Create a new Google Sheet
2. Name it (e.g., "Pizza Orders")
3. Get the Sheet ID from the URL:
   - URL looks like: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Copy the `SHEET_ID_HERE` part

### Step 6: Share Sheet with Service Account

1. In your Google Sheet, click **Share**
2. Add the service account email (found in the JSON file, looks like `xxx@xxx.iam.gserviceaccount.com`)
3. Give it **Editor** permissions
4. Click **Send**

### Step 7: Add to .env

Add these lines to your `.env` file:

```env
GOOGLE_SHEETS_CREDENTIALS_PATH=./google-credentials.json
GOOGLE_SHEETS_ID=your-sheet-id-here
```

### Step 8: Test

Restart your server. You should see:
```
✓ Google Sheets initialized
✓ Google Sheets headers created
```

## Square POS Integration

### Step 1: Create Square Developer Account

1. Go to [Square Developer Dashboard](https://developer.squareup.com/)
2. Sign up or log in
3. Create a new application

### Step 2: Get Access Token

1. In your Square application dashboard
2. Go to **Credentials**
3. Copy your **Access Token**
4. Copy your **Location ID** (from Locations section)

### Step 3: Set Up Square Catalog

1. In Square Dashboard, go to **Items**
2. Add your menu items (pizzas, sides, drinks, etc.)
3. Note the Item IDs (you'll need these to map orders)

### Step 4: Add to .env

```env
SQUARE_ACCESS_TOKEN=your-access-token-here
SQUARE_LOCATION_ID=your-location-id-here
SQUARE_ENVIRONMENT=sandbox  # or 'production' when ready
POS_SYSTEM=square
```

### Step 5: Map Menu Items

You'll need to update `integrations/pos-systems.js` to map your menu items to Square catalog item IDs. This requires:
- Matching your menu item names to Square item IDs
- Updating the `createSquareOrder` function

## Toast POS Integration

### Step 1: Get Toast API Credentials

1. Contact Toast support or check your Toast dashboard
2. Get your **API Key** and **Restaurant ID**

### Step 2: Add to .env

```env
TOAST_API_KEY=your-api-key-here
TOAST_RESTAURANT_ID=your-restaurant-id-here
POS_SYSTEM=toast
```

### Step 3: Map Menu Items

Similar to Square, you'll need to map your menu items to Toast menu item IDs.

## Using Multiple Integrations

You can use all integrations simultaneously:
- Google Sheets will log all orders
- POS system will create orders in your POS
- Zapier webhook (if configured) will also receive orders

## Order Data Structure

Orders are logged with this structure:

```javascript
{
  timestamp: "2024-01-06T18:00:00.000Z",
  storeName: "Uncle Sal's Pizza",
  storeLocation: "Syracuse",
  phoneNumber: "+1234567890",
  items: [
    {
      name: "pepperoni pizza",
      size: "large",
      quantity: 1,
      price: 20.99
    }
  ],
  deliveryMethod: "delivery",
  address: "123 Main St",
  paymentMethod: "card",
  subtotal: "20.99",
  tax: "1.68",
  total: "22.67"
}
```

## Troubleshooting

### Google Sheets Not Working

- Check that credentials file path is correct
- Verify service account email has access to the sheet
- Check that Sheet ID is correct
- Look for error messages in server logs

### POS System Not Working

- Verify API credentials are correct
- Check that you're using the right environment (sandbox vs production)
- Ensure menu items are mapped correctly
- Check POS system API documentation for required fields

### Orders Not Logging

- Check server logs for error messages
- Verify order is confirmed (`order.confirmed === true`)
- Ensure order has items (`order.items.length > 0`)
- Check that integrations are initialized (look for ✓ messages on server start)

## Security Notes

- **Never commit credentials files to git**
- Add `google-credentials.json` to `.gitignore`
- Keep API keys secure in `.env` file
- Use environment variables, never hardcode credentials
- Rotate API keys regularly






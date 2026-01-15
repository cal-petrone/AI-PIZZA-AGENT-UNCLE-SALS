# Google Sheets Menu Integration - Complete Setup Guide

## Overview

This guide shows you how to set up Google Sheets as your dynamic menu source for the Twilio Real-Time Template. Update your menu in Google Sheets - no code changes needed!

---

## Step 1: Create Your Google Sheet

**Time: 5 minutes**

1. **Go to Google Sheets:** https://sheets.google.com
2. **Create a new spreadsheet** (or use existing)
3. **Name it:** "Uncle Sal's Pizza Menu"

4. **Set up your columns** (Row 1 = Headers):
   ```
   A: Item Name
   B: Size  
   C: Price
   D: Category (optional)
   ```

5. **Add your menu items** (starting from Row 2):
   ```
   Cheese Pizza    | Small  | 12.99 | Pizza
   Cheese Pizza    | Medium | 15.99 | Pizza
   Cheese Pizza    | Large  | 18.99 | Pizza
   Pepperoni Pizza | Small  | 14.99 | Pizza
   Pepperoni Pizza | Medium | 17.99 | Pizza
   Pepperoni Pizza | Large  | 20.99 | Pizza
   Garlic Knots    | Regular| 6.99  | Sides
   French Fries    | Regular| 4.99  | Sides
   French Fries    | Large  | 6.99  | Sides
   Soda            | Regular| 2.99  | Drinks
   ```

6. **Make it publicly readable:**
   - Click **Share** button (top right)
   - Click **Change to anyone with the link**
   - Select **Viewer**
   - Click **Done**

---

## Step 2: Get Your Sheet ID

**Time: 1 minute**

1. Look at your Google Sheets URL:
   ```
   https://docs.google.com/spreadsheets/d/[THIS_IS_YOUR_SHEET_ID]/edit
   ```

2. Copy the Sheet ID (the long string between `/d/` and `/edit`)

**Example:** If URL is `https://docs.google.com/spreadsheets/d/1aBcD3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ/edit`
- **Sheet ID:** `1aBcD3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ`

---

## Step 3: Get Google Sheets API Key

**Time: 10 minutes**

### Option A: Using Google Cloud Console (Recommended)

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create or Select a Project:**
   - Click project dropdown (top left)
   - Click **New Project**
   - Name it: "Pizza Menu API"
   - Click **Create**

3. **Enable Google Sheets API:**
   - Go to: https://console.cloud.google.com/apis/library
   - Search for **"Google Sheets API"**
   - Click on it
   - Click **Enable**

4. **Create API Key:**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click **+ CREATE CREDENTIALS** → **API Key**
   - Copy the API key (starts with `AIza...`)

5. **Restrict API Key (Security):**
   - Click **Restrict Key**
   - Under **API restrictions**, select **Restrict key**
   - Check **Google Sheets API**
   - Click **Save**

6. **Set Application restrictions (Optional but Recommended):**
   - Under **Application restrictions**
   - Select **HTTP referrers**
   - Add your server domain (or leave blank for testing)

### Option B: Quick Method (Less Secure, For Testing)

1. Visit: https://console.cloud.google.com/apis/credentials
2. Click **+ CREATE CREDENTIALS** → **API Key**
3. Copy the key (don't restrict for quick testing)

---

## Step 4: Add Code to Template

**Time: 15 minutes**

### A. Install Required Package (if needed)

```bash
cd speech-assistant-openai-realtime-api-node
npm install node-fetch
# Or if using Node 18+, fetch is built-in, no install needed
```

### B. Add Menu Fetching Functions

Open your `server.js` file and add these functions **near the top** (after imports):

```javascript
const https = require('https');

// Google Sheets Configuration
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';

/**
 * Fetch menu from Google Sheets
 */
async function fetchMenuFromGoogleSheets() {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_SHEET_ID || !GOOGLE_SHEETS_API_KEY) {
      reject(new Error('Google Sheets credentials not configured'));
      return;
    }

    // Google Sheets API URL - fetches from range A2:D100 (skips header row)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Menu!A2:D100?key=${GOOGLE_SHEETS_API_KEY}`;
    
    console.log('Fetching menu from Google Sheets...');
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            const error = JSON.parse(data);
            reject(new Error(`Google Sheets API error: ${error.error?.message || 'Unknown error'}`));
            return;
          }
          
          const json = JSON.parse(data);
          const menu = parseMenuData(json.values || []);
          const menuText = formatMenuForPrompt(menu);
          
          console.log('Menu fetched successfully:', Object.keys(menu).length, 'items');
          resolve(menuText);
        } catch (error) {
          console.error('Error parsing menu data:', error);
          reject(error);
        }
      });
    }).on('error', (error) => {
      console.error('Error fetching menu:', error);
      reject(error);
    });
  });
}

/**
 * Parse raw sheet data into structured menu object
 */
function parseMenuData(rows) {
  const menu = {};
  
  rows.forEach((row, index) => {
    // Skip empty rows
    if (!row || row.length < 3) return;
    
    try {
      const itemName = (row[0] || '').trim();
      const size = (row[1] || '').trim().toLowerCase();
      const priceStr = (row[2] || '').trim();
      const category = (row[3] || 'other').trim();
      
      // Skip if essential data is missing
      if (!itemName || !size || !priceStr) {
        console.warn(`Skipping row ${index + 2}: Missing required data`);
        return;
      }
      
      const price = parseFloat(priceStr.replace('$', '').replace(',', ''));
      
      if (isNaN(price) || price <= 0) {
        console.warn(`Skipping row ${index + 2}: Invalid price "${priceStr}"`);
        return;
      }
      
      // Initialize menu item if it doesn't exist
      if (!menu[itemName]) {
        menu[itemName] = {
          sizes: [],
          priceMap: {},
          category: category || 'other'
        };
      }
      
      // Add size if not already added
      if (!menu[itemName].sizes.includes(size)) {
        menu[itemName].sizes.push(size);
      }
      
      // Store price for this size
      menu[itemName].priceMap[size] = price;
      
    } catch (error) {
      console.warn(`Error parsing row ${index + 2}:`, error);
    }
  });
  
  return menu;
}

/**
 * Format menu for OpenAI prompt
 */
function formatMenuForPrompt(menu) {
  if (Object.keys(menu).length === 0) {
    return 'Menu is currently unavailable.';
  }
  
  let menuText = '';
  
  // Group by category (optional)
  const categories = {};
  Object.keys(menu).forEach(itemName => {
    const item = menu[itemName];
    const category = item.category || 'other';
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    categories[category].push({ name: itemName, item: item });
  });
  
  // Format each category
  Object.keys(categories).sort().forEach(category => {
    if (category && category !== 'other') {
      menuText += `\n${category.toUpperCase()}:\n`;
    }
    
    categories[category].forEach(({ name, item }) => {
      const sizes = item.sizes.join(', ');
      const prices = item.sizes.map(s => {
        const price = item.priceMap[s];
        return `${s} $${price.toFixed(2)}`;
      }).join(', ');
      
      menuText += `- ${name.toLowerCase()} (sizes: ${sizes}) - ${prices}\n`;
    });
  });
  
  return menuText.trim();
}

/**
 * Fallback menu (used if Google Sheets fetch fails)
 */
function getDefaultMenuText() {
  return `PIZZA:
- cheese pizza (sizes: small, medium, large) - small $12.99, medium $15.99, large $18.99
- pepperoni pizza (sizes: small, medium, large) - small $14.99, medium $17.99, large $20.99

SIDES:
- garlic knots (sizes: regular) - regular $6.99
- french fries (sizes: regular, large) - regular $4.99, large $6.99

DRINKS:
- soda (sizes: regular) - regular $2.99
- water (sizes: regular) - regular $1.99`;
}
```

### C. Update the OpenAI Session Configuration

Find where you initialize the OpenAI session (usually when a stream starts). Update it to use the fetched menu:

```javascript
// Find this section in your code (usually in WebSocket handler)
// OLD CODE (hardcoded menu):
// await openaiClient.send({
//   type: 'session.update',
//   session: {
//     instructions: `You are a friendly pizza ordering assistant...
//     AVAILABLE MENU ITEMS:
//     - cheese pizza (sizes: small $12.99...)
//     ...
//   `
//   }
// });

// NEW CODE (dynamic menu):
let menuText;
try {
  menuText = await fetchMenuFromGoogleSheets();
  console.log('Using menu from Google Sheets');
} catch (error) {
  console.error('Failed to fetch menu, using default:', error.message);
  menuText = getDefaultMenuText();
}

await openaiClient.send({
  type: 'session.update',
  session: {
    instructions: `You are a friendly pizza ordering assistant for Uncle Sal's Pizza. 
You help customers place orders over the phone in a natural, conversational way.

AVAILABLE MENU ITEMS:
${menuText}

INSTRUCTIONS:
1. Understand natural language - "fries" means french fries, "pop" means soda, "large pepperoni" means large pepperoni pizza
2. Help build the order by asking clarifying questions (size, quantity) when needed
3. Only ask about pickup/delivery when they indicate they're done ordering (say "done", "that's it", "I'm all set")
4. Ask for delivery address only if they choose delivery
5. Ask payment preference (cash or card) before confirming
6. When confirming: summarize items, calculate 8% NYS sales tax, provide total
7. Be friendly, brief, and conversational - like talking to a real person
8. After confirmation: mention ready time (20-30 min pickup, 30-45 min delivery)

Keep responses natural and brief for phone conversations.`
  }
});
```

---

## Step 5: Add Environment Variables

**Time: 2 minutes**

### A. Update `.env` file:

```env
# Existing variables
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
OPENAI_API_KEY=your_openai_api_key

# Add these new variables
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SHEETS_API_KEY=your_api_key_here
PORT=3000
```

### B. For Production (Heroku/Railway/etc.):

Add these environment variables in your hosting platform dashboard:
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEETS_API_KEY`

---

## Step 6: Test

**Time: 5 minutes**

1. **Start your server:**
   ```bash
   npm start
   ```

2. **Check console logs:**
   - You should see: `Fetching menu from Google Sheets...`
   - Then: `Menu fetched successfully: X items`

3. **Test a call:**
   - Call your Twilio number
   - The AI should have the menu from your Google Sheet

4. **Update menu and test:**
   - Add a new item to your Google Sheet
   - Make a new call (menu is fetched fresh each call)
   - New item should be available!

---

## Troubleshooting

### "Google Sheets credentials not configured"
- ✅ Check `.env` file has both `GOOGLE_SHEET_ID` and `GOOGLE_SHEETS_API_KEY`
- ✅ Restart server after updating `.env`

### "Google Sheets API error: 403"
- ✅ Make sure Google Sheets API is enabled in Google Cloud Console
- ✅ Check API key has access to Sheets API
- ✅ Verify sheet is publicly readable (Share → Anyone with link)

### "404 Not Found"
- ✅ Check Sheet ID is correct (from URL)
- ✅ Make sure sheet name is "Menu" (or update in code: `Menu!A2:D100`)

### Menu not updating
- ✅ Menu is fetched fresh for each call
- ✅ Make a new call to see updated menu
- ✅ Check sheet formatting (Item, Size, Price columns)

### "Menu is currently unavailable"
- ✅ Check fallback menu is working
- ✅ Review server logs for fetch errors
- ✅ Verify API key and Sheet ID are correct

---

## Advanced: Caching (Optional)

If you want to cache the menu (reduce API calls), add this:

```javascript
let menuCache = null;
let menuCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getMenuWithCache() {
  const now = Date.now();
  
  // Return cached menu if still valid
  if (menuCache && (now - menuCacheTime) < CACHE_DURATION) {
    console.log('Using cached menu');
    return menuCache;
  }
  
  // Fetch fresh menu
  try {
    menuCache = await fetchMenuFromGoogleSheets();
    menuCacheTime = now;
    return menuCache;
  } catch (error) {
    // Return cache even if expired, or fallback
    if (menuCache) {
      console.warn('Using expired cache due to fetch error');
      return menuCache;
    }
    return getDefaultMenuText();
  }
}
```

---

## Google Sheet Template

Here's a complete example of how your sheet should look:

```
| A (Item Name)    | B (Size)    | C (Price) | D (Category) |
|------------------|-------------|-----------|--------------|
| Cheese Pizza     | Small       | 12.99     | Pizza        |
| Cheese Pizza     | Medium      | 15.99     | Pizza        |
| Cheese Pizza     | Large       | 18.99     | Pizza        |
| Pepperoni Pizza  | Small       | 14.99     | Pizza        |
| Pepperoni Pizza  | Medium      | 17.99     | Pizza        |
| Pepperoni Pizza  | Large       | 20.99     | Pizza        |
| Margherita Pizza | Small       | 15.99     | Pizza        |
| Margherita Pizza | Medium      | 18.99     | Pizza        |
| Margherita Pizza | Large       | 21.99     | Pizza        |
| White Pizza      | Small       | 14.99     | Pizza        |
| White Pizza      | Medium      | 17.99     | Pizza        |
| White Pizza      | Large       | 20.99     | Pizza        |
| Supreme Pizza    | Small       | 17.99     | Pizza        |
| Supreme Pizza    | Medium      | 20.99     | Pizza        |
| Supreme Pizza    | Large       | 23.99     | Pizza        |
| Veggie Pizza     | Small       | 16.99     | Pizza        |
| Veggie Pizza     | Medium      | 19.99     | Pizza        |
| Veggie Pizza     | Large       | 22.99     | Pizza        |
| Calzone          | Regular     | 12.99     | Calzone      |
| Pepperoni Calzone| Regular     | 14.99     | Calzone      |
| Garlic Bread     | Regular     | 5.99      | Sides        |
| Garlic Knots     | Regular     | 6.99      | Sides        |
| Mozzarella Sticks| Regular     | 7.99      | Sides        |
| French Fries     | Regular     | 4.99      | Sides        |
| French Fries     | Large       | 6.99      | Sides        |
| Salad            | Small       | 6.99      | Sides        |
| Salad            | Large       | 9.99      | Sides        |
| Soda             | Regular     | 2.99      | Drinks       |
| Water            | Regular     | 1.99      | Drinks       |
```

**Note:** 
- Row 1 = Headers (will be skipped)
- Row 2+ = Menu items
- Each size variant needs its own row
- Category is optional but helps organize

---

## Summary

✅ **Set up Google Sheet** (5 min)
✅ **Get API credentials** (10 min)
✅ **Add code to template** (15 min)
✅ **Configure environment variables** (2 min)
✅ **Test** (5 min)

**Total: ~40 minutes**

After setup, you can update your menu anytime in Google Sheets - no code changes or redeployments needed!






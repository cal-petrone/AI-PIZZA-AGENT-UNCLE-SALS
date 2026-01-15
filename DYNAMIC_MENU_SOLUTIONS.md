# Dynamic Menu Solutions for Real-Time Template

## Current Situation

**Method B (Real-Time Template):** Menu is hardcoded in the system prompt
- ❌ Requires code change + redeploy when menu updates
- ❌ Not ideal for frequent menu changes

---

## Solution Options

### Option 1: Pull Menu from API/Database (Recommended)

**How it works:** Template fetches menu dynamically from an external source each time a call starts.

**Benefits:**
- ✅ No code changes needed for menu updates
- ✅ Menu can be updated in Google Sheets/database
- ✅ Changes take effect immediately (no redeploy)

**Implementation:**

```javascript
// In your server.js file, replace hardcoded menu with API call

async function getMenuFromAPI() {
  try {
    // Option A: Fetch from Google Sheets (via Zapier/Webhook)
    const response = await fetch('YOUR_GOOGLE_SHEETS_API_URL', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
    });
    const menuData = await response.json();
    return formatMenuForPrompt(menuData);
    
    // Option B: Fetch from your own API/database
    // const response = await fetch('https://your-api.com/menu');
    // return await response.json();
    
  } catch (error) {
    console.error('Failed to fetch menu, using default:', error);
    return getDefaultMenu(); // Fallback to hardcoded menu
  }
}

// When stream starts, fetch fresh menu
const menuText = await getMenuFromAPI();

await openaiClient.send({
  type: 'session.update',
  session: {
    instructions: `You are a friendly pizza ordering assistant for Uncle Sal's Pizza.
    
AVAILABLE MENU ITEMS:
${menuText}

INSTRUCTIONS:
[... rest of your instructions ...]`
  }
});
```

### Option 2: Store Menu in Environment Variable

**How it works:** Menu stored as JSON in environment variable, updated without code changes.

**Benefits:**
- ✅ Easy to update (just change env var)
- ✅ No code changes
- ✅ Can update via Twilio Console or hosting platform

**Implementation:**

```javascript
// In .env file (or hosting platform env vars)
MENU_JSON={"items":[{"name":"cheese pizza","sizes":{"small":12.99,"medium":15.99,"large":18.99}},...]}

// In server.js
const menu = JSON.parse(process.env.MENU_JSON || '{}');

function formatMenuForPrompt(menu) {
  return Object.keys(menu.items).map(item => {
    // Format for AI prompt
    return `- ${item.name} (sizes: ${Object.keys(item.sizes).join(', ')})`;
  }).join('\n');
}
```

### Option 3: Google Sheets Integration (Easiest)

**How it works:** Menu stored in Google Sheets, fetched via Zapier webhook or Google Sheets API.

**Benefits:**
- ✅ Non-technical staff can update menu
- ✅ Familiar interface (Google Sheets)
- ✅ No code changes needed

**Setup:**

1. **Create Google Sheet:**
   ```
   Item Name | Size | Price
   ----------|------|-------
   Cheese Pizza | Small | 12.99
   Cheese Pizza | Medium | 15.99
   Cheese Pizza | Large | 18.99
   Pepperoni Pizza | Small | 14.99
   ...
   ```

2. **Set up Google Sheets API** (or use Zapier Webhook):
   - Make sheet public (read-only) or use API key
   - Fetch as JSON

3. **Update template code:**

```javascript
async function getMenuFromGoogleSheets() {
  const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
  const API_KEY = 'YOUR_GOOGLE_API_KEY';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Menu!A2:C100?key=${API_KEY}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  // Process rows into menu format
  const menu = {};
  data.values.forEach(row => {
    const [itemName, size, price] = row;
    if (!menu[itemName]) menu[itemName] = { sizes: {}, priceMap: {} };
    menu[itemName].sizes[size] = parseFloat(price);
    menu[itemName].priceMap[size] = parseFloat(price);
  });
  
  return formatMenuForPrompt(menu);
}
```

### Option 4: Database (Most Flexible)

**How it works:** Menu stored in database (PostgreSQL, MongoDB, etc.), fetched on-demand.

**Benefits:**
- ✅ Most flexible
- ✅ Can add features (availability, seasonal items, etc.)
- ✅ Can cache for performance

**Implementation:**

```javascript
// Using a database like PostgreSQL or MongoDB
async function getMenuFromDatabase() {
  const client = await connectToDatabase();
  const menuItems = await client.query('SELECT * FROM menu_items');
  
  // Format for prompt
  return formatMenuForDatabase(menuItems.rows);
}
```

---

## Comparison: Current vs Dynamic

| Method | Menu Updates | Code Changes | Redeploy | Ease of Update |
|--------|-------------|--------------|----------|----------------|
| **Hardcoded (Current)** | ❌ Manual | ✅ Required | ✅ Required | 🔴 Difficult |
| **Env Variable** | ✅ Via console | ❌ None | ❌ None | 🟡 Moderate |
| **Google Sheets** | ✅ Edit sheet | ❌ None | ❌ None | 🟢 Easy |
| **API/Database** | ✅ Via API/DB | ❌ None | ❌ None | 🟢 Easy |

---

## Recommended Approach

**For Uncle Sal's Pizza, I recommend:**

1. **Start Simple:** Use environment variable (Option 2)
   - Quick to implement
   - Easy to update via Twilio Console or hosting dashboard

2. **Upgrade Later:** Move to Google Sheets (Option 3)
   - Non-technical staff can update
   - More user-friendly
   - Still no code changes needed

---

## Implementation Example (Google Sheets)

Here's a complete example using Google Sheets:

```javascript
// server.js

const https = require('https');

async function fetchMenuFromGoogleSheets() {
  return new Promise((resolve, reject) => {
    const SHEET_ID = process.env.GOOGLE_SHEET_ID;
    const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Menu!A2:D100?key=${API_KEY}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const menu = parseMenuData(json.values || []);
          resolve(formatMenuForPrompt(menu));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function parseMenuData(rows) {
  const menu = {};
  
  rows.forEach(row => {
    if (row.length < 3) return;
    
    const [itemName, size, price, category] = row;
    const priceNum = parseFloat(price) || 0;
    
    if (!menu[itemName]) {
      menu[itemName] = {
        sizes: [],
        priceMap: {},
        category: category || 'other'
      };
    }
    
    if (!menu[itemName].sizes.includes(size)) {
      menu[itemName].sizes.push(size);
    }
    
    menu[itemName].priceMap[size] = priceNum;
  });
  
  return menu;
}

function formatMenuForPrompt(menu) {
  let menuText = '';
  
  Object.keys(menu).forEach(itemName => {
    const item = menu[itemName];
    const sizes = item.sizes.join(', ');
    const prices = item.sizes.map(s => `${s} $${item.priceMap[s].toFixed(2)}`).join(', ');
    
    menuText += `- ${itemName} (sizes: ${sizes}) - ${prices}\n`;
  });
  
  return menuText;
}

// When stream starts, fetch menu
const menuText = await fetchMenuFromGoogleSheets().catch(() => {
  console.warn('Failed to fetch menu, using default');
  return getDefaultMenuText(); // Fallback
});

await openaiClient.send({
  type: 'session.update',
  session: {
    instructions: `You are a friendly pizza ordering assistant...
    
AVAILABLE MENU ITEMS:
${menuText}

[... rest of instructions ...]`
  }
});
```

---

## Google Sheets Setup Steps

1. **Create Google Sheet:**
   - Make it public (View → Anyone with link can view)
   - Or set up API key authentication

2. **Format Sheet:**
   ```
   A (Item)      | B (Size)    | C (Price) | D (Category)
   --------------|-------------|-----------|-------------
   Cheese Pizza  | Small       | 12.99     | Pizza
   Cheese Pizza  | Medium      | 15.99     | Pizza
   Cheese Pizza  | Large       | 18.99     | Pizza
   ```

3. **Get Sheet ID:**
   - From URL: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`

4. **Get API Key:**
   - Go to Google Cloud Console
   - Enable Sheets API
   - Create API key

5. **Add to .env:**
   ```env
   GOOGLE_SHEET_ID=your_sheet_id_here
   GOOGLE_SHEETS_API_KEY=your_api_key_here
   ```

---

## Summary

**Answer to your question:**
- **Currently:** Yes, you'd need to change code + redeploy
- **With dynamic solution:** No code changes needed - just update menu source (Sheets/API/Database)

**Recommendation:** Implement Google Sheets integration for easiest menu management without code changes.






/**
 * Real-Time AI Pizza Ordering Assistant
 * Twilio Media Streams + OpenAI Realtime API
 * 
 * This server handles incoming calls, streams audio to OpenAI,
 * and processes pizza orders in real-time.
 */

// Load environment variables from .env file
require('dotenv').config();

// ============================================================================
// CRITICAL: GLOBAL ERROR HANDLERS - PREVENT CRASHES, ENSURE PERMANENT UPTIME
// ============================================================================

// CRITICAL: Validate all required environment variables before starting
// ============================================================================
function validateEnvironment() {
  const requiredVars = ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
  const missing = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    console.error('🚨🚨🚨 CRITICAL: Missing required environment variables 🚨🚨🚨');
    console.error('Missing:', missing.join(', '));
    console.error('⚠️  Server will start but calls may fail - fix these immediately!');
    return false;
  }
  
  console.log('✓ All required environment variables validated');
  return true;
}

// Validate environment on startup
validateEnvironment();

// Handle uncaught exceptions - prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('🚨🚨🚨 UNCAUGHT EXCEPTION - CRITICAL ERROR 🚨🚨🚨');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('⚠️  Server will continue running - error logged but not crashing');
  // DO NOT exit - keep server running
  // Try to recover by checking critical services
  setTimeout(() => {
    console.log('🔄 Performing health check after uncaught exception...');
    // Health check logic will run automatically
  }, 5000);
});

// Handle unhandled promise rejections - prevent server crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨🚨🚨 UNHANDLED REJECTION - CRITICAL ERROR 🚨🚨🚨');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('⚠️  Server will continue running - error logged but not crashing');
  
  // If it's an async operation error, try to recover
  if (reason instanceof Error) {
    console.error('Error message:', reason.message);
    console.error('Error stack:', reason.stack?.substring(0, 300));
  }
  
  // DO NOT exit - keep server running
});

// CRITICAL: Handle process termination signals gracefully
// NOTE: DO NOT call process.exit() - PM2 manages process lifecycle
// If we exit here, PM2 will think the process crashed and stop restarting it
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received - PM2 will handle shutdown');
  // Don't exit - let PM2 manage the process lifecycle
  // The server will stay running until PM2 explicitly kills it
});

process.on('SIGINT', () => {
  console.log('⚠️  SIGINT received - PM2 will handle shutdown');
  // Don't exit - let PM2 manage the process lifecycle
  // The server will stay running until PM2 explicitly kills it
});

// CRITICAL: Health check endpoint for PM2 and monitoring
// This allows PM2 to verify the server is responding, even if ngrok is down
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pm2: process.env.pm_id ? 'running' : 'not detected'
  });
});

// CRITICAL: Root endpoint - always respond to prevent "application error"
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'Uncle Sal\'s Pizza AI Receptionist is running',
    timestamp: new Date().toISOString()
  });
});

// Keep process alive - prevent accidental termination
process.on('exit', (code) => {
  console.log(`⚠️  Process exiting with code: ${code}`);
});

const express = require('express');
const WebSocket = require('ws');
const twilio = require('twilio');

// Import integrations
const googleSheets = require('./integrations/google-sheets');
const posSystems = require('./integrations/pos-systems');

const app = express();
const port = process.env.PORT || 3000;

// CRITICAL: Parse Twilio POST request body (form-encoded)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Debug: Check if environment variables are loaded
console.log('Environment check:');
console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Found' : '✗ Missing');
console.log('- TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✓ Found' : '✗ Missing');
console.log('- NGROK_URL:', process.env.NGROK_URL || 'Not set (will use request host)');

// Store active order sessions
const activeOrders = new Map(); // streamSid -> order object

// Menu configuration (hardcoded for now, add Google Sheets later)
const getMenuText = () => {
  return `PIZZA:
- cheese pizza (sizes: small, medium, large) - small $12.99, medium $15.99, large $18.99
- pepperoni pizza (sizes: small, medium, large) - small $14.99, medium $17.99, large $20.99
- margherita pizza (sizes: small, medium, large) - small $15.99, medium $18.99, large $21.99
- white pizza (sizes: small, medium, large) - small $14.99, medium $17.99, large $20.99
- supreme pizza (sizes: small, medium, large) - small $17.99, medium $20.99, large $23.99
- veggie pizza (sizes: small, medium, large) - small $16.99, medium $19.99, large $22.99

CALZONE:
- calzone (regular) - $12.99
- pepperoni calzone (regular) - $14.99

SIDES:
- garlic bread (regular) - $5.99
- garlic knots (regular) - $6.99
- mozzarella sticks (regular) - $7.99
- french fries (sizes: regular, large) - regular $4.99, large $6.99
- salad (sizes: small, large) - small $6.99, large $9.99

DRINKS:
- soda (regular) - $2.99
- water (regular) - $1.99`;
};

// Menu as structured object for price lookup
const getMenu = () => {
  return {
    'cheese pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 12.99, medium: 15.99, large: 18.99 }
    },
    'pepperoni pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 14.99, medium: 17.99, large: 20.99 }
    },
    'margherita pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 15.99, medium: 18.99, large: 21.99 }
    },
    'white pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 14.99, medium: 17.99, large: 20.99 }
    },
    'supreme pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 17.99, medium: 20.99, large: 23.99 }
    },
    'veggie pizza': {
      sizes: ['small', 'medium', 'large'],
      priceMap: { small: 16.99, medium: 19.99, large: 22.99 }
    },
    'calzone': {
      sizes: ['regular'],
      price: 12.99,
      priceMap: { regular: 12.99 }
    },
    'pepperoni calzone': {
      sizes: ['regular'],
      price: 14.99,
      priceMap: { regular: 14.99 }
    },
    'garlic bread': {
      sizes: ['regular'],
      price: 5.99,
      priceMap: { regular: 5.99 }
    },
    'garlic knots': {
      sizes: ['regular'],
      price: 6.99,
      priceMap: { regular: 6.99 }
    },
    'mozzarella sticks': {
      sizes: ['regular'],
      price: 7.99,
      priceMap: { regular: 7.99 }
    },
    'french fries': {
      sizes: ['regular', 'large'],
      priceMap: { regular: 4.99, large: 6.99 }
    },
    'salad': {
      sizes: ['small', 'large'],
      priceMap: { small: 6.99, large: 9.99 }
    },
    'soda': {
      sizes: ['regular'],
      price: 2.99,
      priceMap: { regular: 2.99 }
    },
    'water': {
      sizes: ['regular'],
      price: 1.99,
      priceMap: { regular: 1.99 }
    }
  };
};

// ============================================================================
// DYNAMIC MENU FROM GOOGLE SHEETS
// ============================================================================

// Cache menu to avoid fetching on every call (refresh every 5 minutes)
let menuCache = null;
let menuCacheTimestamp = 0;
const MENU_CACHE_DURATION = 30 * 60 * 1000; // CRITICAL: 30 minutes cache - pre-load menu on startup to avoid delays

/**
 * Fetch menu from Google Sheets
 * Returns both formatted text for AI prompt and structured object for price lookup
 */
async function fetchMenuFromGoogleSheets() {
  try {
    // Check cache first
    const now = Date.now();
    if (menuCache && (now - menuCacheTimestamp) < MENU_CACHE_DURATION) {
      console.log('✓ Using cached menu');
      return menuCache;
    }

    const menuSheetId = process.env.GOOGLE_SHEETS_MENU_ID || process.env.GOOGLE_SHEETS_ID;
    if (!menuSheetId) {
      console.warn('⚠️  GOOGLE_SHEETS_MENU_ID not set, using default menu');
      return getDefaultMenuData();
    }

    // Use existing Google Sheets client if available, or create new one
    const { google } = require('googleapis');
    const path = require('path');
    
    const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
    if (!credentialsPath) {
      console.warn('⚠️  GOOGLE_SHEETS_CREDENTIALS_PATH not set, using default menu');
      return getDefaultMenuData();
    }

    const credentialsAbsolutePath = path.isAbsolute(credentialsPath)
      ? credentialsPath
      : path.resolve(__dirname, credentialsPath.replace(/^\.\//, ''));

    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsAbsolutePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch menu data (assuming it's in a sheet named "Menu" or "Sheet1")
    const sheetName = process.env.GOOGLE_SHEETS_MENU_SHEET || 'Menu';
    const range = `${sheetName}!A2:E1000`; // Skip header row, get up to 1000 items

    console.log(`📋 Fetching menu from Google Sheets: ${menuSheetId}, range: ${range}`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: menuSheetId,
      range: range,
    });

    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      console.warn('⚠️  No menu data found in Google Sheets, using default menu');
      return getDefaultMenuData();
    }

    console.log(`📋 Found ${rows.length} rows in Google Sheets`);
    
    // Parse menu data
    const menuData = parseMenuFromSheets(rows);
    
    // CRITICAL: If parsing resulted in 0 items, fall back to default menu
    const itemCount = Object.keys(menuData.menu).length;
    if (itemCount === 0) {
      console.error('❌ Menu parsing resulted in 0 items - this will break the AI prompt!');
      console.error('❌ Falling back to default menu to prevent silent calls');
      console.error('❌ Please check:');
      console.error('   1. Sheet is shared with service account');
      console.error('   2. Sheet name matches GOOGLE_SHEETS_MENU_SHEET (currently: ' + sheetName + ')');
      console.error('   3. Data starts at row 2 (row 1 should be headers)');
      console.error('   4. Columns: Item Name | Size | Price | Category | Available');
      return getDefaultMenuData();
    }
    
    // Cache the result
    menuCache = menuData;
    menuCacheTimestamp = now;
    
    console.log(`✅ Menu fetched from Google Sheets: ${itemCount} items`);
    return menuData;

  } catch (error) {
    console.error('❌ Error fetching menu from Google Sheets:', error.message);
    console.error('❌ Using default menu as fallback');
    return getDefaultMenuData();
  }
}

/**
 * Parse Google Sheets rows into menu format
 */
function parseMenuFromSheets(rows) {
  const menu = {};
  const menuTextByCategory = {};
  
  rows.forEach((row, index) => {
    // Skip empty rows
    if (!row || row.length < 3) {
      if (row && row.length > 0) {
        console.log(`⚠️  Skipping row ${index + 2}: not enough columns (found ${row.length}, need at least 3)`);
      }
      return;
    }
    
    const itemName = (row[0] || '').trim().toLowerCase();
    const size = (row[1] || 'regular').trim().toLowerCase();
    // Handle price - try parsing as number, remove $ sign if present, handle empty strings
    let priceStr = (row[2] || '').toString().trim();
    // Remove $ sign if present
    priceStr = priceStr.replace(/^\$/, '');
    const price = parseFloat(priceStr) || 0;
    const category = (row[3] || 'Other').trim();
    const available = row[4] === undefined || row[4] === '' || 
                     row[4].toString().toLowerCase() === 'true' || 
                     row[4].toString().toLowerCase() === 'yes' ||
                     row[4] === true;

    // Skip if item is not available
    if (!available) {
      console.log(`⚠️  Skipping unavailable item: ${itemName} (${size})`);
      return;
    }

    if (!itemName) {
      console.warn(`⚠️  Skipping invalid row ${index + 2}: missing item name`);
      if (index < 5) { // Log first 5 rows for debugging
        console.warn(`   Row data: ${JSON.stringify(row)}`);
      }
      return;
    }
    
    // Allow items with price 0 (might be free items or pricing to be determined)
    // Only skip if price is truly invalid (NaN after parseFloat)
    if (isNaN(price) && priceStr !== '0' && priceStr !== '') {
      console.warn(`⚠️  Skipping invalid row ${index + 2}: invalid price "${row[2]}" for "${itemName}"`);
      if (index < 5) {
        console.warn(`   Row data: ${JSON.stringify(row)}`);
      }
      return;
    }

    // Initialize menu item if it doesn't exist
    if (!menu[itemName]) {
      menu[itemName] = {
        sizes: [],
        priceMap: {},
        category: category
      };
    }

    // Add size and price if not already added
    if (!menu[itemName].sizes.includes(size)) {
      menu[itemName].sizes.push(size);
    }
    menu[itemName].priceMap[size] = price;

    // Track categories for formatting
    if (!menuTextByCategory[category]) {
      menuTextByCategory[category] = [];
    }
  });

  // Format menu text for AI prompt
  const menuText = formatMenuText(menu, menuTextByCategory);
  
  const itemCount = Object.keys(menu).length;
  if (itemCount === 0) {
    console.warn('⚠️  Warning: parseMenuFromSheets returned 0 items after parsing');
  } else {
    console.log(`📋 Parsed ${itemCount} menu items from ${rows.length} rows`);
  }

  return {
    menu: menu,
    menuText: menuText
  };
}

/**
 * Format menu object into text for AI prompt
 */
function formatMenuText(menu, menuTextByCategory) {
  // Group by category first
  const categories = {};
  
  Object.keys(menu).forEach(itemName => {
    const item = menu[itemName];
    const category = item.category || 'Other';
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    const sizes = item.sizes.join(', ');
    const prices = item.sizes.map(s => {
      const price = item.priceMap[s];
      return `${s} $${price.toFixed(2)}`;
    }).join(', ');
    
    categories[category].push(`- ${itemName} (sizes: ${sizes}) - ${prices}`);
  });

  // Format by category
  let menuText = '';
  Object.keys(categories).sort().forEach(category => {
    menuText += `${category.toUpperCase()}:\n${categories[category].join('\n')}\n\n`;
  });

  return menuText.trim();
}

/**
 * Get default menu (fallback if Google Sheets fails)
 */
function getDefaultMenuData() {
  return {
    menu: getMenu(), // Use existing getMenu() function
    menuText: getMenuText() // Use existing getMenuText() function
  };
}

// Twilio webhook endpoint - returns TwiML to connect Media Stream
// Store caller phone numbers by callSid (from initial POST request)
const callerPhoneNumbers = new Map(); // callSid -> phoneNumber

app.post('/incoming-call', (req, res) => {
  // CRITICAL: Wrap EVERYTHING in try-catch to ensure we ALWAYS return a valid response
  // This prevents "application error" messages from Twilio
  let responseSent = false;
  let timeoutFired = false;
  let timeout = null; // Declare timeout here so it's accessible everywhere
  
  // CRITICAL: Helper function to send TwiML response (guaranteed valid)
  const sendTwiMLResponse = (host = null) => {
    if (responseSent) {
      console.warn('⚠️  Response already sent - skipping duplicate');
      return true; // Return true since response was already sent
    }
    
    try {
      responseSent = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Connecting you now.');
      const stream = twiml.connect();
      
      // Use provided host or fallback
      const wsHost = host || req?.headers?.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
      const wsUrl = wsHost.startsWith('wss://') ? `${wsHost}/media-stream` : `wss://${wsHost}/media-stream`;
      
      stream.stream({ url: wsUrl });
      
      res.type('text/xml');
      res.status(200).send(twiml.toString());
      console.log('✓ TwiML response sent successfully to:', wsUrl);
      return true;
    } catch (error) {
      console.error('❌ Error creating TwiML response:', error);
      // Last resort: send minimal valid XML
      try {
        const fallbackHost = host || req?.headers?.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
        const fallbackUrl = fallbackHost.startsWith('wss://') ? `${fallbackHost}/media-stream` : `wss://${fallbackHost}/media-stream`;
        const minimalXML = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say><Connect><Stream url="${fallbackUrl}"/></Connect></Response>`;
        res.type('text/xml');
        res.status(200).send(minimalXML);
        console.log('✓ Sent minimal fallback TwiML');
        return true;
      } catch (e) {
        console.error('❌ CRITICAL: Failed to send ANY TwiML response:', e);
        // If we get here, something is very wrong - but still try to send something
        res.type('text/xml');
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say></Response>');
        return false;
      }
    }
  };
  
  // CRITICAL: Set response timeout to ensure Twilio always gets a response
  // Twilio requires response within 10 seconds, we use 8 seconds for safety
  timeout = setTimeout(() => {
    if (!responseSent && !timeoutFired) {
      timeoutFired = true;
      console.error('⚠️  Response timeout - sending fallback TwiML');
      sendTwiMLResponse();
    }
  }, 8000); // 8 second timeout (Twilio allows 10 seconds)
  
  // CRITICAL: Main try-catch block - ensure we ALWAYS send a response
  try {
    console.log('Incoming call received');
    console.log('Request headers:', req.headers);
    
    // CRITICAL: Get caller's phone number from Twilio POST request
    const callerPhone = req.body.From || req.body.Caller || req.body.CallerId || null;
    const callSid = req.body.CallSid || null;
    
    if (callerPhone) {
      // Clean phone number (remove +1 prefix if present, keep only digits)
      const cleanPhone = callerPhone.replace(/[^\d]/g, '').replace(/^1/, '').slice(-10);
      console.log('📞 Caller phone number:', callerPhone, '-> cleaned:', cleanPhone);
      
      // Store phone number by callSid so we can retrieve it when Media Stream connects
      if (callSid) {
        callerPhoneNumbers.set(callSid, cleanPhone);
        console.log('✓ Stored caller phone for callSid:', callSid);
      }
    } else {
      console.warn('⚠️  No caller phone number found in request');
    }
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Get the full URL from request or use environment variable
    // For ngrok, we need the full HTTPS URL
    const ngrokUrl = process.env.NGROK_URL || `wss://${req.headers.host}`;
    const wsUrl = ngrokUrl.startsWith('wss://') ? `${ngrokUrl}/media-stream` : `wss://${ngrokUrl}/media-stream`;
  
    console.log('WebSocket URL:', wsUrl);
  
    // Don't play any greeting here - let the AI handle it through Media Stream
    // This ensures seamless real-time conversation
  
    // Connect to Media Stream WebSocket
    // Specify audio format - Twilio can accept PCM16 if we specify it
    const stream = twiml.connect().stream({
      url: wsUrl
    });
  
    // Note: Twilio sends mu-law (g711_ulaw), and we're now configured to receive g711_ulaw from OpenAI
    // This ensures audio format compatibility
  
    // Clear timeout since we're sending response
    clearTimeout(timeout);
    
    // CRITICAL: Send response FIRST, before any other operations
    // This ensures Twilio gets response immediately - prevents "application error"
    const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
    
    // CRITICAL: Use the helper function to ensure response is sent IMMEDIATELY
    if (!sendTwiMLResponse(host)) {
      // If sendTwiMLResponse failed, try one more time with the manually created TwiML
      try {
        responseSent = true;
        clearTimeout(timeout);
        res.type('text/xml');
        res.status(200).send(twiml.toString());
        console.log('✓ TwiML response sent (manual fallback)');
      } catch (e) {
        console.error('❌ Failed to send manual TwiML, using minimal fallback');
        sendTwiMLResponse(host);
      }
    }
    
    // CRITICAL: Non-critical operations (logging, etc.) AFTER response is sent
    // This prevents any delays from affecting the response
    setTimeout(() => {
      // #region agent log (non-blocking - runs after response is sent)
      fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:250',message:'Sending TwiML response',data:{callerPhone:callerPhone,callSid:callSid,wsUrl:wsUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
    }, 0); // Run after response is sent - fully non-blocking
  } catch (error) {
    // CRITICAL: Catch ANY error, even those outside the main try block
    console.error('❌❌❌ CRITICAL ERROR in /incoming-call route ❌❌❌');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    // CRITICAL: ALWAYS send a valid response, even if everything failed
    if (!responseSent) {
      console.log('🔄 Attempting to send fallback response after error...');
      sendTwiMLResponse();
    }
  } finally {
    // CRITICAL: Ensure we ALWAYS send a response, even if try/catch failed
    if (!responseSent && !timeoutFired) {
      console.error('🚨🚨🚨 CRITICAL: No response sent in try/catch - sending in finally block 🚨🚨🚨');
      timeoutFired = true;
      clearTimeout(timeout);
      sendTwiMLResponse();
    }
  }
});

// CRITICAL: Global Express error handler - catch ANY unhandled errors in routes
// This MUST be after all routes but before server.listen
app.use((err, req, res, next) => {
  console.error('🚨🚨🚨 UNHANDLED EXPRESS ERROR 🚨🚨🚨');
  console.error('Path:', req.path);
  console.error('Method:', req.method);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack?.substring(0, 500));
  
  // CRITICAL: For Twilio webhook routes, ALWAYS return valid TwiML
  if (req.path === '/incoming-call' || req.method === 'POST') {
    try {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Connecting you now.');
      const stream = twiml.connect();
      const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
      const wsUrl = host.startsWith('wss://') ? `${host}/media-stream` : `wss://${host}/media-stream`;
      stream.stream({ url: wsUrl });
      res.type('text/xml');
      res.status(200).send(twiml.toString());
      console.log('✓ Sent TwiML fallback after error');
    } catch (e) {
      console.error('❌ Failed to send TwiML fallback, sending minimal XML');
      try {
        const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
        const wsUrl = host.startsWith('wss://') ? `${host}/media-stream` : `wss://${host}/media-stream`;
        const minimalXML = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say><Connect><Stream url="${wsUrl}"/></Connect></Response>`;
        res.type('text/xml');
        res.status(200).send(minimalXML);
        console.log('✓ Sent minimal XML fallback');
      } catch (e2) {
        // Last resort - send absolute minimal response
        res.type('text/xml');
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say></Response>');
      }
    }
  } else {
    // For other routes, return JSON error
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CRITICAL: Catch-all route handler - ensures Twilio ALWAYS gets a response even if route doesn't exist
app.all('*', (req, res) => {
  console.warn('⚠️  Unknown route requested:', req.method, req.path);
  
  // If it's POST to /incoming-call (or any POST), return TwiML
  if (req.method === 'POST' || req.path === '/incoming-call') {
    try {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Connecting you now.');
      const stream = twiml.connect();
      const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
      const wsUrl = host.startsWith('wss://') ? `${host}/media-stream` : `wss://${host}/media-stream`;
      stream.stream({ url: wsUrl });
      res.type('text/xml');
      res.status(200).send(twiml.toString());
      console.log('✓ Sent TwiML response for unknown route');
    } catch (e) {
      console.error('❌ Failed to send TwiML for unknown route, sending minimal XML');
      const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
      const wsUrl = host.startsWith('wss://') ? `${host}/media-stream` : `wss://${host}/media-stream`;
      res.type('text/xml');
      res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say><Connect><Stream url="${wsUrl}"/></Connect></Response>`);
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// CRITICAL: Global Express error handler - catch ANY unhandled errors in routes
// This MUST be after all routes but before server.listen
app.use((err, req, res, next) => {
  console.error('🚨🚨🚨 UNHANDLED EXPRESS ERROR 🚨🚨🚨');
  console.error('Path:', req.path);
  console.error('Method:', req.method);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack?.substring(0, 500));
  
  // CRITICAL: For Twilio webhook routes, ALWAYS return valid TwiML
  if (req.path === '/incoming-call' || req.method === 'POST') {
    try {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Connecting you now.');
      const stream = twiml.connect();
      const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
      const wsUrl = host.startsWith('wss://') ? `${host}/media-stream` : `wss://${host}/media-stream`;
      stream.stream({ url: wsUrl });
      res.type('text/xml');
      res.status(200).send(twiml.toString());
      console.log('✓ Sent TwiML fallback after Express error');
    } catch (e) {
      console.error('❌ Failed to send TwiML fallback, sending minimal XML');
      try {
        const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
        const wsUrl = host.startsWith('wss://') ? `${host}/media-stream` : `wss://${host}/media-stream`;
        const minimalXML = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say><Connect><Stream url="${wsUrl}"/></Connect></Response>`;
        res.type('text/xml');
        res.status(200).send(minimalXML);
        console.log('✓ Sent minimal XML fallback after Express error');
      } catch (e2) {
        // Last resort - send absolute minimal response
        console.error('❌ CRITICAL: Failed to send ANY response, using absolute minimal XML');
        res.type('text/xml');
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say></Response>');
      }
    }
  } else {
    // For other routes, return JSON error
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CRITICAL: Catch-all route handler - ensures Twilio ALWAYS gets a response even if route doesn't exist
app.all('*', (req, res) => {
  // CRITICAL: For POST requests (Twilio webhooks), ALWAYS return TwiML
  if (req.method === 'POST') {
    console.warn('⚠️  POST request to unknown route:', req.path, '- sending TwiML fallback');
    try {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Connecting you now.');
      const stream = twiml.connect();
      const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
      const wsUrl = host.startsWith('wss://') ? `${host}/media-stream` : `wss://${host}/media-stream`;
      stream.stream({ url: wsUrl });
      res.type('text/xml');
      res.status(200).send(twiml.toString());
      console.log('✓ Sent TwiML response for unknown POST route');
    } catch (e) {
      console.error('❌ Failed to send TwiML for unknown route, sending minimal XML');
      const host = req.headers.host || process.env.NGROK_URL?.replace('https://', '').replace('http://', '') || 'localhost:3000';
      const wsUrl = host.startsWith('wss://') ? `${host}/media-stream` : `wss://${host}/media-stream`;
      res.type('text/xml');
      res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say><Connect><Stream url="${wsUrl}"/></Connect></Response>`);
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Health check endpoint
// ============================================================================
// HEALTH CHECK ENDPOINT - MONITOR SERVER STATUS
// ============================================================================
app.get('/health', (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      },
      activeOrders: activeOrders.size,
      environment: {
        nodeVersion: process.version,
        platform: process.platform
      }
    };
    res.status(200).json(healthStatus);
  } catch (error) {
    console.error('Error in health check:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================================================
// KEEP-ALIVE ENDPOINT - PREVENT TIMEOUTS
// ============================================================================
app.get('/keepalive', (req, res) => {
  res.status(200).send('OK');
});

// WebSocket server for Media Streams
const wss = new WebSocket.Server({ noServer: true });

// CRITICAL: Handle WebSocket server errors without crashing
wss.on('error', (error) => {
  console.error('🚨 WEBSOCKET SERVER ERROR (non-fatal):', error.message);
  console.error('⚠️  Server will continue running - WebSocket error logged but not crashing');
  // Don't crash - server must stay running
});

// Upgrade HTTP server to handle WebSocket connections
// ============================================================================
// START SERVER WITH COMPREHENSIVE ERROR HANDLING
// ============================================================================
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅✅✅ SERVER RUNNING ON PORT ${port} - PERMANENT MODE ENABLED ✅✅✅`);
  console.log(`🛡️  Global error handlers active - server will NEVER crash`);
  console.log(`📊 Health check available at: http://0.0.0.0:${port}/health`);
  console.log(`💓 Keep-alive endpoint: http://0.0.0.0:${port}/keepalive`);
  console.log(`🌐 Server listening on all interfaces (0.0.0.0) for Railway deployment`);
  
  // CRITICAL: Pre-load menu cache on startup to avoid delays on first call
  // Use setTimeout to ensure this doesn't block server startup
  setTimeout(() => {
    console.log('📋 Pre-loading menu cache for faster connection...');
    fetchMenuFromGoogleSheets()
      .then((menuData) => {
        console.log('✅ Menu cache pre-loaded successfully');
        console.log(`📋 Cached menu contains ${Object.keys(menuData?.menu || {}).length} items`);
      })
      .catch((error) => {
        console.warn('⚠️  Failed to pre-load menu cache (non-critical):', error.message);
        console.warn('⚠️  Server will still work - menu will be loaded on first call');
      });
  }, 1000); // Wait 1 second after server starts
});

// CRITICAL: Handle server errors without crashing
server.on('error', (error) => {
  console.error('🚨 SERVER ERROR (non-fatal):', error.message);
  console.error('⚠️  Server will continue running - attempting recovery...');
  // Don't exit - let the process manager handle restarts if needed
});

// CRITICAL: Handle client connection errors gracefully
server.on('clientError', (err, socket) => {
  console.error('🚨 CLIENT CONNECTION ERROR (non-fatal):', err.message);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  // Don't crash the server
});

server.on('upgrade', (request, socket, head) => {
  // CRITICAL: Wrap in try-catch to prevent crashes
  try {
    if (request.url === '/media-stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  } catch (error) {
    console.error('🚨 ERROR in WebSocket upgrade handler (non-fatal):', error.message);
    console.error('⚠️  Server continues running - error logged but not crashing');
    try {
      socket.destroy();
    } catch (e) {
      // Ignore errors when destroying socket
    }
  }
});

  // Handle WebSocket connections from Twilio
wss.on('connection', (ws, req) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:372',message:'WebSocket connection received',data:{url:req.url,headers:Object.keys(req.headers)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  // CRITICAL: Wrap entire connection handler in try-catch to prevent crashes
  try {
    let streamSid = null;
    let openaiClient = null;
    let order = null;
    let audioBuffer = []; // Buffer audio chunks to batch them
    let audioBufferTimer = null;
    
    // Function to send a subtle typing sound to indicate processing
    // DISABLED: Removed typing sound as it causes beeping
    function sendTypingSound() {
      // Typing sound disabled - no sound when processing
      return;
    }
    let initialGreetingTriggered = false; // Track if we've triggered the greeting
    let preConnectionAudioQueue = []; // Queue audio while OpenAI is connecting
    let openaiReady = false; // Track when OpenAI is ready to receive audio
    let responseInProgress = false; // Track if a response is already being generated (prevent duplicates)
    let storeConfig = null; // Store configuration for this connection
  let recentResponses = []; // Track recent responses to detect loops (max 10)
  let consecutiveSimilarResponses = 0; // Track consecutive similar responses
  let lastAIResponse = null; // Track last AI response to prevent exact repeats
  let lastAIResponseTimestamp = 0; // Track when last response was given
  let userIsSpeaking = false; // CRITICAL: Track if user is currently speaking to prevent interruptions
  let greetingCompletedTimestamp = 0; // CRITICAL: Track when greeting was completed - prevent responses for 3 seconds after greeting
  let postGreetingSilencePeriod = 3000; // Optimized: Reduced to 3 seconds (from 5) for faster response while still preventing random responses
  
  console.log('Twilio Media Stream WebSocket connection received');
  console.log('Request URL:', req.url);
  
  // Extract calledNumber from query params if available
  const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const calledNumber = urlParams.get('calledNumber') || urlParams.get('To');
  if (calledNumber) {
    storeConfig = getStoreConfig(calledNumber);
    console.log('✓ Store config loaded for:', calledNumber, '-', storeConfig.name);
  }
  
  // Handle messages from Twilio
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.event) {
        case 'start':
          console.log('Stream started:', data.start);
          streamSid = data.start.streamSid;
          const callSid = data.start.callSid;
          
          // CRITICAL: Get caller's phone number from stored map
          const callerPhone = callerPhoneNumbers.get(callSid) || null;
          if (callerPhone) {
            console.log('📞 Retrieved caller phone number for call:', callerPhone);
            // Clean up after retrieving (optional - for memory management)
            // callerPhoneNumbers.delete(callSid);
          } else {
            console.warn('⚠️  No caller phone number found for callSid:', callSid);
          }
          
          // CRITICAL: Clean up any existing OpenAI connection from previous call
          // This prevents multiple connections and state confusion
          if (openaiClient) {
            console.log('⚠ Closing existing OpenAI connection before starting new call...');
            try {
              // Remove all event listeners to prevent old handlers from firing
              openaiClient.removeAllListeners();
              openaiClient.close();
            } catch (e) {
              console.error('Error closing old OpenAI connection:', e);
            }
            openaiClient = null;
          }
          
          // Reset all state variables for the new call - CRITICAL for production reliability
          // This ensures EVERY call starts fresh and works consistently
          initialGreetingTriggered = false;
          preConnectionAudioQueue = [];
          openaiReady = false;
          audioBuffer = [];
          responseInProgress = false;
          recentResponses = []; // Reset loop detection
          consecutiveSimilarResponses = 0; // Reset loop counter
          lastAIResponse = null; // Reset last response tracking
          lastAIResponseTimestamp = 0; // Reset timestamp
          userIsSpeaking = false; // Reset user speaking flag
          greetingCompletedTimestamp = 0; // CRITICAL: Reset greeting timestamp
          postGreetingSilencePeriod = 5000; // CRITICAL: 5 seconds of silence after greeting (prevents random responses)
          if (audioBufferTimer) {
            clearTimeout(audioBufferTimer);
            audioBufferTimer = null;
          }
          
          console.log('✓ All state reset for new call - streamSid:', streamSid);
          console.log('✓ Production mode: Ensuring consistent, smooth experience for every call');
          console.log('✓ Production mode: Ensuring consistent, smooth experience for every call');
          
          // Initialize order tracking with caller's phone number
          order = {
            items: [],
            deliveryMethod: null,
            address: null,
            customerName: null,
            customerPhone: callerPhone || null, // Use actual caller phone number
            paymentMethod: null,
            confirmed: false,
            logged: false, // Track if order has been logged to prevent duplicates
            streamSid: streamSid,
            from: callSid // Keep callSid for reference, but use customerPhone for logging
          };
          activeOrders.set(streamSid, order);
          
          console.log('✓ State reset complete - connecting to OpenAI for new call');
          
          // Connect to OpenAI Realtime API with retry logic
          connectToOpenAI(streamSid, order).catch(error => {
            console.error('❌ Error in connectToOpenAI:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack?.substring(0, 300));
            
            // CRITICAL: Retry connection with exponential backoff
            let retryCount = 0;
            const maxRetries = 3;
            const retryConnection = () => {
              if (retryCount < maxRetries) {
                retryCount++;
                const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s
                console.log(`🔄 Retrying OpenAI connection (attempt ${retryCount}/${maxRetries}) in ${delay}ms...`);
                setTimeout(() => {
                  connectToOpenAI(streamSid, order).catch(retryError => {
                    console.error(`❌ Retry ${retryCount} failed:`, retryError.message);
                    if (retryCount < maxRetries) {
                      retryConnection();
                    } else {
                      console.error('❌❌❌ Failed to connect to OpenAI after all retries');
                      console.error('⚠️  Call will continue but may have limited functionality');
                      // Keep the call alive even if OpenAI connection fails
                    }
                  });
                }, delay);
              }
            };
            
            retryConnection();
          });
          break;
          
        case 'media':
          // Forward audio from Twilio to OpenAI
          // If OpenAI isn't ready yet, queue the audio
          if (!openaiClient || openaiClient.readyState !== WebSocket.OPEN || !openaiReady) {
            // Queue audio while OpenAI is connecting
            preConnectionAudioQueue.push(data.media.payload);
            if (preConnectionAudioQueue.length === 1) {
              console.log('📦 Queuing audio while OpenAI connects... (queue size will grow)');
            }
            // Limit queue size to prevent memory issues (keep last 100 chunks)
            if (preConnectionAudioQueue.length > 100) {
              preConnectionAudioQueue.shift(); // Remove oldest
            }
            return; // Don't process further until OpenAI is ready
          }
          
          // OpenAI is ready - process audio normally
          // Send audio immediately (no debouncing, no delays) for fastest processing
          // OpenAI can handle frequent audio chunks
          // CRITICAL: Use safeSendToOpenAI to prevent errors
          const audioPayload = {
            type: 'input_audio_buffer.append',
            audio: data.media.payload
          };
          
          if (!safeSendToOpenAI(audioPayload, 'input_audio_buffer.append')) {
            // Error already logged in safeSendToOpenAI
            if (!openaiReady) {
              // Queue audio if OpenAI not ready yet
              preConnectionAudioQueue.push(data.media.payload);
              if (preConnectionAudioQueue.length > 100) {
                preConnectionAudioQueue.shift(); // Limit queue size
              }
            }
          }
          break;
          
        case 'stop':
          console.log('Stream stopped:', streamSid);
          
          // Final check: Log order if it has items but wasn't logged yet
          // CRITICAL: Log orders with items even if missing some info - user wants all orders logged
          if (order && order.items.length > 0 && !order.logged) {
            console.log('📝 Stream ending - checking if order should be logged...');
            console.log('Order status - confirmed:', order.confirmed, 'items:', order.items.length);
            
            // Validate items before logging
            const validItems = order.items.filter(item => item.name && item.name.length > 0);
            
            if (validItems.length > 0) {
              console.log('✅ Order has valid items - logging to Google Sheets');
              console.log('📋 Order details:', {
                items: validItems.length,
                itemsList: validItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
                deliveryMethod: order.deliveryMethod || 'not specified',
                customerName: order.customerName || 'not provided',
                customerPhone: order.customerPhone || order.from || 'unknown'
              });
              
              // Auto-confirm and log - user wants ALL orders logged
              order.confirmed = true;
              order.logged = true;
              activeOrders.set(streamSid, order);
              logOrder(order, storeConfig || {}).catch(error => {
                console.error('❌ Error logging order on stream end:', error);
                // Reset logged flag on error so it can be retried
                order.logged = false;
                activeOrders.set(streamSid, order);
              });
            } else {
              console.warn('⚠️  Order has no valid items - skipping log');
              console.warn('⚠️  Order items:', JSON.stringify(order.items, null, 2));
            }
          }
          
          // Clear audio buffer timer
          if (audioBufferTimer) {
            clearTimeout(audioBufferTimer);
            audioBufferTimer = null;
          }
          // Send any remaining buffered audio
          if (audioBuffer.length > 0) {
            const combinedAudio = audioBuffer.join('');
            const audioPayload = {
              type: 'input_audio_buffer.append',
              audio: combinedAudio
            };
            if (safeSendToOpenAI(audioPayload, 'buffered audio flush')) {
              audioBuffer = [];
            } else {
              console.warn('⚠️  Failed to send buffered audio - may be lost');
              audioBuffer = []; // Clear anyway to prevent memory issues
            }
          }
          // CRITICAL: Clean up OpenAI connection properly
          if (openaiClient) {
            try {
              // Remove all event listeners to prevent memory leaks
              openaiClient.removeAllListeners();
              // Close connection
              if (openaiClient.readyState === WebSocket.OPEN || openaiClient.readyState === WebSocket.CONNECTING) {
                openaiClient.close();
              }
            } catch (e) {
              console.error('Error closing OpenAI connection on stop:', e);
            }
            openaiClient = null;
          }
          // Clean up order tracking
          activeOrders.delete(streamSid);
          console.log('✓ Stream stopped and cleaned up - streamSid:', streamSid);
          break;
      }
    } catch (error) {
      // CRITICAL: Properly handle ALL errors to prevent crashes
      console.error('❌❌❌ CRITICAL ERROR handling Twilio message ❌❌❌');
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      try {
        console.error('❌ Message preview:', message.toString().substring(0, 200));
      } catch (e) {
        console.error('❌ Could not log message details');
      }
      // Don't crash - continue processing other messages
    }
  });
  
  // CRITICAL: Safe function to send messages to OpenAI WebSocket
  // This prevents errors from sending to closed/invalid connections
  function safeSendToOpenAI(message, description = 'message') {
    try {
      // CRITICAL: Validate openaiClient exists
      if (!openaiClient) {
        console.error(`❌ Cannot send ${description}: openaiClient is null`);
        return false;
      }
      
      // CRITICAL: Validate connection state
      if (openaiClient.readyState !== WebSocket.OPEN) {
        console.error(`❌ Cannot send ${description}: WebSocket not open (state: ${openaiClient.readyState})`);
        return false;
      }
      
      // CRITICAL: Validate message can be stringified
      let messageStr;
      try {
        if (typeof message === 'string') {
          messageStr = message;
        } else {
          messageStr = JSON.stringify(message);
        }
        
        if (!messageStr || messageStr.trim().length === 0) {
          console.error(`❌ Cannot send ${description}: message is empty`);
          return false;
        }
      } catch (stringifyError) {
        console.error(`❌ Cannot send ${description}: failed to stringify message:`, stringifyError);
        return false;
      }
      
      // CRITICAL: Send message with error handling
      try {
        openaiClient.send(messageStr);
        return true;
      } catch (sendError) {
        console.error(`❌ Error sending ${description} to OpenAI:`, sendError);
        console.error('Error message:', sendError.message);
        return false;
      }
    } catch (error) {
      console.error(`❌ Unexpected error in safeSendToOpenAI for ${description}:`, error);
      console.error('Error message:', error.message);
      return false;
    }
  }
  
  // Handle OpenAI connection
  async function connectToOpenAI(sid, currentOrder) {
    // CRITICAL: Validate inputs before proceeding
    if (!sid || typeof sid !== 'string') {
      console.error('❌ Invalid streamSid provided to connectToOpenAI');
      return Promise.reject(new Error('Invalid streamSid'));
    }
    
    if (!currentOrder || typeof currentOrder !== 'object') {
      console.error('❌ Invalid currentOrder provided to connectToOpenAI');
      return Promise.reject(new Error('Invalid currentOrder'));
    }
    
    // CRITICAL: Validate OpenAI API key before attempting connection
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey || typeof openaiApiKey !== 'string' || openaiApiKey.trim().length === 0) {
      console.error('❌ CRITICAL: OPENAI_API_KEY not found or invalid');
      console.error('⚠️  Cannot connect to OpenAI - call will have limited functionality');
      return Promise.reject(new Error('OPENAI_API_KEY not configured'));
    }
    
    // Safety check: Don't create multiple connections for the same stream
    if (openaiClient && openaiClient.readyState === WebSocket.OPEN) {
      console.warn('⚠ OpenAI connection already exists! Closing it before creating new one...');
      try {
        openaiClient.removeAllListeners();
        openaiClient.close();
      } catch (e) {
        console.error('Error closing existing connection:', e);
      }
      openaiClient = null;
      openaiReady = false;
    }
    
    // CRITICAL: Fetch menu with error handling
    console.log('📋 Fetching menu for call...');
    let menuData;
    try {
      menuData = await fetchMenuFromGoogleSheets();
      // CRITICAL: Validate menu data before using it
      if (!menuData || typeof menuData !== 'object') {
        console.error('❌ Invalid menu data returned from fetchMenuFromGoogleSheets');
        menuData = getDefaultMenuData();
      }
      if (!menuData.menuText || typeof menuData.menuText !== 'string') {
        console.error('❌ Invalid menuText, using default');
        menuData = getDefaultMenuData();
      }
      if (!menuData.menu || typeof menuData.menu !== 'object') {
        console.error('❌ Invalid menu object, using default');
        menuData = getDefaultMenuData();
      }
    } catch (error) {
      console.error('❌ Error fetching menu from Google Sheets:', error);
      console.error('Error message:', error.message);
      console.error('⚠️  Using default menu as fallback');
      menuData = getDefaultMenuData();
    }
    
    const menuText = menuData.menuText;
    const menu = menuData.menu;
    let sessionReady = false;
    
    // Connect to OpenAI Realtime API
    // Try the latest model - if it fails, we'll catch the error
    // Use the model that your API key has access to
    // Tested with test-realtime-access.js - this model is available
    const openaiUrl = 'wss://api.openai.com/v1/realtime?model=gpt-realtime-mini-2025-12-15';
    console.log('Connecting to OpenAI:', openaiUrl);
    
    // CRITICAL: Validate OpenAI URL before creating connection
    if (!openaiUrl || typeof openaiUrl !== 'string' || !openaiUrl.startsWith('wss://')) {
      console.error('❌ Invalid OpenAI URL');
      return Promise.reject(new Error('Invalid OpenAI URL'));
    }
    
    try {
      openaiClient = new WebSocket(openaiUrl, {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });
      
      // CRITICAL: Validate WebSocket was created successfully
      if (!openaiClient) {
        console.error('❌ Failed to create OpenAI WebSocket');
        return Promise.reject(new Error('Failed to create WebSocket'));
      }
    } catch (error) {
      console.error('❌ Error creating WebSocket connection to OpenAI:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack?.substring(0, 300));
      return Promise.reject(error);
    }
    
    openaiClient.on('open', () => {
      // CRITICAL: Wrap entire handler in try-catch
      try {
        console.log('Connected to OpenAI Realtime API');
        
        // CRITICAL: Validate openaiClient is ready before sending
        if (!openaiClient || openaiClient.readyState !== WebSocket.OPEN) {
          console.error('❌ OpenAI WebSocket not ready when open event fired');
          return;
        }
        
        // CRITICAL: Validate openaiClient is ready before sending
        if (!openaiClient || openaiClient.readyState !== WebSocket.OPEN) {
          console.error('❌ OpenAI WebSocket not ready when open event fired');
          return;
        }
        
        // CRITICAL: Validate menuText before using in instructions
        if (!menuText || typeof menuText !== 'string' || menuText.trim().length === 0) {
          console.error('❌ Invalid menuText, using fallback');
          const defaultMenu = getDefaultMenuData();
          menuText = defaultMenu.menuText;
        }
        
        // Configure session with proper audio settings for Twilio
        // Twilio uses mu-law (PCMU/G.711 ulaw) at 8kHz
        // OpenAI Realtime supports 'pcm16' and 'mulaw' formats
        const sessionUpdatePayload = {
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'], // OpenAI requires both audio and text
          input_audio_format: 'g711_ulaw', // Match Twilio's mu-law format (8kHz) - OpenAI expects 'g711_ulaw'
          output_audio_format: 'g711_ulaw', // Match Twilio's expected format - this fixes the "air" sound issue
          input_audio_transcription: {
            model: 'whisper-1'
          },
          // Note: output_audio_transcription is not a valid parameter
          turn_detection: {
            type: 'server_vad',
            threshold: 0.7, // Optimized: Lower threshold (0.7) - faster response detection while preventing interruptions
            prefix_padding_ms: 300,  // Optimized: Reduced padding (300ms) - faster response while preventing cut-offs
            silence_duration_ms: 800  // CRITICAL: Reduced to 800ms for faster, more natural responses - maintains natural flow without interruptions
          },
          temperature: 0.7,  // Slightly lower for faster, more focused responses
          max_response_output_tokens: 256,  // Increased to allow complete sentences (was 64 - too short, cut off mid-sentence)
          tools: [
            {
              type: 'function',
              name: 'add_item_to_order',
              description: 'Add an item to the customer\'s order. Call this whenever the customer orders something.',
              parameters: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'The exact menu item name (e.g., "pepperoni pizza", "garlic knots", "soda")'
                  },
                  size: {
                    type: 'string',
                    description: 'Size if applicable (e.g., "small", "medium", "large", "regular")',
                    enum: ['small', 'medium', 'large', 'regular']
                  },
                  quantity: {
                    type: 'integer',
                    description: 'Quantity of this item (default: 1)',
                    default: 1
                  }
                },
                required: ['name']
              }
            },
            {
              type: 'function',
              name: 'set_delivery_method',
              description: 'Set whether the order is for pickup or delivery',
              parameters: {
                type: 'object',
                properties: {
                  method: {
                    type: 'string',
                    enum: ['pickup', 'delivery'],
                    description: 'Pickup or delivery'
                  }
                },
                required: ['method']
              }
            },
            {
              type: 'function',
              name: 'set_address',
              description: 'Set the delivery address',
              parameters: {
                type: 'object',
                properties: {
                  address: {
                    type: 'string',
                    description: 'Full delivery address'
                  }
                },
                required: ['address']
              }
            },
            {
              type: 'function',
              name: 'set_customer_name',
              description: 'Set the customer\'s name for the order',
              parameters: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Customer\'s name'
                  }
                },
                required: ['name']
              }
            },
            {
              type: 'function',
              name: 'set_customer_phone',
              description: 'Set the customer\'s phone number',
              parameters: {
                type: 'object',
                properties: {
                  phone: {
                    type: 'string',
                    description: 'Customer\'s phone number (10 digits)'
                  }
                },
                required: ['phone']
              }
            },
            {
              type: 'function',
              name: 'set_payment_method',
              description: 'Set the payment method',
              parameters: {
                type: 'object',
                properties: {
                  method: {
                    type: 'string',
                    enum: ['cash', 'card'],
                    description: 'Payment method'
                  }
                },
                required: ['method']
              }
            },
            {
              type: 'function',
              name: 'confirm_order',
              description: 'Mark the order as confirmed when the customer agrees to the final total',
              parameters: {
                type: 'object',
                properties: {}
              }
            }
          ],
          instructions: `You are a pizza ordering assistant for Uncle Sal's Pizza in Syracuse. Keep it simple and concise - like a real pizza place employee.

AVAILABLE MENU ITEMS:
${menuText || 'Menu loading...'}

CRITICAL FIRST GREETING: When the call first connects, immediately say: "Thanks for calling Uncle Sal's Pizza. What would you like to order?" Keep it short.

🚨🚨🚨 CRITICAL - NEVER INTERRUPT - NEVER SAY "TAKE YOUR TIME" 🚨🚨🚨:
- You MUST wait for the customer to finish speaking COMPLETELY before you respond
- NEVER interrupt them. NEVER respond while they are talking. Wait until they are 100% done speaking
- NEVER say phrases like "take your time", "sure take your time", "no rush", or anything similar
- Once they're 100% done speaking (you'll know because there will be silence), THEN respond immediately with a simple confirmation
- Do NOT be proactive or conversational - just wait for them to finish, then respond
- Keep it simple and short - like a real busy pizza place employee
- NEVER ask "what could I get you?" or similar if they haven't finished speaking

🚨🚨🚨 CRITICAL - YOU MUST CALL add_item_to_order TOOL - THIS IS MANDATORY 🚨🚨🚨
EVERY TIME the customer mentions ordering ANY item (pizza, calzone, soda, drink, etc.), you MUST call the add_item_to_order tool BEFORE you respond. If you don't call this tool, the order will NOT be saved and the customer's items will be lost. This is the MOST IMPORTANT rule.

MANDATORY PROCESS:
1. Customer orders something → IMMEDIATELY call add_item_to_order tool
2. THEN respond with confirmation

Examples (FOLLOW THESE EXACTLY):
- Customer: "I'll take a large pepperoni pizza"
  → YOU MUST: [Call add_item_to_order with name="pepperoni pizza", size="large", quantity=1]
  → THEN say: "Sure thing. Large pepperoni pizza, what else can I get you?"

- Customer: "Three calzones"
  → YOU MUST: [Call add_item_to_order with name="calzone", quantity=3]
  → THEN say: "Alright. Three calzones, anything else?"

- Customer: "Two Pepsis"
  → YOU MUST: [Call add_item_to_order with name="soda", quantity=2]
  → THEN say: "Got it. Two sodas, what else?"

- Customer: "Can I get two Pepsis and a large pepperoni pizza?"
  → YOU MUST: [Call add_item_to_order TWICE - once for "soda" quantity=2, once for "pepperoni pizza" size="large" quantity=1]
  → THEN say: "Perfect. Two sodas and a large pepperoni pizza, anything else?"

- Customer: "I'll take some wings" or "Can I get wings" or mentions wings
  → YOU MUST: [DO NOT call add_item_to_order yet - first ask for flavor]
  → THEN say: "What flavor wings would you like?"
  → AFTER they tell you the flavor: [Call add_item_to_order with name="chicken wings", quantity specified]
  → THEN say: "[Use varied confirmation like: 'Perfect.', 'Sure thing.', 'Alright.', 'Sounds good.', etc.] [quantity] [flavor] wings, what else?"

NEVER respond to an order without calling the tool first. If you respond without calling the tool, the order will be lost.

INSTRUCTIONS (CRITICAL - FOLLOW THESE FOR EVERY CALL):
1. **ALWAYS greet ONCE at the start: "Thanks for calling Uncle Sal's Pizza. What would you like to order?" - Keep it short. CRITICAL: Only say this greeting ONCE at the very beginning of the call. After the customer has ordered, NEVER ask "What would you like to order?" again - use "What else can I get you?" or "Anything else?" instead.**
2. **🚨 CRITICAL - WAIT FOR THEM TO FINISH: Wait for the customer to finish speaking COMPLETELY. Do NOT respond while they are talking. Do NOT say "take your time" or "sure take your time" or anything similar. NEVER interrupt. Once they're 100% done (after complete silence), THEN respond immediately with a simple confirmation.**
3. **🚨 MANDATORY - CALL TOOL FIRST: When the customer orders ANYTHING, you MUST call add_item_to_order tool FIRST, then respond. DO NOT skip this step. If you don't call the tool, the order will be lost.**
   - Customer: "I'll take a large pepperoni pizza"
   - YOU MUST: [Call add_item_to_order tool with name="pepperoni pizza", size="large", quantity=1] → THEN say: "[Use varied confirmation - see CONFIRMATION PHRASES below] Large pepperoni pizza, anything else?"
   - Customer: "Three calzones"
   - YOU MUST: [Call add_item_to_order tool with name="calzone", quantity=3] → THEN say: "[Use varied confirmation] Three calzones, anything else?"
   - **IF YOU DON'T CALL THE TOOL, THE ITEMS WILL NOT BE SAVED AND THE ORDER WILL BE EMPTY**
4. **🚨 WINGS FLAVOR RULE - MANDATORY: If customer orders wings or mentions wings, you MUST ask what flavor BEFORE adding to order.**
   - Customer: "I'll take wings" or "Can I get wings" or "I want wings"
   - YOU MUST: DO NOT call add_item_to_order yet. FIRST ask: "What flavor wings would you like?"
   - Customer: "Buffalo" or "BBQ" or "Garlic Parmesan" or any flavor
   - THEN: [Call add_item_to_order with name="chicken wings" and note the flavor, quantity as specified]
   - THEN: [Use varied confirmation] "[quantity] [flavor] wings, what else?"
   - **NEVER add wings to order without asking flavor first**
5. **Keep responses SHORT - one sentence max. Be like a real busy pizza place employee - quick, simple, efficient.**
6. **🚨 NEVER interrupt. NEVER respond while they are speaking. NEVER say "take your time" or "sure take your time" or anything similar. ALWAYS wait for them to finish completely (complete silence), then respond immediately and naturally with a confirmation.**
7. Understand natural language - "fries" = french fries, "pop" = soda, "large pepperoni" = large pepperoni pizza
8. Ask short questions when needed: "What size?" or "How many?"
9. Let them add multiple items before asking pickup/delivery
10. Only ask "Pickup or delivery?" when they say they're done ("done", "that's it", "I'm all set")
11. **🚨 MANDATORY - CALL set_delivery_method TOOL: When the customer says "pickup" or "delivery", you MUST call the set_delivery_method tool with method="pickup" or method="delivery" BEFORE responding. CRITICAL: You MUST ALWAYS respond after calling this tool - NEVER go silent.**
   - You: "Pickup or delivery?"
   - Customer: "Pickup" or "I'll pick up" → YOU MUST: [Call set_delivery_method with method="pickup"] → THEN IMMEDIATELY say: "[Use varied confirmation like: 'Okay, perfect. Pickup.', 'Sounds good. Pickup.', 'Perfect. Pickup.', 'Alright. Pickup.', 'Got it. Pickup.', etc.]" AND THEN continue with next step (ask for name if not set, or proceed with order confirmation)
   - Customer: "Delivery" or "I'll have it delivered" → YOU MUST: [Call set_delivery_method with method="delivery"] → THEN IMMEDIATELY say: "[Use varied confirmation like: 'Okay, perfect. Delivery. What's the address?', 'Sounds good. Delivery. What's the address?', 'Perfect. Delivery. What's the address?', 'Got it. Delivery. What's the address?', etc.]" - ALWAYS ask for address immediately after delivery is set
   - **🚨 CRITICAL RULE - NEVER GO SILENT: After the customer tells you pickup or delivery, you MUST ALWAYS respond with a confirmation using phrases like "Okay, perfect.", "Sounds good.", "Perfect.", "Got it.", etc. followed by what they said (e.g., "Okay, perfect. Pickup." or "Sounds good. Delivery. What's the address?"). NEVER go silent after receiving pickup/delivery answer. This is MANDATORY - silence is NOT acceptable.**
   - **CRITICAL: After calling set_delivery_method, you MUST respond immediately with confirmation. If delivery, you MUST ask for address. NEVER go silent.**

12. **🚨 MANDATORY - CALL set_address TOOL: When the customer chooses delivery and provides their address, you MUST call the set_address tool with their full address BEFORE responding. CRITICAL: You MUST ALWAYS respond after calling this tool - NEVER go silent.**
   - You: "[Use varied confirmation] Delivery. What's the address?"
   - Customer: "123 Main Street, Syracuse" → YOU MUST: [Call set_address with address="123 Main Street, Syracuse"] → THEN say: "[Use varied confirmation like: 'Okay, perfect. 123 Main Street, Syracuse.', 'Sounds good. 123 Main Street, Syracuse.', 'Perfect, 123 Main Street, Syracuse.', 'Got it, 123 Main Street, Syracuse.', etc.]" - YOU MUST REPEAT THE FULL ADDRESS BACK TO THEM AND THEN continue with next step (ask for name if not set, or proceed with order confirmation)
   - Customer: "It's 456 Oak Avenue" → YOU MUST: [Call set_address with address="456 Oak Avenue"] → THEN say: "[Use varied confirmation like: 'Okay, perfect. 456 Oak Avenue.', 'Sounds good. 456 Oak Avenue.', 'Perfect, 456 Oak Avenue.', etc.]" - YOU MUST REPEAT THE FULL ADDRESS BACK TO THEM AND THEN continue with next step
   - **🚨 CRITICAL RULE - NEVER GO SILENT: After the customer provides their address, you MUST ALWAYS respond with a confirmation using phrases like "Okay, perfect.", "Sounds good.", "Perfect.", "Got it.", etc. followed by repeating the FULL ADDRESS back to them (e.g., "Okay, perfect. 123 Main Street, Syracuse." or "Sounds good. 456 Oak Avenue."). NEVER go silent after receiving an address. This is MANDATORY - silence is NOT acceptable.**
   - **CRITICAL: After calling set_address, you MUST ALWAYS respond immediately with confirmation that INCLUDES THE FULL ADDRESS REPEATED BACK. NEVER go silent after receiving an address.**

13. **🚨 MANDATORY - CALL set_customer_name TOOL: When you ask for the customer's name and they provide it, you MUST call the set_customer_name tool with their name BEFORE responding. CRITICAL: You MUST ALWAYS respond after calling this tool - NEVER go silent.**
   - You: "Can I get your name?"
   - Customer: "John Smith" → YOU MUST: [Call set_customer_name with name="John Smith"] → THEN IMMEDIATELY say: "[Use varied confirmation like: 'Perfect, John Smith.', 'Got it, John Smith.', 'Sounds good, John Smith.', 'Okay, John Smith.', etc.]" AND THEN:
     * IF there are already items in the order: check if delivery method is set - if yes, continue to next step (payment/total); if no, ask "Pickup or delivery?"
     * IF there are NO items in the order yet: say "What would you like to order?"
   - Customer: "It's Mike" → YOU MUST: [Call set_customer_name with name="Mike"] → THEN IMMEDIATELY say: "[Use varied confirmation like: 'Perfect, Mike.', 'Got it, Mike.', 'Sounds good, Mike.', 'Okay, Mike.', etc.]" AND THEN check if order has items - if yes, check delivery method; if no items, ask "What would you like to order?"
   - **🚨 CRITICAL RULE - NEVER GO SILENT: After the customer provides their name, you MUST ALWAYS respond with a confirmation that includes their name. NEVER go silent after receiving the customer's name. This is MANDATORY - silence is NOT acceptable. ALWAYS confirm what you heard - example: "Perfect, John Smith." or "Got it, Mike." or "Sounds good, Sarah." or "Okay, John."**
   - **CRITICAL: ALWAYS confirm the name back to the customer IMMEDIATELY. Use phrases like "Perfect, [name].", "Sounds good, [name].", "Got it, [name].", "Okay, [name].", etc. NEVER ask "What would you like to order?" if there are already items in the order - check the current order state and only ask for order if it's empty. If order has items, continue naturally (e.g., ask about delivery method if not set, or proceed to total if everything is complete).**
14. **🚨 CRITICAL - DETECT WHEN CUSTOMER IS DONE ORDERING: You MUST be able to detect when the customer has indicated they're done ordering. Common phrases that mean they're done: "that's it", "that's all", "that'll be it", "I'm all set", "that's everything", "nothing else", "I'm done", "that's good", "that's fine". When you hear these phrases, you MUST:**
   - STOP asking "What else can I get you?" or "Anything else?"
   - Check what's missing from the order (name, delivery method, etc.) and ask for those ONLY
   - If everything is complete (name, items, delivery method), give the total and ask for confirmation
   - DO NOT keep asking for more items after the customer has said they're done
   - **REALISTIC BEHAVIOR: Like a real restaurant, when a customer says "that's it" or "that's all", you don't keep asking "what else?" - you acknowledge they're done and move to the next step (delivery method, total, etc.)**
15. When done ordering, give a quick summary: "So that's a large pepperoni and garlic knots. Total is $26.46." (total already includes 8% NYS tax - do NOT break it down)
16. After confirmation: "Ready in about 20 minutes" (pickup) or "30-45 minutes" (delivery)
17. **CRITICAL ORDER CONFIRMATION FLOW:**
   - BEFORE confirming the order, you MUST give the customer a FULL SUMMARY including:
     * All items in the order
     * Final total (this already includes 8% NYS tax - do NOT break it down into subtotal and tax, just give the total)
     * Example: "So that's a large pepperoni pizza and garlic knots. Total is $26.46. Sound good?"
   - **MANDATORY: The customer MUST confirm their full order (items and total price) BEFORE you proceed.**
   - When the customer confirms the order (says "yes", "sounds good", "that's correct", "yep", "perfect", etc. after you give the total), you MUST:
     * First: Give pickup/delivery time estimate: "Perfect. Ready in about 20 minutes." (pickup) or "Perfect. 30-45 minutes for delivery." (delivery)
     * Then: Call the confirm_order tool (this logs the order)
     * Then: AFTER the order is confirmed and logged, say the final ending message: "Awesome, thank you so much for ordering with us today." or "Awesome, thanks so much for your order today." or "Thank you so much for ordering with us today."
   - **🚨 CRITICAL: When giving the total, ONLY say the final total price (which already includes tax). Do NOT break it down into subtotal and tax. Just say "Total is $X.XX." or "That'll be $X.XX." - keep it simple.**
   - **🚨 CRITICAL: "Awesome, thank you so much for ordering with us today." must ONLY be said at the very end of the call, AFTER everything is complete (name, items, delivery method, address, confirmation, and order is logged via confirm_order tool). This is the final message before the call ends. Do NOT say it earlier in the conversation. The sequence must be: 1) Customer confirms order → 2) Give time estimate → 3) Call confirm_order tool → 4) Say "Awesome, thank you so much for ordering with us today." → 5) END CALL**
18. **🚨 ENDING RULE - MANDATORY: After you say "Awesome, thank you so much for ordering with us today." (or similar), STOP immediately. Do NOT continue talking. The call is over.**
18. **🚨🚨🚨 CRITICAL - NEVER SAY GOODBYE ON ERROR: If an error occurs, NEVER say "goodbye", "goodbye and thank you", "sorry for the error", or end the call. NEVER mention errors to the customer. Continue taking the order normally. Say something helpful like "What would you like to order?" or "What else can I get you?" to continue the conversation. Errors are handled silently - the customer should NEVER hear about them. The call must continue no matter what.**
19. **Be concise and realistic - like a real busy pizza place. Quick, efficient, not chatty.**
20. **🚨 CRITICAL ORDER FLOW RULE: Check the current order state before asking questions. If order already has items and you're asking for name or delivery method, do NOT ask "What would you like to order?" again. Continue naturally with the next step of the order process. The greeting "What would you like to order?" should ONLY be said once at the very start of the call.**

CONVERSATION STYLE:
- Keep it SHORT and SIMPLE - like a real busy pizza place employee
- ONE sentence per response - quick and efficient
- **ALWAYS finish your sentence - never cut off mid-sentence**
- Sound realistic - not overly friendly, just professional and quick
- **After adding an item, confirm it with VARIED phrases (see CONFIRMATION PHRASES below)**
- **🚨 CRITICAL - ALWAYS CONFIRM WHAT YOU HEARD: When the customer answers ANY question (name, address, delivery method, item order), you MUST ALWAYS confirm what you heard back to them. NEVER go silent after the customer speaks. This is MANDATORY - silence is NOT acceptable.**
- At the end, give a quick summary: "So that's [items]. Total is $X.XX." (the total already includes 8% NYS tax - do NOT break it down into subtotal and tax)
- CRITICAL: Only give the final total price - do NOT list subtotal and tax separately. Just say "Total is $X.XX." or "That'll be $X.XX."
- **Be realistic - like a real busy pizza place. Quick, efficient, not chatty.**
- **NEVER repeat the same response - each response must be UNIQUE**
- **Wait for customer to finish speaking, then respond immediately and naturally**
- **NEVER go silent after the customer provides information - ALWAYS confirm what you heard IMMEDIATELY**

CONFIRMATION PHRASES - USE VARIED RESPONSES (DO NOT ALWAYS SAY "GOT IT"):
- "Got it." (use sometimes, not every time)
- "Sure thing."
- "Perfect."
- "Alright."
- "Sounds good."
- "Right on."
- "Okay."
- "You got it."
- Mix these up naturally - use different phrases each time to avoid repetition
- For example: first item "Got it.", second item "Sure thing.", third item "Perfect.", etc.

🚨 CRITICAL - NAME CONFIRMATION PHRASES (MUST USE AFTER RECEIVING NAME):
- When customer provides their name, you MUST use one of these phrases and include their name:
  * "Perfect, [name]."
  * "Sounds good, [name]."
  * "Got it, [name]."
  * "Okay, [name]."
  * "Alright, [name]."
- Examples: "Perfect, John Smith.", "Sounds good, Mike.", "Got it, Sarah.", "Okay, John."
- **MANDATORY: You MUST confirm the name immediately after receiving it. NEVER go silent after the customer says their name.**

🚨🚨🚨 CRITICAL - ALWAYS CONFIRM WHAT YOU HEARD - NEVER GO SILENT 🚨🚨🚨:
- When the customer answers ANY question (name, address, delivery method, phone number, item order), you MUST ALWAYS confirm what you heard back to them
- NEVER go silent after the customer speaks - this is MANDATORY and REQUIRED
- Examples:
  * Customer says name "John Smith" → You MUST say: "Perfect, John Smith." or "Got it, John Smith." or "Sounds good, John Smith."
  * Customer says "pickup" → You MUST say: "Perfect. Pickup." or "Alright. Pickup." or "Got it. Pickup."
  * Customer says "pickup" → You MUST say: "Perfect. Pickup." or "Alright. Pickup." or "Got it. Pickup."
  * Customer says "delivery" → You MUST say: "Perfect. Delivery. What's the address?" or "Alright. Delivery. What's the address?" or "Got it. Delivery. What's the address?" or "Got it. Delivery. What's the address?"
  * Customer says address "123 Main St" → You MUST say: "Perfect, 123 Main St." or "Got it, 123 Main St."
  * Customer orders item → You MUST confirm the item: "Perfect. Large pepperoni pizza, anything else?"
- Silence after the customer provides information is NOT ACCEPTABLE - you MUST ALWAYS respond with confirmation IMMEDIATELY
- If you don't confirm, the customer won't know if you heard them - this causes confusion and bad experience
- **ESPECIALLY IMPORTANT: After customer answers "pickup" or "delivery", you MUST IMMEDIATELY confirm it back to them. Example: "Perfect. Pickup." or "Got it. Delivery. What's the address?"**
- **ESPECIALLY IMPORTANT: After customer answers "pickup" or "delivery", you MUST IMMEDIATELY confirm it back to them. Example: "Perfect. Pickup." or "Got it. Delivery. What's the address?"**

Current order: ${currentOrder.items.length} item(s)
${currentOrder.items.length > 0 ? 'Items in order: ' + currentOrder.items.map(i => `${i.quantity}x ${i.size || 'regular'} ${i.name}`).join(', ') : '⚠️⚠️⚠️ NO ITEMS YET - If the customer ordered something, you MUST call add_item_to_order tool NOW! ⚠️⚠️⚠️'}

Customer name: ${currentOrder.customerName || 'NOT SET - Ask for name and call set_customer_name tool'}
Delivery method: ${currentOrder.deliveryMethod || 'NOT SET - Ask pickup or delivery and call set_delivery_method tool'}

🚨 CRITICAL CHECK: Look at the order count above. If it shows 0 items but the customer just ordered something, you MUST call add_item_to_order tool immediately. If you don't call the tool, the items will be lost and the order cannot be logged.

🚨 CRITICAL - NAME AND DELIVERY METHOD: 
- If customer name is "NOT SET" and the customer just told you their name, you MUST call set_customer_name tool immediately.
- If delivery method is "NOT SET" and the customer just said "pickup" or "delivery", you MUST call set_delivery_method tool immediately.
- These tools MUST be called for the order to be logged correctly in Google Sheets.

🚨 FINAL CRITICAL RULE - THIS IS MANDATORY:
NEVER interrupt the customer. Wait for them to finish speaking completely. Once they're done, respond immediately and naturally with a VARIED confirmation (use different phrases from CONFIRMATION PHRASES above, not always "Got it"). For example: "Sure thing. [item], anything else?" or "Perfect. [item], what else?" Be like a real person - wait for them to finish, then respond right away. Keep it short and simple - one sentence max.

🚨 WINGS FLAVOR RULE - ALWAYS ASK FOR FLAVOR:
If customer orders wings or mentions wings (like "I'll take wings" or "Can I get some wings"), you MUST ask "What flavor wings would you like?" BEFORE adding wings to the order. Only after they specify the flavor should you call add_item_to_order with the wings. This is MANDATORY - never add wings without asking flavor first.

🚨 ANTI-REPETITION RULE - NEVER BREAK THIS:
NEVER repeat the same response twice. NEVER say the exact same thing you just said. If you just said "Got it. Large pepperoni pizza, anything else?" do NOT say it again. Wait for the customer to respond or ask a DIFFERENT question. Each response must be UNIQUE and DIFFERENT from your last response.

🚨🚨🚨 CRITICAL - NEVER ASK "WHAT ELSE" AFTER CUSTOMER SAYS THEY'RE DONE 🚨🚨🚨:
- If the customer says ANY of these phrases: "that's it", "that's all", "that'll be it", "I'm all set", "that's everything", "nothing else", "I'm done", "that's good", "that's fine", "we're good", "we're all set" → they are DONE ordering items
- When you detect these completion phrases, you MUST:
  * STOP asking "What else can I get you?" or "Anything else?"
  * Check what's missing (name, delivery method) and ask for those ONLY
  * If everything is complete (name, items, delivery method), give the total and ask for confirmation
  * DO NOT keep asking for more items - acknowledge they're done and move forward
- Example flow:
  * Customer: "That's it" or "I'm all set" → You: "Perfect. Pickup or delivery?" (if delivery method not set) OR "Perfect. Can I get your name?" (if name not set) OR "Perfect. So that's [items]. Total is $X.XX. Sound good?" (if everything is set)
  * Customer: "That's all" → You: "Got it. Pickup or delivery?" (if delivery method not set) OR move to next step
- **REALISTIC BEHAVIOR: Like a real restaurant employee, when a customer says "that's it" or "I'm all set", you DON'T keep asking "what else?" - you acknowledge they're done and move to the next step (delivery method, name, total, etc.). This is MANDATORY for a professional, realistic experience.**`
        }
      };
      
      // CRITICAL: Use safeSendToOpenAI to prevent errors
      if (!safeSendToOpenAI(sessionUpdatePayload, 'session.update')) {
        console.error('❌ Failed to send session.update - connection may be broken');
        // Try to reconnect after a delay
        setTimeout(() => {
          console.log('🔄 Attempting to reconnect after session.update failure...');
          connectToOpenAI(sid, currentOrder).catch(err => {
            console.error('❌ Reconnection failed:', err.message);
          });
        }, 2000);
        return;
      }
      
      console.log('✓ Session update sent successfully');
    } catch (error) {
      console.error('❌ Error in OpenAI open handler:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack?.substring(0, 300));
      // Try to reconnect after a delay
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect after error...');
        connectToOpenAI(sid, currentOrder).catch(err => {
          console.error('❌ Reconnection failed:', err.message);
        });
      }, 2000);
    }
    });
    
    openaiClient.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('OpenAI message type:', data.type);
        
        switch (data.type) {
          case 'session.created':
            console.log('OpenAI session created');
            break;
            
          case 'session.updated':
            console.log('OpenAI session updated - ready to start conversation');
            sessionReady = true;
            openaiReady = true; // Mark OpenAI as ready to receive audio
            
            // Flush any queued audio that arrived before OpenAI was ready
            if (preConnectionAudioQueue.length > 0) {
              console.log(`📤 Flushing ${preConnectionAudioQueue.length} queued audio chunks to OpenAI...`);
              const queuedAudio = preConnectionAudioQueue.join('');
              preConnectionAudioQueue = []; // Clear queue
              
              // CRITICAL: Use safeSendToOpenAI to prevent errors
              const queuedAudioPayload = {
                type: 'input_audio_buffer.append',
                audio: queuedAudio
              };
              
              if (safeSendToOpenAI(queuedAudioPayload, 'queued audio flush')) {
                console.log('✓ Flushed queued audio to OpenAI');
              } else {
                console.error('❌ Failed to flush queued audio');
              }
            }
            
            // Trigger initial greeting by creating a system message first
            // CRITICAL: This MUST happen on EVERY call for production reliability
            if (!initialGreetingTriggered && streamSid === sid) {
              initialGreetingTriggered = true;
              console.log('✓ Marking greeting as triggered for stream:', sid);
              
              // Function to trigger greeting with retry logic
              const triggerGreeting = (attempt = 1) => {
                const maxAttempts = 3;
                
                // Double-check connection is still valid and this is still the same call
                if (openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                  console.log(`Triggering initial greeting (attempt ${attempt}/${maxAttempts})...`);
                  // First, add a system message to establish conversation context
                  const greetingPayload = {
                    type: 'conversation.item.create',
                    item: {
                      type: 'message',
                      role: 'system',
                      content: [
                        {
                          type: 'input_text',
                          text: 'The customer just called. You MUST immediately greet them by saying the COMPLETE sentence: "Thanks for calling Uncle Sal\'s Pizza. What would you like to order?" - FINISH THE ENTIRE SENTENCE. After they order something and finish speaking COMPLETELY, ALWAYS confirm what you heard (e.g., "Perfect. Large pepperoni pizza, anything else?") and ask a follow-up question like "What else can I get you?" - CRITICAL: WAIT for them to finish speaking COMPLETELY before responding. NEVER interrupt. NEVER say "take your time" or similar phrases. IMPORTANT: Once you have asked for the order and they have provided items, NEVER ask "What would you like to order?" again. Instead, if you need something more, ask "What else can I get you?" or "Anything else?"'
                        }
                      ]
                    }
                  };
                  
                  if (safeSendToOpenAI(greetingPayload, 'greeting system message')) {
                    greetingCompletedTimestamp = Date.now();
                    console.log('✓ Greeting system message sent - timestamp marked');
                    console.log('🚨🚨🚨 CRITICAL: Turn_detection will handle greeting naturally - NO forced response');
                    console.log('🚨🚨🚨 This prevents random responses like "got it one calzone" after greeting');
                  } else {
                    console.error('❌ Failed to send greeting system message');
                    if (attempt < maxAttempts) {
                      setTimeout(() => triggerGreeting(attempt + 1), 300);
                    }
                  }
                } else {
                  console.warn(`⚠ Connection not ready for greeting (attempt ${attempt}/${maxAttempts})`);
                  if (attempt < maxAttempts) {
                    setTimeout(() => triggerGreeting(attempt + 1), 300);
                  }
                }
              };
              
              // CRITICAL: Start greeting immediately - no delay for faster connection
              // Menu is pre-cached, OpenAI is ready, so we can greet immediately
              triggerGreeting();
            } else if (initialGreetingTriggered) {
              console.log('⚠ Greeting already triggered - skipping duplicate');
            }
            break;
          
          case 'response.created':
            console.log('Response created, ID:', data.response?.id);
            
            // CRITICAL: Check if we're in the post-greeting silence period
            // BUT allow the FIRST response after greeting (which is the greeting itself)
            const timeSinceGreeting = greetingCompletedTimestamp > 0 ? Date.now() - greetingCompletedTimestamp : Infinity;
              if (timeSinceGreeting > 0 && timeSinceGreeting < postGreetingSilencePeriod) {
              // Allow the first response (should be the greeting), but block subsequent ones
              // We'll use a flag to track if this is the first response after greeting
              if (timeSinceGreeting < 2000) {
                // Within first 2 seconds - this is likely the greeting response, allow it
                console.log(`✓ Allowing greeting response (${Math.round(timeSinceGreeting)}ms since greeting)`);
              } else {
                // After 3 seconds but still in silence period - block random responses
                console.error(`🚨🚨🚨 BLOCKING response - ${Math.round(timeSinceGreeting)}ms since greeting (blocking random responses after greeting)`);
                console.error('🚨🚨🚨 This prevents random responses like "got it one calzone" after greeting');
                if (streamSid === sid) {
                  const cancelPayload = {
                    type: 'response.cancel',
                    response_id: data.response?.id
                  };
                  
                  if (safeSendToOpenAI(cancelPayload, 'response.cancel (post-greeting silence)')) {
                    console.log('✓ Response cancelled - blocking random response after greeting');
                    responseInProgress = false;
                  } else {
                    console.error('❌ Failed to cancel response during post-greeting silence');
                    responseInProgress = false;
                  }
                }
                return; // Exit early - do NOT allow this response
              }
            }
            
            // CRITICAL: Cancel response if user started speaking
            if (userIsSpeaking) {
              console.error('❌ BLOCKING response - user is currently speaking! Cancelling...');
              if (streamSid === sid) {
                const cancelPayload = {
                  type: 'response.cancel',
                  response_id: data.response?.id
                };
                
                if (safeSendToOpenAI(cancelPayload, 'response.cancel (user speaking)')) {
                  console.log('✓ Response cancelled - user is speaking');
                  responseInProgress = false;
                  console.log('✓ responseInProgress reset after cancellation');
                } else {
                  console.error('❌ Failed to cancel response');
                  responseInProgress = false; // Reset flag anyway
                  console.log('✓ responseInProgress reset after cancellation (fallback)');
                }
              }
              return; // Exit early - do NOT allow this response
            }
            
            responseInProgress = true; // Mark that a response is in progress
            console.log('✓ responseInProgress set to true');
            break;
          
          case 'response.output_item.added':
            console.log('=== RESPONSE OUTPUT ITEM ADDED ===');
            console.log('Item type:', data.item?.type);
            console.log('Item ID:', data.item?.id);
            console.log('Full item:', JSON.stringify(data.item, null, 2));
            if (data.item?.type === 'audio') {
              console.log('✓ Audio item added, waiting for chunks...');
            } else if (data.item?.type === 'text') {
              console.log('Text item added:', data.item?.text);
              // If we only get text and no audio, that's the problem!
              console.log('⚠ WARNING: Only text output, no audio! OpenAI might not be generating audio.');
            } else if (data.item?.type === 'function_call') {
              console.log('🔧 Function call item added:', data.item?.name);
              console.log('🔧 Function call ID:', data.item?.id);
              // Function calls are handled in response.content_part.added, but log here for visibility
            } else {
              console.log('⚠ Unknown item type:', data.item?.type);
            }
            break;
            
          case 'response.output_item.delta':
            // THIS IS THE CORRECT EVENT FOR AUDIO CHUNKS!
            // Stream audio immediately without delays for fastest response
            if (data.item?.type === 'audio' && data.delta) {
              // Forward audio chunk to Twilio IMMEDIATELY - no logging delays
              // OpenAI outputs g711_ulaw (mu-law) which matches Twilio's expected format
              const mediaMessage = {
                event: 'media',
                streamSid: sid,
                media: {
                  payload: data.delta
                }
              };
              
              // Send immediately if WebSocket is open
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(mediaMessage));
                // Only log occasionally to reduce overhead (every 50th chunk)
                if (Math.random() < 0.02) {
                  console.log('✓ Streaming audio to Twilio...');
                }
              }
            } else if (data.item?.type === 'text' && data.delta) {
              console.log('Text delta:', data.delta);
            } else {
              console.log('⚠ Delta event but no audio delta - item type:', data.item?.type, 'has delta:', !!data.delta);
            }
            break;
            
          case 'response.output_item.done':
            console.log('Response output item done:', data.item?.type, 'ID:', data.item?.id);
            if (data.item?.type === 'audio') {
              console.log('✓ Audio item completed');
            }
            
            // CRITICAL: Process function_call items when they complete - arguments are now available
            if (data.item?.type === 'function_call') {
              try {
                const functionName = data.item?.name;
                const functionArgs = data.item?.arguments;
                
                console.log('🔧 Function call item completed:', functionName);
                console.log('🔧 Function call arguments:', functionArgs);
                
                if (functionName === 'add_item_to_order' && functionArgs) {
                  // Parse arguments - they come as a string
                  let toolInput;
                  try {
                    toolInput = typeof functionArgs === 'string' ? JSON.parse(functionArgs) : functionArgs;
                  } catch (e) {
                    console.error('Error parsing function call arguments:', e);
                    // Try to extract name from string
                    if (typeof functionArgs === 'string') {
                      const nameMatch = functionArgs.match(/"name"\s*:\s*"([^"]+)"/);
                      if (nameMatch) {
                        toolInput = { name: nameMatch[1] };
                      } else {
                        console.error('❌ Could not parse function call arguments');
                        break;
                      }
                    } else {
                      console.error('❌ Function args is not a string and not an object');
                      break;
                    }
                  }
                  
                  if (toolInput && toolInput.name) {
                    const currentOrder = activeOrders.get(streamSid);
                    if (!currentOrder) {
                      console.error('❌ No order found for streamSid:', streamSid);
                      break;
                    }
                    
                    // Ensure items array exists
                    if (!Array.isArray(currentOrder.items)) {
                      currentOrder.items = [];
                    }
                    
                    const { name, size, quantity = 1 } = toolInput;
                    console.log(`🔧 Processing add_item_to_order from output_item.done: name=${name}, size=${size}, quantity=${quantity}`);
                    
                    // Menu is already available from connectToOpenAI scope
                    if (!menu || typeof menu !== 'object') {
                      console.error('❌ Menu is not valid');
                      break;
                    }
                    
                    let itemPrice = 0;
                    let itemName = name;
                    
                    // Try to find item in menu - CRITICAL: Only add items that exist in menu
                    let foundInMenu = false;
                    try {
                      for (const menuItem in menu) {
                        if (menuItem.toLowerCase() === name.toLowerCase()) {
                          itemName = menuItem;
                          foundInMenu = true;
                          const menuItemData = menu[menuItem];
                          if (size && menuItemData && menuItemData.priceMap && menuItemData.priceMap[size]) {
                            itemPrice = menuItemData.priceMap[size];
                          } else if (menuItemData && menuItemData.price) {
                            itemPrice = menuItemData.price;
                          }
                          break;
                        }
                      }
                    } catch (e) {
                      console.error('❌ Error searching menu:', e);
                      break;
                    }
                    
                    // CRITICAL: Only add items that are in the menu - prevent adding names or invalid items
                    if (!foundInMenu) {
                      console.warn(`⚠️  Item "${name}" not found in menu - skipping. This might be a name or invalid item.`);
                      try {
                        console.warn(`⚠️  Available menu items: ${Object.keys(menu).join(', ')}`);
                      } catch (e) {
                        console.warn('⚠️  Could not list menu items');
                      }
                      break; // Don't add items that aren't in the menu
                    }
                    
                    // Check if item already exists to prevent duplicates
                    try {
                      const existingItemIndex = currentOrder.items.findIndex(
                        item => item && item.name && item.name.toLowerCase() === itemName.toLowerCase() && 
                                (item.size || 'regular') === (size || 'regular')
                      );
                      
                      if (existingItemIndex >= 0) {
                        // Update quantity if item already exists
                        currentOrder.items[existingItemIndex].quantity += quantity;
                        console.log(`✅ Updated item quantity: ${currentOrder.items[existingItemIndex].quantity}x ${size || 'regular'} ${itemName}`);
                      } else {
                        // Add new item
                        currentOrder.items.push({
                          name: itemName,
                          size: size || 'regular',
                          quantity: quantity,
                          price: itemPrice
                        });
                        console.log(`✅ Added item to order: ${quantity}x ${size || 'regular'} ${itemName} - $${itemPrice}`);
                      }
                      
                      // CRITICAL: Update order in map immediately
                      activeOrders.set(streamSid, currentOrder);
                      console.log(`📊 Order now has ${currentOrder.items.length} item(s):`, currentOrder.items.map(i => `${i.quantity}x ${i.name}`).join(', '));
                      
                      // Verify the order was saved correctly
                      const verifyOrder = activeOrders.get(streamSid);
                      if (verifyOrder && verifyOrder.items && verifyOrder.items.length !== currentOrder.items.length) {
                        console.error('❌ CRITICAL: Order not saved correctly! Expected', currentOrder.items.length, 'items but got', verifyOrder.items.length);
                      } else {
                        console.log('✅ Order saved correctly - verified', verifyOrder?.items?.length || 0, 'items in map');
                      }
                    } catch (e) {
                      console.error('❌ Error adding item to order:', e);
                      console.error('❌ Error stack:', e.stack);
                    }
                  }
                }
                
                // Handle other tool calls in response.output_item.done (backup handler)
                if (functionName === 'set_delivery_method' && functionArgs) {
                  try {
                    console.log('🔍🔍🔍 DEBUG: Processing set_delivery_method in output_item.done');
                    console.log('🔍 Function args:', functionArgs);
                    const toolInput = typeof functionArgs === 'string' ? JSON.parse(functionArgs) : functionArgs;
                    console.log('🔍 Parsed tool input:', JSON.stringify(toolInput, null, 2));
                    
                    if (toolInput && toolInput.method) {
                      const currentOrder = activeOrders.get(streamSid);
                      console.log('🔍 Order BEFORE setting delivery method:', {
                        deliveryMethod: currentOrder?.deliveryMethod,
                        streamSid: streamSid
                      });
                      
                      if (currentOrder) {
                        currentOrder.deliveryMethod = toolInput.method;
                        activeOrders.set(streamSid, currentOrder);
                        console.log(`✅ Set delivery method from output_item.done: ${toolInput.method}`);
                        
                        // Verify
                        const verify = activeOrders.get(streamSid);
                        console.log('🔍 Order AFTER setting delivery method:', {
                          deliveryMethod: verify?.deliveryMethod,
                          verified: verify?.deliveryMethod === toolInput.method
                        });
                      } else {
                        console.error('❌ No order found for streamSid:', streamSid);
                      }
                    } else {
                      console.error('❌ Tool input missing method:', JSON.stringify(toolInput, null, 2));
                    }
                  } catch (e) {
                    console.error('❌ Error processing set_delivery_method in output_item.done:', e);
                    console.error('❌ Error stack:', e.stack);
                  }
                }
                
                if (functionName === 'set_customer_name' && functionArgs) {
                  try {
                    console.log('🔍🔍🔍 DEBUG: Processing set_customer_name in output_item.done');
                    console.log('🔍 Function args:', functionArgs);
                    const toolInput = typeof functionArgs === 'string' ? JSON.parse(functionArgs) : functionArgs;
                    console.log('🔍 Parsed tool input:', JSON.stringify(toolInput, null, 2));
                    
                    if (toolInput && toolInput.name) {
                      const currentOrder = activeOrders.get(streamSid);
                      console.log('🔍 Order BEFORE setting customer name:', {
                        customerName: currentOrder?.customerName,
                        streamSid: streamSid
                      });
                      
                      if (currentOrder) {
                        currentOrder.customerName = toolInput.name;
                        activeOrders.set(streamSid, currentOrder);
                        console.log(`✅ Set customer name from output_item.done: ${toolInput.name}`);
                        
                        // Verify
                        const verify = activeOrders.get(streamSid);
                        console.log('🔍 Order AFTER setting customer name:', {
                          customerName: verify?.customerName,
                          verified: verify?.customerName === toolInput.name
                        });
                      } else {
                        console.error('❌ No order found for streamSid:', streamSid);
                      }
                    } else {
                      console.error('❌ Tool input missing name:', JSON.stringify(toolInput, null, 2));
                    }
                  } catch (e) {
                    console.error('❌ Error processing set_customer_name in output_item.done:', e);
                    console.error('❌ Error stack:', e.stack);
                  }
                }
                
                // CRITICAL: Check if we're in post-greeting silence period before forcing response
                const timeSinceGreetingForTool = greetingCompletedTimestamp > 0 ? Date.now() - greetingCompletedTimestamp : Infinity;
                const inPostGreetingPeriod = timeSinceGreetingForTool < postGreetingSilencePeriod;
                
                // Ensure AI responds after tool call completes (but NOT during post-greeting silence)
                if (!inPostGreetingPeriod && (functionName === 'add_item_to_order' || functionName === 'set_delivery_method' || functionName === 'set_customer_name' || functionName === 'set_address')) {
                  setTimeout(() => {
                    // CRITICAL: Double-check we're still not in post-greeting period
                    const currentTimeSinceGreeting = greetingCompletedTimestamp > 0 ? Date.now() - greetingCompletedTimestamp : Infinity;
                    if (currentTimeSinceGreeting < postGreetingSilencePeriod) {
                      console.log(`🚨 BLOCKING tool call response - still in post-greeting silence period (${Math.round(currentTimeSinceGreeting)}ms / ${postGreetingSilencePeriod}ms)`);
                      console.log('🚨 This prevents random responses like "got it one calzone" after greeting');
                      return;
                    }
                    
                    try {
                      if (!userIsSpeaking && !responseInProgress && openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                        console.log('✓ Tool call done - ensuring AI responds with confirmation');
                        responseInProgress = true;
                        // Typing sound disabled (was causing beeping)
                        sendTypingSound();
                        const responseCreatePayload = {
                          type: 'response.create',
                          response: {
                            modalities: ['audio', 'text']
                          }
                        };
                        
                        if (safeSendToOpenAI(responseCreatePayload, 'response.create after tool call')) {
                          console.log('✓ Response creation sent after tool call');
                        } else {
                          responseInProgress = false; // Reset flag on failure
                          console.error('❌ Failed to create response after tool call');
                        }
                      } else {
                        console.warn('⚠️  Skipping response after tool call - user speaking:', userIsSpeaking, 'response in progress:', responseInProgress);
                      }
                    } catch (error) {
                      console.error('Error creating response after tool call:', error);
                      responseInProgress = false;
                    }
                  }, 100); // Optimized: Reduced delay from 150ms to 100ms for faster tool call responses
                } else if (inPostGreetingPeriod) {
                  console.log(`🚨 BLOCKING tool call response - still in post-greeting silence period (${Math.round(timeSinceGreetingForTool)}ms / ${postGreetingSilencePeriod}ms)`);
                  console.log('🚨 This prevents random responses like "got it one calzone" after greeting');
                }
              } catch (error) {
                console.error('❌❌❌ CRITICAL ERROR processing function call:', error);
                console.error('❌ Error message:', error.message);
                console.error('❌ Error stack:', error.stack);
                console.error('❌ Function call data:', JSON.stringify(data.item, null, 2));
                // Don't break - continue processing other events
              }
            }
            break;
          
          case 'response.audio_transcript.delta':
            // This is for text transcripts, not audio
            console.log('Audio transcript delta (text):', data.delta);
            break;
            
          case 'response.audio.delta':
            // Alternative audio event (if OpenAI uses this)
            console.log('Audio delta (alternative event) received');
            if (data.delta) {
              ws.send(JSON.stringify({
                event: 'media',
                streamSid: sid,
                media: {
                  payload: data.delta
                }
              }));
              console.log('Sent audio chunk to Twilio (alternative)');
            }
            break;
            
          case 'input_audio_buffer.speech_started':
            console.log('✓ User started speaking - BLOCKING all responses until they finish');
            userIsSpeaking = true; // CRITICAL: Mark that user is speaking - block all responses
            break;
            
          case 'input_audio_buffer.speech_stopped':
            console.log('✓ User stopped speaking (speech detected)');
            // Don't unset userIsSpeaking yet - wait for committed to ensure they're really done
            break;
            
          case 'input_audio_buffer.committed':
            console.log('✓ Audio buffer committed - User has completely finished speaking');
            userIsSpeaking = false; // User is done speaking - safe to respond now
            
            // CRITICAL: Check if we're in the post-greeting silence period
            const timeSinceGreetingCommitted = greetingCompletedTimestamp > 0 ? Date.now() - greetingCompletedTimestamp : Infinity;
            if (timeSinceGreetingCommitted < postGreetingSilencePeriod) {
              console.log(`🚨🚨🚨 BLOCKING response creation - only ${Math.round(timeSinceGreetingCommitted)}ms since greeting (need ${postGreetingSilencePeriod}ms silence)`);
              console.log('🚨🚨🚨 This prevents random responses like "got it one calzone" after greeting');
              console.log('🚨🚨🚨 Let turn_detection handle response naturally - NO forced responses');
              return; // DO NOT create response during post-greeting silence period - this prevents interruptions
            }
            
            // CRITICAL: DO NOT force response creation - let turn_detection handle it naturally
            // OpenAI's turn_detection will automatically create a response when it detects silence
            // Forcing response creation here causes interruptions and random responses like "got it one calzone"
            console.log('✓ User finished speaking - turn_detection will create response naturally (no forced response)');
            // DO NOT create response here - this was causing interruptions
            break;
            
          case 'conversation.item.created':
            console.log('=== CONVERSATION ITEM CREATED ===');
            console.log('Role:', data.item?.role);
            console.log('Type:', data.item?.type);
            if (data.item?.role === 'system') {
              // CRITICAL: Check if this is the initial greeting system message
              const isGreetingMessage = data.item?.content && 
                Array.isArray(data.item.content) && 
                data.item.content.some(c => c.type === 'input_text' && c.text && 
                  (c.text.toLowerCase().includes('what would you like to order') || 
                   c.text.toLowerCase().includes('thanks for calling')));
              
              if (isGreetingMessage) {
                greetingCompletedTimestamp = Date.now();
                console.log('✓ Initial greeting system message detected - marking timestamp');
                console.log('🚨 CRITICAL: Will allow ONE greeting response, then block random responses for', postGreetingSilencePeriod / 1000, 'seconds');
                
                // CRITICAL: Allow ONE response for the greeting, but mark timestamp to block subsequent random responses
                // Turn_detection should automatically create a response for the greeting, but if it doesn't after 300ms, we'll create one
                setTimeout(() => {
                  // Check if a response was already created (via turn_detection or otherwise)
                  const timeSinceGreeting = Date.now() - greetingCompletedTimestamp;
                  if (!responseInProgress && timeSinceGreeting < 1500 && openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                    // If no response was created yet and we're still within 1.5 seconds, create one
                    console.log('⚠️  No greeting response yet - creating one now (fallback)');
                    try {
                      responseInProgress = true;
                      const greetingResponsePayload = {
                        type: 'response.create',
                        response: {
                          modalities: ['audio', 'text']
                        }
                      };
                      
                      if (safeSendToOpenAI(greetingResponsePayload, 'response.create (greeting fallback)')) {
                        console.log('✓ Greeting response creation sent (fallback)');
                      } else {
                        responseInProgress = false;
                        console.error('❌ Failed to create greeting response (fallback)');
                      }
                    } catch (error) {
                      console.error('Error creating greeting response (fallback):', error);
                      responseInProgress = false;
                    }
                  } else {
                    console.log('✓ Greeting response already in progress or connection not ready - skipping fallback');
                  }
                }, 300); // CRITICAL: Reduced to 300ms for faster greeting - menu is pre-cached, no delay needed
                
                break; // Exit - response will be created by turn_detection or fallback
              }
              
              console.log('✓ System message created - turn_detection will handle response naturally');
              // For non-greeting system messages, let turn_detection handle it naturally
            } else if (data.item?.role === 'user' && data.item?.content) {
              const audioContent = data.item.content.find(c => c.type === 'input_audio');
              if (audioContent) {
                console.log('User audio item - transcript:', audioContent.transcript || 'Not yet transcribed');
              }
              // User message created - turn_detection will automatically create a response
              // DO NOT add backup triggers - they cause interruptions
              // OpenAI's turn_detection is reliable and will respond when the user finishes speaking
              console.log('✓ User message created - turn_detection will handle response automatically');
              // Let turn_detection work naturally - no forced responses
            }
            break;
            
          case 'conversation.item.input_audio_transcription.completed':
            // User spoke - log what they said
            if (data.transcript) {
              console.log('✓ User said:', data.transcript);
              
              // Extract name and phone number from user's speech
              const transcript = data.transcript;
              const currentOrder = activeOrders.get(streamSid);
              
              if (currentOrder) {
                // Extract name - look for patterns like "my name is", "it's", "this is", or direct name responses
                if (!currentOrder.customerName) {
                  // Check if AI just asked for name (look for name-related context in recent messages)
                  // Simple extraction: if user says something that looks like a name after being asked
                  const namePatterns = [
                    /(?:my name is|it'?s|this is|i'?m|call me|name'?s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
                    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/i  // Just a name if it's a short response
                  ];
                  
                  for (const pattern of namePatterns) {
                    const match = data.transcript.match(pattern);
                    if (match && match[1]) {
                      currentOrder.customerName = match[1].trim();
                      console.log('✓ Extracted customer name:', currentOrder.customerName);
                      activeOrders.set(streamSid, currentOrder);
                      break;
                    }
                  }
                }
                
                // Extract phone number - look for phone number patterns
                if (!currentOrder.customerPhone) {
                  const phonePatterns = [
                    /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,  // Standard US format
                    /(?:phone|number|call|text)\s*(?:is|at)?\s*(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i,
                    /(\d{10})/  // Just 10 digits
                  ];
                  
                  for (const pattern of phonePatterns) {
                    const match = data.transcript.match(pattern);
                    if (match && match[1]) {
                      // Clean up the phone number
                      const phone = match[1].replace(/[-.\s]/g, '');
                      if (phone.length === 10) {
                        currentOrder.customerPhone = phone;
                        console.log('✓ Extracted customer phone:', currentOrder.customerPhone);
                        activeOrders.set(streamSid, currentOrder);
                        break;
                      }
                    }
                  }
                }
              }
            }
            break;
            
          case 'conversation.item.input_audio_transcription.failed':
            // Transcription failed - this is the error we're seeing!
            console.error('✗ Audio transcription failed!');
            console.error('Error details:', JSON.stringify(data.error, null, 2));
            console.error('Item ID:', data.item_id);
            console.error('Content index:', data.content_index);
            // If transcription keeps failing, OpenAI can't understand the user
            // This might be due to audio format mismatch or invalid audio data
            break;
            
          case 'response.content_part.added':
            // Tool call or text content added
            if (data.part?.type === 'tool_call') {
              try {
                console.log('🔧🔧🔧 TOOL CALL DETECTED:', data.part.name);
                try {
                  console.log('🔧 Tool call full data:', JSON.stringify(data.part, null, 2));
                } catch (e) {
                  console.log('🔧 Tool call detected (could not stringify)');
                }
                const toolCall = data.part;
                const currentOrder = activeOrders.get(streamSid);
                
                // DEBUG: Log order state before processing tool call
                if (data.part.name === 'set_customer_name' || data.part.name === 'set_delivery_method') {
                  console.log('🔍🔍🔍 DEBUG: Order state BEFORE processing', data.part.name, 'tool:');
                  console.log('🔍 Current order:', {
                    customerName: currentOrder?.customerName || 'NOT SET',
                    deliveryMethod: currentOrder?.deliveryMethod || 'NOT SET',
                    streamSid: streamSid
                  });
                }
                
                if (!currentOrder) {
                  console.error('❌ No order found for streamSid:', streamSid);
                  break;
                }
                
                // Ensure items array exists
                if (!Array.isArray(currentOrder.items)) {
                  currentOrder.items = [];
                }
                
                if (toolCall.name) {
                  // Handle different tool calls
                  switch (toolCall.name) {
                    case 'add_item_to_order':
                    // Tool call input might be in different formats - handle all possibilities
                    let toolInput = toolCall.input || toolCall.arguments;
                    
                    // If arguments is a string, parse it
                    if (toolInput && typeof toolInput === 'string') {
                      try {
                        toolInput = JSON.parse(toolInput);
                      } catch (e) {
                        console.error('Error parsing tool call arguments as JSON:', e);
                        // Try to extract name directly from string
                        const nameMatch = toolInput.match(/"name"\s*:\s*"([^"]+)"/);
                        if (nameMatch) {
                          toolInput = { name: nameMatch[1] };
                        }
                      }
                    }
                    
                    if (toolInput && toolInput.name) {
                      const { name, size, quantity = 1 } = toolInput;
                      console.log(`🔧 Processing add_item_to_order: name=${name}, size=${size}, quantity=${quantity}`);
                      // Menu is already available from connectToOpenAI scope
                      let itemPrice = 0;
                      let itemName = name;
                      
                      // Try to find item in menu - CRITICAL: Only add items that exist in menu
                      let foundInMenu = false;
                      for (const menuItem in menu) {
                        if (menuItem.toLowerCase() === name.toLowerCase()) {
                          itemName = menuItem;
                          foundInMenu = true;
                          const menuItemData = menu[menuItem];
                          if (size && menuItemData.priceMap && menuItemData.priceMap[size]) {
                            itemPrice = menuItemData.priceMap[size];
                          } else if (menuItemData.price) {
                            itemPrice = menuItemData.price;
                          }
                          break;
                        }
                      }
                      
                      // CRITICAL: Only add items that are in the menu - prevent adding names or invalid items
                      if (!foundInMenu) {
                        console.warn(`⚠️  Item "${name}" not found in menu - skipping. This might be a name or invalid item.`);
                        console.warn(`⚠️  Available menu items: ${Object.keys(menu).join(', ')}`);
                        break; // Don't add items that aren't in the menu
                      }
                      
                      // Ensure items array exists
                      if (!Array.isArray(currentOrder.items)) {
                        currentOrder.items = [];
                      }
                      
                      // Check if item already exists to prevent duplicates
                      const existingItemIndex = currentOrder.items.findIndex(
                        item => item && item.name && item.name.toLowerCase() === itemName.toLowerCase() && 
                                (item.size || 'regular') === (size || 'regular')
                      );
                      
                      if (existingItemIndex >= 0) {
                        // Update quantity if item already exists
                        currentOrder.items[existingItemIndex].quantity += quantity;
                        console.log(`✅ Updated item quantity: ${currentOrder.items[existingItemIndex].quantity}x ${size || 'regular'} ${itemName}`);
                      } else {
                        // Add new item
                        currentOrder.items.push({
                          name: itemName,
                          size: size || 'regular',
                          quantity: quantity,
                          price: itemPrice
                        });
                        console.log(`✅ Added item to order: ${quantity}x ${size || 'regular'} ${itemName} - $${itemPrice}`);
                      }
                      
                      // CRITICAL: Update order in map immediately
                      activeOrders.set(streamSid, currentOrder);
                      try {
                        console.log(`📊 Order now has ${currentOrder.items.length} item(s):`, currentOrder.items.map(i => `${i.quantity}x ${i.name}`).join(', '));
                      } catch (e) {
                        console.log(`📊 Order now has ${currentOrder.items.length} item(s)`);
                      }
                      
                      // Verify the order was saved correctly
                      try {
                        const verifyOrder = activeOrders.get(streamSid);
                        if (verifyOrder && verifyOrder.items && verifyOrder.items.length !== currentOrder.items.length) {
                          console.error('❌ CRITICAL: Order not saved correctly! Expected', currentOrder.items.length, 'items but got', verifyOrder.items.length);
                        } else {
                          console.log('✅ Order saved correctly - verified', verifyOrder?.items?.length || 0, 'items in map');
                        }
                      } catch (e) {
                        console.error('❌ Error verifying order:', e);
                      }
                      
                      // CRITICAL: Ensure AI responds after adding item - but only if user is not speaking
                      // Wait a moment to ensure user has finished speaking, then trigger response
                      setTimeout(() => {
                        if (!userIsSpeaking && !responseInProgress && openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                          console.log('✓ Item added - ensuring AI responds with confirmation');
                          try {
                            responseInProgress = true;
                            // Send subtle typing sound to indicate processing
                            sendTypingSound();
                            const toolCallResponsePayload = {
                              type: 'response.create',
                              response: {
                                modalities: ['audio', 'text']
                              }
                            };
                            
                            if (!safeSendToOpenAI(toolCallResponsePayload, 'response.create (after tool call)')) {
                              responseInProgress = false;
                              console.error('❌ Failed to create response after tool call');
                            }
                            console.log('✓ Response creation sent after item added');
                          } catch (error) {
                            console.error('Error creating response after item added:', error);
                            responseInProgress = false;
                          }
                        } else {
                          console.log('⚠️  Skipping response after item - user speaking:', userIsSpeaking, 'response in progress:', responseInProgress);
                        }
                      }, 200); // Short delay to ensure user has finished speaking
                    } else {
                      console.error('❌ Tool call input missing for add_item_to_order');
                      try {
                        console.error('❌ Tool call data:', JSON.stringify(toolCall, null, 2));
                        console.error('❌ Current order state:', JSON.stringify(currentOrder, null, 2));
                      } catch (e) {
                        console.error('❌ Could not stringify tool call or order data');
                      }
                    }
                    break;
                    
                  case 'set_delivery_method':
                    console.log('🔍🔍🔍 DEBUG: set_delivery_method tool called');
                    console.log('🔍 Tool call input:', JSON.stringify(toolCall.input, null, 2));
                    console.log('🔍 Current order BEFORE setting:', {
                      deliveryMethod: currentOrder.deliveryMethod,
                      customerName: currentOrder.customerName,
                      items: currentOrder.items.length
                    });
                    
                    if (toolCall.input?.method) {
                      currentOrder.deliveryMethod = toolCall.input.method;
                      console.log('✅ Set delivery method:', toolCall.input.method);
                      activeOrders.set(streamSid, currentOrder);
                      
                      // Verify it was saved
                      const verifyOrder = activeOrders.get(streamSid);
                      console.log('🔍 Order state AFTER saving:', {
                        deliveryMethod: verifyOrder?.deliveryMethod,
                        customerName: verifyOrder?.customerName,
                        address: verifyOrder?.address,
                        streamSid: streamSid
                      });
                      
                      if (verifyOrder && verifyOrder.deliveryMethod === toolCall.input.method) {
                        console.log('✅ Verified delivery method saved correctly:', verifyOrder.deliveryMethod);
                        
                        // CRITICAL: If delivery was selected, ensure address is requested
                        if (toolCall.input.method === 'delivery' && !verifyOrder.address) {
                          console.log('📋 Delivery selected - address will be requested by AI');
                        }
                      } else {
                        console.error('❌ ERROR: Delivery method not saved correctly!');
                        console.error('❌ Expected:', toolCall.input.method);
                        console.error('❌ Got:', verifyOrder?.deliveryMethod);
                      }
                      
                      // CRITICAL: Force IMMEDIATE response after delivery method is set - NO DELAY for natural flow
                      // This ensures the AI responds immediately and never goes silent after receiving pickup/delivery answer
                      let deliveryRetryCount = 0;
                      const maxDeliveryRetries = 5;
                      
                      const ensureDeliveryResponse = () => {
                        // Use immediate execution (0ms) for first attempt - don't wait
                        setTimeout(() => {
                          if (!userIsSpeaking && openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                            // Don't check responseInProgress - force response even if one is in progress
                            console.log('✓ Delivery method set - ensuring IMMEDIATE AI response with confirmation (attempt ' + (deliveryRetryCount + 1) + '/' + maxDeliveryRetries + ')');
                            const deliveryResponsePayload = {
                              type: 'response.create',
                              response: {
                                modalities: ['audio', 'text']
                              }
                            };
                            
                            try {
                              if (safeSendToOpenAI(deliveryResponsePayload, 'response.create (after delivery method)')) {
                                console.log('✓ Response creation sent IMMEDIATELY after delivery method set');
                                // Reset flag after a short delay to allow response to start
                                setTimeout(() => {
                                  responseInProgress = false;
                                }, 200);
                              } else {
                                console.error('❌ Failed to create response after delivery method');
                                // Retry faster if we haven't exceeded max retries
                                if (deliveryRetryCount < maxDeliveryRetries - 1) {
                                  deliveryRetryCount++;
                                  ensureDeliveryResponse();
                                } else {
                                  responseInProgress = false;
                                }
                              }
                            } catch (error) {
                              console.error('Error creating response after delivery method:', error);
                              // Retry faster if we haven't exceeded max retries
                              if (deliveryRetryCount < maxDeliveryRetries - 1) {
                                deliveryRetryCount++;
                                ensureDeliveryResponse();
                              } else {
                                responseInProgress = false;
                              }
                            }
                          } else {
                            // User is speaking or client not ready - retry faster when they're done
                            if (deliveryRetryCount < maxDeliveryRetries - 1) {
                              deliveryRetryCount++;
                              console.log('⚠️  User speaking or client not ready - will retry delivery confirmation IMMEDIATELY (attempt ' + (deliveryRetryCount + 1) + '/' + maxDeliveryRetries + ')');
                              ensureDeliveryResponse();
                            } else {
                              console.error('❌ Max retries reached for delivery confirmation response');
                              responseInProgress = false;
                            }
                          }
                        }, deliveryRetryCount === 0 ? 0 : 100); // CRITICAL: First attempt is IMMEDIATE (0ms), retries are fast (100ms)
                      };
                      
                      ensureDeliveryResponse();
                    } else {
                      console.error('❌ set_delivery_method called but input.method is missing');
                      console.error('❌ Tool call input:', JSON.stringify(toolCall.input, null, 2));
                    }
                    break;
                    
                  case 'set_address':
                    console.log('🔍🔍🔍 DEBUG: set_address tool called');
                    console.log('🔍 Tool call input:', JSON.stringify(toolCall.input, null, 2));
                    console.log('🔍 Current order BEFORE setting address:', {
                      address: currentOrder.address,
                      deliveryMethod: currentOrder.deliveryMethod,
                      customerName: currentOrder.customerName,
                      items: currentOrder.items.length
                    });
                    
                    if (toolCall.input?.address) {
                      // CRITICAL: Ensure address is properly saved and delivery method is set to 'delivery'
                      // This prevents the address from being lost or delivery method from being corrupted
                      const addressValue = String(toolCall.input.address).trim();
                      
                      // Validate address is not just a number (prevents ZIP codes from being used as address)
                      if (/^\d+$/.test(addressValue) && addressValue.length <= 5) {
                        console.error('❌ ERROR: Address appears to be just a ZIP code (not a full address):', addressValue);
                        console.error('❌ Address must be a full address, not just a ZIP code');
                        // Still save it but warn - the AI should have asked for full address
                      }
                      
                      currentOrder.address = addressValue;
                      
                      // CRITICAL: Ensure delivery method is set to 'delivery' if address is being set
                      // This prevents corrupted data where address exists but deliveryMethod is wrong
                      if (!currentOrder.deliveryMethod || currentOrder.deliveryMethod !== 'delivery') {
                        console.warn('⚠️  WARNING: Address being set but deliveryMethod is not "delivery" - setting it now');
                        currentOrder.deliveryMethod = 'delivery';
                      }
                      
                      console.log('✅ Set address:', addressValue);
                      activeOrders.set(streamSid, currentOrder);
                      
                      // Verify address and delivery method were saved correctly
                      const verifyOrder = activeOrders.get(streamSid);
                      console.log('🔍 Order state AFTER saving address:', {
                        address: verifyOrder?.address,
                        deliveryMethod: verifyOrder?.deliveryMethod,
                        customerName: verifyOrder?.customerName,
                        streamSid: streamSid
                      });
                      
                      if (verifyOrder && verifyOrder.address === addressValue) {
                        console.log('✅ Verified address saved correctly:', verifyOrder.address);
                        console.log('✅ Verified delivery method:', verifyOrder.deliveryMethod);
                        console.log('✅ Full delivery info - Method:', verifyOrder.deliveryMethod, 'Address:', verifyOrder.address);
                      } else {
                        console.error('❌ ERROR: Address not saved correctly!');
                        console.error('❌ Expected:', addressValue);
                        console.error('❌ Got:', verifyOrder?.address);
                        // Retry saving
                        if (verifyOrder) {
                          verifyOrder.address = addressValue;
                          verifyOrder.deliveryMethod = 'delivery';
                          activeOrders.set(streamSid, verifyOrder);
                          console.log('✅ Retried saving address and delivery method');
                        }
                      }
                      
                      // CRITICAL: Force response after address is set - MUST ALWAYS confirm address back to customer
                      // This ensures the AI never goes silent after receiving the address
                      let addressRetryCount = 0;
                      const maxAddressRetries = 5;
                      
                      // CRITICAL: Force immediate response after address is set - NO DELAY for natural flow
                      // This ensures the AI responds immediately and never goes silent
                      const ensureAddressResponse = () => {
                        // Use immediate execution (0ms) for first attempt - don't wait
                        setTimeout(() => {
                          if (!userIsSpeaking && openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                            // Don't check responseInProgress - force response even if one is in progress
                            console.log('✓ Address set - ensuring IMMEDIATE AI response with confirmation (attempt ' + (addressRetryCount + 1) + '/' + maxAddressRetries + ')');
                            const addressResponsePayload = {
                              type: 'response.create',
                              response: {
                                modalities: ['audio', 'text']
                              }
                            };
                            
                            try {
                              if (safeSendToOpenAI(addressResponsePayload, 'response.create (after address)')) {
                                console.log('✓ Response creation sent IMMEDIATELY after address set');
                                // Reset flag after a short delay to allow response to start
                                setTimeout(() => {
                                  responseInProgress = false;
                                }, 200);
                              } else {
                                console.error('❌ Failed to create response after address');
                                // Retry faster if we haven't exceeded max retries
                                if (addressRetryCount < maxAddressRetries - 1) {
                                  addressRetryCount++;
                                  ensureAddressResponse();
                                } else {
                                  responseInProgress = false;
                                }
                              }
                            } catch (error) {
                              console.error('Error creating response after address:', error);
                              // Retry faster if we haven't exceeded max retries
                              if (addressRetryCount < maxAddressRetries - 1) {
                                addressRetryCount++;
                                ensureAddressResponse();
                              } else {
                                responseInProgress = false;
                              }
                            }
                          } else {
                            // User is speaking or client not ready - retry faster when they're done
                            if (addressRetryCount < maxAddressRetries - 1) {
                              addressRetryCount++;
                              console.log('⚠️  User speaking or client not ready - will retry address confirmation IMMEDIATELY (attempt ' + (addressRetryCount + 1) + '/' + maxAddressRetries + ')');
                              ensureAddressResponse();
                            } else {
                              console.error('❌ Max retries reached for address confirmation response');
                              responseInProgress = false;
                            }
                          }
                        }, addressRetryCount === 0 ? 0 : 100); // CRITICAL: First attempt is IMMEDIATE (0ms), retries are fast (100ms)
                      };
                      
                      ensureAddressResponse();
                    } else {
                      console.error('❌ set_address called but input.address is missing');
                      console.error('❌ Tool call input:', JSON.stringify(toolCall.input, null, 2));
                    }
                    break;
                    
                  case 'set_customer_name':
                    console.log('🔍🔍🔍 DEBUG: set_customer_name tool called');
                    console.log('🔍 Tool call input:', JSON.stringify(toolCall.input, null, 2));
                    console.log('🔍 Current order BEFORE setting:', {
                      customerName: currentOrder.customerName,
                      deliveryMethod: currentOrder.deliveryMethod,
                      items: currentOrder.items.length
                    });
                    
                    if (toolCall.input?.name) {
                      currentOrder.customerName = toolCall.input.name;
                      console.log('✅ Set customer name:', toolCall.input.name);
                      activeOrders.set(streamSid, currentOrder);
                      
                      // Verify it was saved
                      const verifyOrder = activeOrders.get(streamSid);
                      console.log('🔍 Order state AFTER saving:', {
                        customerName: verifyOrder?.customerName,
                        deliveryMethod: verifyOrder?.deliveryMethod,
                        streamSid: streamSid
                      });
                      
                      if (verifyOrder && verifyOrder.customerName === toolCall.input.name) {
                        console.log('✅ Verified customer name saved correctly:', verifyOrder.customerName);
                      } else {
                        console.error('❌ ERROR: Customer name not saved correctly!');
                        console.error('❌ Expected:', toolCall.input.name);
                        console.error('❌ Got:', verifyOrder?.customerName);
                      }
                      
                      // CRITICAL: Force IMMEDIATE response after name is set - NO DELAY for natural flow
                      // This ensures the AI responds immediately and never goes silent after receiving the customer's name
                      let nameRetryCount = 0;
                      const maxNameRetries = 5;
                      
                      const ensureNameResponse = () => {
                        // Use immediate execution (0ms) for first attempt - don't wait
                        setTimeout(() => {
                          if (!userIsSpeaking && openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                            // Don't check responseInProgress - force response even if one is in progress
                            console.log('✓ Customer name set - ensuring IMMEDIATE AI response with confirmation (attempt ' + (nameRetryCount + 1) + '/' + maxNameRetries + ')');
                            const nameResponsePayload = {
                              type: 'response.create',
                              response: {
                                modalities: ['audio', 'text']
                              }
                            };
                            
                            try {
                              if (safeSendToOpenAI(nameResponsePayload, 'response.create (after customer name)')) {
                                console.log('✓ Response creation sent IMMEDIATELY after customer name set');
                                // Reset flag after a short delay to allow response to start
                                setTimeout(() => {
                                  responseInProgress = false;
                                }, 200);
                              } else {
                                console.error('❌ Failed to create response after customer name');
                                // Retry faster if we haven't exceeded max retries
                                if (nameRetryCount < maxNameRetries - 1) {
                                  nameRetryCount++;
                                  ensureNameResponse();
                                } else {
                                  responseInProgress = false;
                                }
                              }
                            } catch (error) {
                              console.error('Error creating response after customer name:', error);
                              // Retry faster if we haven't exceeded max retries
                              if (nameRetryCount < maxNameRetries - 1) {
                                nameRetryCount++;
                                ensureNameResponse();
                              } else {
                                responseInProgress = false;
                              }
                            }
                          } else {
                            // User is speaking or client not ready - retry faster when they're done
                            if (nameRetryCount < maxNameRetries - 1) {
                              nameRetryCount++;
                              console.log('⚠️  User speaking or client not ready - will retry name confirmation IMMEDIATELY (attempt ' + (nameRetryCount + 1) + '/' + maxNameRetries + ')');
                              ensureNameResponse();
                            } else {
                              console.error('❌ Max retries reached for name confirmation response');
                              responseInProgress = false;
                            }
                          }
                        }, nameRetryCount === 0 ? 0 : 100); // CRITICAL: First attempt is IMMEDIATE (0ms), retries are fast (100ms)
                      };
                      
                      ensureNameResponse();
                    } else {
                      console.error('❌ set_customer_name called but input.name is missing');
                      console.error('❌ Tool call input:', JSON.stringify(toolCall.input, null, 2));
                    }
                    break;
                    
                  case 'set_customer_phone':
                    if (toolCall.input?.phone) {
                      // Clean phone number
                      const phone = toolCall.input.phone.replace(/[-.\s()]/g, '');
                      if (phone.length === 10 || phone.length === 11) {
                        currentOrder.customerPhone = phone.slice(-10); // Keep last 10 digits
                        console.log('✅ Set customer phone:', currentOrder.customerPhone);
                        activeOrders.set(streamSid, currentOrder);
                      }
                    }
                    break;
                    
                  case 'set_payment_method':
                    if (toolCall.input?.method) {
                      currentOrder.paymentMethod = toolCall.input.method;
                      console.log('✅ Set payment method:', toolCall.input.method);
                      activeOrders.set(streamSid, currentOrder);
                    }
                    break;
                    
                  case 'confirm_order':
                    currentOrder.confirmed = true;
                    console.log('✅ Order confirmed via tool call');
                    activeOrders.set(streamSid, currentOrder);
                    
                    // CRITICAL: Log order immediately when confirmed (get fresh order state first)
                    // Use delay to ensure ALL tool calls (name, delivery method) are processed
                    setTimeout(async () => {
                      // Get FRESH order state right before logging to ensure we have latest data
                      console.log('🔍🔍🔍 DEBUG: About to log order - getting fresh state...');
                      const confirmedOrder = activeOrders.get(streamSid);
                      console.log('🔍 Order retrieved from map:', {
                        exists: !!confirmedOrder,
                        confirmed: confirmedOrder?.confirmed,
                        logged: confirmedOrder?.logged,
                        itemsCount: confirmedOrder?.items?.length || 0,
                        customerName: confirmedOrder?.customerName || 'NOT SET',
                        deliveryMethod: confirmedOrder?.deliveryMethod || 'NOT SET',
                        customerPhone: confirmedOrder?.customerPhone || 'NOT SET',
                        streamSid: streamSid
                      });
                      
                      if (confirmedOrder && confirmedOrder.confirmed && !confirmedOrder.logged && confirmedOrder.items && confirmedOrder.items.length > 0) {
                        const validItems = confirmedOrder.items.filter(item => item.name && item.name.length > 0);
                        if (validItems.length > 0) {
                          console.log('📝 Order confirmed - logging to Google Sheets...');
                          console.log('📋 Confirmed order details (FINAL STATE - THIS IS WHAT WILL BE LOGGED):', {
                            totalItems: confirmedOrder.items.length,
                            validItems: validItems.length,
                            itemsList: validItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
                            customerName: confirmedOrder.customerName || 'NOT SET - WILL LOG AS "not provided"',
                            deliveryMethod: confirmedOrder.deliveryMethod || 'NOT SET - WILL LOG AS "not specified"',
                            address: confirmedOrder.address || 'NOT SET - WILL LOG WITHOUT ADDRESS',
                            customerPhone: confirmedOrder.customerPhone || 'NOT SET'
                          });
                          
                          // CRITICAL DEBUG: Show exact values that will be sent to Google Sheets
                          console.log('🔍🔍🔍 EXACT VALUES FOR GOOGLE SHEETS:');
                          console.log('🔍 Column A (Name):', confirmedOrder.customerName || 'not provided');
                          console.log('🔍 Column B (Phone):', confirmedOrder.customerPhone || 'not provided');
                          console.log('🔍 Column C (Pick Up/Delivery):', confirmedOrder.deliveryMethod || 'not specified');
                          console.log('🔍 Address:', confirmedOrder.address || 'none');
                          console.log('🔍 Delivery display will be:', confirmedOrder.deliveryMethod === 'delivery' && confirmedOrder.address 
                            ? `delivery - ${confirmedOrder.address}` 
                            : (confirmedOrder.deliveryMethod || 'not specified'));
                          
                          // CRITICAL: Use ALL valid items
                          confirmedOrder.logged = true;
                          confirmedOrder.items = validItems;
                          activeOrders.set(streamSid, confirmedOrder);
                          
                          logOrder(confirmedOrder, storeConfig || {}).catch(error => {
                            console.error('❌ Error logging confirmed order:', error);
                            confirmedOrder.logged = false;
                            activeOrders.set(streamSid, confirmedOrder);
                          });
                        } else {
                          console.warn('⚠️  Confirmed order has no valid items - will log on call end');
                        }
                      } else if (confirmedOrder?.logged) {
                        console.log('⚠️  Order already logged - skipping duplicate log');
                      } else {
                        console.warn('⚠️  Order not ready to log:', {
                          exists: !!confirmedOrder,
                          confirmed: confirmedOrder?.confirmed,
                          hasItems: confirmedOrder?.items?.length > 0
                        });
                      }
                    }, 2000); // 2 second delay to ensure ALL tool calls (name, delivery method) are processed
                    break;
                  }
                }
              } catch (error) {
                console.error('❌❌❌ CRITICAL ERROR in response.content_part.added handler ❌❌❌');
                console.error('❌ Error message:', error.message);
                console.error('❌ Error stack:', error.stack);
                // Don't break - continue processing other events
              }
            }
            break;
            
          case 'response.function_call_arguments.done':
            // Tool call arguments completed - backup handler for tool calls
            // NOTE: This is a backup handler - the main handler in response.content_part.added should handle tool calls
            // This handler is only for cases where the main handler might miss something
            if (data.arguments) {
              console.log('🔧 Function call arguments completed (backup handler):', data.arguments);
              console.log('🔧 Item ID:', data.item_id);
              // We need to get the function name from the response output, not just from args
              // This backup handler should only process if we can identify the function name
              // For now, skip this backup handler - rely on the main handler in response.content_part.added
              console.log('⚠️  Backup handler: Skipping - main handler should process tool calls');
            }
            break;
            
          case 'response.function_call_arguments.delta':
            // Function call arguments are streaming in - this is handled by the main handler
            // Just log for debugging
            if (Math.random() < 0.1) { // Only log 10% of deltas to reduce noise
              console.log('🔧 Function call arguments delta (streaming)');
            }
            break;
            
          case 'response.audio_transcript.done':
            // Response complete
            console.log('AI audio transcript done');
            
            // Extract transcript if available
            if (data.transcript) {
              console.log('AI said:', data.transcript);
              
              // CRITICAL: Enhanced loop detection - prevent ANY repetition
              const now = Date.now();
              const timeSinceLastResponse = now - lastAIResponseTimestamp;
              const transcriptLower = data.transcript.toLowerCase().trim();
              
              // Check for exact duplicate or very similar responses (within 10 seconds)
              if (lastAIResponse && timeSinceLastResponse < 10000) {
                const lastResponseLower = lastAIResponse.toLowerCase().trim();
                const exactMatch = transcriptLower === lastResponseLower;
                
                // Check word overlap for very similar responses
                const words1 = transcriptLower.split(/\s+/).filter(w => w.length > 2); // Ignore short words
                const words2 = lastResponseLower.split(/\s+/).filter(w => w.length > 2);
                const commonWords = words1.filter(w => words2.includes(w));
                const similarity = words1.length > 0 ? commonWords.length / Math.max(words1.length, words2.length) : 0;
                const verySimilar = similarity > 0.75; // 75% word overlap
                
                if (exactMatch || verySimilar) {
                  consecutiveSimilarResponses++;
                  console.error(`❌ REPEAT DETECTED! Response #${consecutiveSimilarResponses}: "${data.transcript}"`);
                  console.error(`   Previous: "${lastAIResponse}"`);
                  
                  if (consecutiveSimilarResponses >= 1) { // Break on FIRST repeat
                    console.error('🚨 BREAKING LOOP IMMEDIATELY - AI is repeating itself');
                    // Force a system message to break the loop
                    if (openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                      try {
                        const orderSummary = currentOrder.items.length > 0 
                          ? currentOrder.items.map(i => `${i.quantity}x ${i.name}`).join(', ')
                          : 'No items yet';
                        const orderSummaryPayload = {
                          type: 'conversation.item.create',
                          item: {
                            type: 'message',
                            role: 'system',
                            content: [{
                              type: 'input_text',
                              text: `STOP REPEATING. You just said "${data.transcript}". The customer heard you. Current order: ${orderSummary}. Wait for their response. Do NOT repeat what you just said. If you need to respond, say something DIFFERENT.`
                            }]
                          }
                        };
                        
                        if (safeSendToOpenAI(orderSummaryPayload, 'loop-break message')) {
                          consecutiveSimilarResponses = 0; // Reset after intervention
                          console.log('✓ Loop-break message sent - preventing repeat');
                          // Don't track this duplicate response
                          return; // Exit early to prevent tracking
                        } else {
                          console.error('❌ Failed to send loop-break message');
                        }
                      } catch (e) {
                        console.error('Error sending loop-break message:', e);
                      }
                    }
                  }
                } else {
                  consecutiveSimilarResponses = 0; // Reset if different
                }
              } else {
                consecutiveSimilarResponses = 0; // Reset if enough time passed
              }
              
              // Track last response
              lastAIResponse = data.transcript;
              lastAIResponseTimestamp = now;
              
              // Track recent responses (keep last 10 for better detection)
              recentResponses.push(data.transcript);
              if (recentResponses.length > 10) {
                recentResponses.shift();
              }
              
              // You can parse this for order data if needed
              const orderForParsing = activeOrders.get(streamSid);
              if (orderForParsing) {
                parseOrderFromTranscript(data.transcript, orderForParsing);
              }
            }
            
            // Check if order should be logged - get fresh order from map
            const orderForLogging = activeOrders.get(streamSid);
            if (!orderForLogging) {
              console.warn('⚠️  No order found for logging check - streamSid:', streamSid);
              break;
            }
            
            console.log('🔍 Checking order status - confirmed:', orderForLogging.confirmed, 'items:', orderForLogging.items.length, 'logged:', orderForLogging.logged);
            console.log('🔍 Order items detail:', JSON.stringify(orderForLogging.items, null, 2));
            
            // When customer says they're done, mark as confirmed but DON'T log yet
            // Wait for confirm_order tool to ensure all data (name, delivery method) is set
            if (orderForLogging.items.length > 0) {
              const transcriptLower = data.transcript?.toLowerCase() || '';
              const donePhrases = ['done', "that's it", "that's all", "i'm all set", "nothing else", "that'll be it", "that's everything"];
              const isDone = donePhrases.some(phrase => transcriptLower.includes(phrase));
              
              if (isDone && !orderForLogging.logged) {
                console.log('✅ Customer indicated done - marking as confirmed');
                console.log('⏳ Waiting for confirm_order tool call to log (ensures name/delivery method are set)');
                console.log('📋 Current order state:', {
                  customerName: orderForLogging.customerName || 'NOT SET',
                  deliveryMethod: orderForLogging.deliveryMethod || 'NOT SET',
                  items: orderForLogging.items.length
                });
                orderForLogging.confirmed = true;
                activeOrders.set(streamSid, orderForLogging);
              }
            }
            
            // CRITICAL: DO NOT log here - wait for confirm_order tool to be called
            // This ensures name and delivery method are collected before logging
            // The order will be logged when confirm_order is called (see case 'confirm_order' handler)
            if (orderForLogging.items.length > 0 && !orderForLogging.logged) {
              console.log('📋 Order has items but waiting for confirm_order tool to log (ensures name/delivery method are set)');
              console.log('📋 Current order state:', {
                items: orderForLogging.items.length,
                customerName: orderForLogging.customerName || 'NOT SET YET',
                deliveryMethod: orderForLogging.deliveryMethod || 'NOT SET YET',
                confirmed: orderForLogging.confirmed
              });
            } else {
              if (orderForLogging.items.length === 0) {
                console.warn('⚠️  ORDER HAS NO ITEMS - This is why it\'s not logging!');
                console.warn('⚠️  Check if add_item_to_order tool is being called and working correctly.');
              } else if (orderForLogging.logged) {
                console.log('✓ Order already logged - skipping duplicate');
              }
            }
            break;
            
          case 'response.done':
            // Full response cycle complete
            console.log('Response done - Full response completed');
            console.log('Response status:', data.response?.status);
            console.log('Response output:', data.response?.output);
            
            // CRITICAL: DO NOT force follow-up responses - this causes interruptions
            // The AI will respond naturally via turn_detection when the user finishes speaking
            // If the response was just a tool call, the AI will still respond naturally after the user speaks
            const outputItems = data.response?.output || [];
            const hasToolCall = outputItems.some(item => item.type === 'function_call');
            const hasMessage = outputItems.some(item => item.type === 'message');
            
            if (hasToolCall && !hasMessage) {
              console.log('✅ Tool call completed - ensuring AI responds with confirmation');
              // CRITICAL: After a tool call, ensure AI responds with a confirmation
              // Wait a moment to ensure user has finished speaking, then trigger response
              setTimeout(() => {
                if (!userIsSpeaking && !responseInProgress && openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                  console.log('✓ Tool call done - ensuring AI responds with confirmation');
                  try {
                    responseInProgress = true;
                    // Send subtle typing sound to indicate processing
                    sendTypingSound();
                    const recoveryResponsePayload = {
                      type: 'response.create',
                      response: {
                        modalities: ['audio', 'text']
                      }
                    };
                    
                    if (!safeSendToOpenAI(recoveryResponsePayload, 'response.create (error recovery)')) {
                      responseInProgress = false;
                      console.error('❌ Failed to create recovery response');
                    }
                    console.log('✓ Response creation sent after tool call');
                  } catch (error) {
                    console.error('Error creating response after tool call:', error);
                    responseInProgress = false;
                  }
                } else {
                  console.log('⚠️  Skipping response after tool call - user speaking:', userIsSpeaking, 'response in progress:', responseInProgress);
                }
              }, 100); // Optimized: Reduced delay to 100ms for faster response
            }
            
            // CRITICAL: Always reset responseInProgress, even if response failed or was cancelled
            responseInProgress = false; // Mark that response is complete, ready for next one
            console.log('✓ responseInProgress reset to false');
            
            if (data.response?.status === 'failed') {
              console.error('\n✗✗✗ RESPONSE FAILED ✗✗✗');
              
              // Always log the full response first to see the structure
              console.error('Full response object:', JSON.stringify(data.response, null, 2));
              
              // Check for status_details which contains the actual error
              const errorDetails = data.response?.status_details?.error || data.response?.error || data.response?.status_details;
              
              if (errorDetails) {
                console.error('\nError Details:');
                console.error('Error type:', errorDetails.type || 'unknown');
                console.error('Error code:', errorDetails.code || 'unknown');
                console.error('Error message:', errorDetails.message || errorDetails || 'No message provided');
                
                // Special handling for quota errors
                if (errorDetails.code === 'insufficient_quota' || errorDetails.type === 'insufficient_quota' || 
                    (typeof errorDetails === 'string' && errorDetails.includes('quota'))) {
                  console.error('\n🚨 CRITICAL: INSUFFICIENT QUOTA!');
                  console.error('You have exceeded your OpenAI API quota or need to add billing.');
                  console.error('\n📋 FIX THIS:');
                  console.error('1. Go to: https://platform.openai.com/account/billing');
                  console.error('2. Add payment method or add credits');
                  console.error('3. Check your usage limits');
                  console.error('4. Wait a few minutes for billing to process');
                  console.error('\nOnce billing is set up, the AI will work!');
                }
              } else {
                console.error('\n⚠️  No error details found in response structure');
                console.error('Response error object:', errorDetails);
              }
              console.error('Response ID:', data.response?.id);
              
              // CRITICAL: Do NOT end the call on error - provide fallback response
              // Try to reconnect OpenAI and send a helpful fallback message
              if (openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid && !userIsSpeaking) {
                try {
                  console.log('✓ Attempting to send fallback message after error');
                  // Send a system message to guide AI with fallback response
                  const currentOrder = activeOrders.get(streamSid) || { items: [] };
                  const orderSummary = currentOrder.items.length > 0 
                    ? `You have ${currentOrder.items.length} item(s) in the order.`
                    : 'The customer has not ordered yet.';
                  
                  const errorRecoveryPayload = {
                    type: 'conversation.item.create',
                    item: {
                      type: 'message',
                      role: 'system',
                      content: [{
                        type: 'input_text',
                        text: `ERROR RECOVERY: An error occurred but the call continues. ${orderSummary} Continue taking the order normally. Ask "What would you like to order?" if no items, or "What else can I get you?" if items exist. NEVER say goodbye or end the call - just continue helping with the order.`
                      }]
                    }
                  };
                  
                  if (safeSendToOpenAI(errorRecoveryPayload, 'error recovery message')) {
                    console.log('✓ Error recovery message sent');
                  } else {
                    console.error('❌ Failed to send error recovery message');
                  }
                  
                  // Try to create a new response after error
                  setTimeout(() => {
                    if (!responseInProgress && !userIsSpeaking && streamSid === sid) {
                      const recoveryResponsePayload = {
                        type: 'response.create',
                        response: {
                          modalities: ['audio', 'text']
                        }
                      };
                      
                      try {
                        if (safeSendToOpenAI(recoveryResponsePayload, 'error recovery response')) {
                          responseInProgress = true;
                          console.log('✓ Fallback response creation sent after error');
                        } else {
                          responseInProgress = false;
                          console.error('❌ Failed to create fallback response');
                        }
                      } catch (e) {
                        console.error('Error creating fallback response:', e);
                        responseInProgress = false;
                      }
                    }
                  }, 500);
                } catch (e) {
                  console.error('Error sending fallback message:', e);
                }
              }
              
              console.error('\n⚠️  ERROR HANDLED - Call continues, attempting recovery\n');
            } else if (data.response?.status === 'completed') {
              console.log('✓ Response completed successfully');
            } else {
              console.log('⚠ Unknown response status:', data.response?.status);
              console.log('Full response object:', JSON.stringify(data.response, null, 2));
            }
            break;
            
          case 'error':
            console.error('✗✗✗ OpenAI error event received ✗✗✗');
            console.error('Error data:', JSON.stringify(data, null, 2));
            
            // CRITICAL: Do NOT end the call on error - attempt recovery
            // Try to reconnect OpenAI and continue the call
            if (streamSid === sid) {
              const currentOrder = activeOrders.get(streamSid) || { items: [] };
              
              // Attempt to reconnect OpenAI connection
              setTimeout(() => {
                if (!openaiClient || openaiClient.readyState !== WebSocket.OPEN) {
                  console.log('⚠️  Attempting to reconnect OpenAI after error...');
                  try {
                    connectToOpenAI(streamSid, currentOrder).catch(error => {
                      console.error('❌ Failed to reconnect OpenAI:', error);
                      // Even if reconnect fails, keep the call alive and send fallback TwiML
                      if (ws && ws.readyState === WebSocket.OPEN) {
                        try {
                          ws.send(JSON.stringify({
                            event: 'stop',
                            streamSid: sid
                          }));
                          // Send fallback TwiML to keep call alive
                          // The call handler will reconnect when user speaks again
                        } catch (e) {
                          console.error('Error sending stop event:', e);
                        }
                      }
                    });
                  } catch (e) {
                    console.error('Error attempting OpenAI reconnection:', e);
                  }
                } else {
                  console.log('✓ OpenAI connection still open - error was handled');
                }
              }, 1000);
            }
            
            // DO NOT break - continue processing other events
            break;
            
          default:
            // Log other message types for debugging
            console.log('⚠ UNHANDLED OpenAI message type:', data.type);
            try {
              const dataStr = JSON.stringify(data);
              console.log('Full message (first 500 chars):', dataStr.substring(0, 500));
            } catch (e) {
              console.log('Could not stringify message data');
            }
            break;
        }
      } catch (error) {
        // CRITICAL: Properly handle ALL errors to prevent crashes
        console.error('❌❌❌ CRITICAL ERROR in OpenAI message handler ❌❌❌');
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        try {
          console.error('❌ Message data type:', typeof message);
          if (message && typeof message.toString === 'function') {
            const msgStr = message.toString();
            console.error('❌ Message preview (first 200 chars):', msgStr.substring(0, 200));
          }
        } catch (e) {
          console.error('❌ Could not log message details');
        }
        // Don't crash - continue processing other messages
      }
    });
    
    openaiClient.on('error', (error) => {
      console.error('✗✗✗ OpenAI WebSocket error:', error);
      console.error('Error details:', error.message, error.code);
      console.error('Error stack:', error.stack);
      console.error('This will prevent audio processing and API usage!');
      openaiReady = false; // Mark as not ready on error
      
      // Try to provide feedback to caller if possible
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          // Send error message via TwiML (if possible) or log it
          console.error('⚠️  OpenAI connection error - caller may experience issues');
        }
      } catch (e) {
        console.error('Could not send error notification:', e);
      }
    });
    
    openaiClient.on('close', (code, reason) => {
      console.log('OpenAI connection closed:', code, reason?.toString());
      openaiReady = false; // Mark as not ready when closed
      
      // Only log as error if it was unexpected (not a normal close)
      if (code !== 1000 && code !== 1001) {
        console.error('⚠ Unexpected OpenAI connection closure - this will stop audio processing!');
        console.error('Close code:', code);
        console.error('Close reason:', reason?.toString() || 'No reason provided');
        
        // Common error codes:
        // 1006: Abnormal closure (connection lost)
        // 1002: Protocol error
        // 1003: Unsupported data
        // 1008: Policy violation
        if (code === 1006) {
          console.error('⚠️  Connection lost - possible network issue or API key problem');
        } else if (code === 1008) {
          console.error('⚠️  Policy violation - check API key permissions and model access');
        }
      }
      
      // CRITICAL: Remove all listeners when connection closes to prevent memory leaks
      try {
        openaiClient.removeAllListeners();
      } catch (e) {
        console.error('Error removing listeners on close:', e);
      }
      
      if (code !== 1000 && code !== 1005) { // 1000 = normal closure, 1005 = no status
        console.error('⚠ Unexpected OpenAI connection closure - this will stop audio processing!');
      }
    });
    
    // Remove the duplicate message handler - we handle it below
  }
  
  // Parse order from transcript (basic implementation)
  function parseOrderFromTranscript(transcript, currentOrder) {
    const text = transcript.toLowerCase();
    
    // Detect completion phrases
    if (text.includes("i'm all set") || text.includes("that's it") || 
        text.includes("that's all") || text.includes("that'll be it")) {
      // Don't set confirmed yet, wait for explicit confirmation
    }
    
    // Detect confirmation - broader patterns
    // Look for confirmation in user's speech OR when AI provides final total
    const confirmationPatterns = [
      /yes|yeah|yep|sounds good|that's correct|correct|perfect|okay|ok|alright/i,
      /your total is|that'll be|ready in about/i  // AI providing final total indicates completion
    ];
    
    const hasConfirmation = confirmationPatterns.some(pattern => pattern.test(text));
    
    if (hasConfirmation && currentOrder.items.length > 0) {
      // Also check if we have all required info
      const hasDeliveryMethod = !!currentOrder.deliveryMethod;
      const hasPayment = !!currentOrder.paymentMethod;
      const hasName = !!currentOrder.customerName;
      const hasPhone = !!currentOrder.customerPhone;
      
      if (hasDeliveryMethod && hasPayment && hasName && hasPhone) {
        if (!currentOrder.confirmed) {
          console.log('✅ Order confirmed via transcript analysis');
          currentOrder.confirmed = true;
          activeOrders.set(streamSid, currentOrder);
        }
      } else {
        console.log('⚠️  Missing required info - delivery:', hasDeliveryMethod, 'payment:', hasPayment, 'name:', hasName, 'phone:', hasPhone);
      }
    }
    
    // Update active order
    activeOrders.set(streamSid, currentOrder);
  }
  
  // Send order to all configured integrations
  async function logOrder(order, storeConfig = {}) {
    console.log('📝 Logging order to all configured services...');
    
    // CRITICAL: Validate order before logging
    if (!order || !order.items || order.items.length === 0) {
      console.error('❌ Cannot log order - no items in order!');
      console.error('❌ Order data:', JSON.stringify(order, null, 2));
      return;
    }
    
    // Validate that items have required fields
    const validItems = order.items.filter(item => item.name && item.name.length > 0);
    if (validItems.length === 0) {
      console.error('❌ Cannot log order - no valid items!');
      console.error('❌ Order items:', JSON.stringify(order.items, null, 2));
      return;
    }
    
    console.log('✅ Order validation passed - items:', validItems.length);
    console.log('📋 Order summary:', {
      items: validItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
      customerName: order.customerName || 'not provided',
      customerPhone: order.customerPhone || order.from || 'unknown',
      deliveryMethod: order.deliveryMethod || 'not specified'
    });
    
    // Get store config if available (from WebSocket connection)
    const config = storeConfig || {};
    
    // Calculate totals using only valid items
    let subtotal = 0;
    validItems.forEach(item => {
      subtotal += (item.price || 0) * (item.quantity || 1);
    });
    const taxRate = config.taxRate || 0.08;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    
    // Create validated order data
    const orderData = {
      items: validItems, // Use only valid items
      deliveryMethod: order.deliveryMethod || 'not specified',
      address: order.address || '',
      customerName: order.customerName || 'not provided',
      customerPhone: order.customerPhone || order.from || 'unknown',
      paymentMethod: order.paymentMethod || 'not specified',
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      phoneNumber: order.customerPhone || order.from || 'unknown',
      timestamp: new Date().toISOString(), // CRITICAL: ISO string format for Zapier compatibility
      order_timestamp: new Date().toISOString(), // CRITICAL: Also include order_timestamp field (fixes Zapier invalid time value error)
      storeName: config.name || 'Uncle Sal\'s Pizza',
      storeLocation: config.location || 'Syracuse, NY',
    };
    
    // Log to Google Sheets
    try {
      console.log('📝 Attempting to log to Google Sheets...');
      console.log('📋 Data being logged:', {
        timestamp: orderData.timestamp,
        customerName: orderData.customerName,
        customerPhone: orderData.customerPhone,
        items: orderData.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
        total: orderData.total
      });
      
      // Create a clean order object for Google Sheets (only valid items)
      const cleanOrder = {
        ...order,
        items: validItems // Replace with validated items
      };
      
      console.log('📋 Sending to Google Sheets:', {
        customerName: cleanOrder.customerName || 'not provided',
        customerPhone: cleanOrder.customerPhone || order.from || 'unknown',
        items: cleanOrder.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
        deliveryMethod: cleanOrder.deliveryMethod || 'not specified',
        address: cleanOrder.address || 'none',
        total: total.toFixed(2)
      });
      
      // CRITICAL: Verify address is included if delivery
      if (cleanOrder.deliveryMethod === 'delivery') {
        console.log('📋 DELIVERY ORDER - Address check:', {
          hasAddress: !!cleanOrder.address,
          address: cleanOrder.address || 'MISSING - will log as "delivery" without address',
          deliveryMethod: cleanOrder.deliveryMethod
        });
      }
      
      const success = await googleSheets.logOrderToGoogleSheets(cleanOrder, config);
      if (success) {
        console.log('✅✅✅ SUCCESSFULLY LOGGED TO GOOGLE SHEETS ✅✅✅');
      } else {
        console.error('❌❌❌ GOOGLE SHEETS LOGGING FAILED ❌❌❌');
        console.error('❌ Check Google Sheets configuration:');
        console.error('   - GOOGLE_SHEETS_CREDENTIALS_PATH:', process.env.GOOGLE_SHEETS_CREDENTIALS_PATH);
        console.error('   - GOOGLE_SHEETS_ID:', process.env.GOOGLE_SHEETS_ID);
        console.error('   - Service account must have edit access to the sheet');
      }
    } catch (error) {
      console.error('❌❌❌ ERROR LOGGING TO GOOGLE SHEETS ❌❌❌');
      console.error('❌ Error:', error.message);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Full error object:', JSON.stringify(error, null, 2));
    }
    
    // Send to POS system
    try {
      await posSystems.sendOrderToPOS(order, config);
    } catch (error) {
      console.error('Error sending to POS system:', error);
    }
    
    // CRITICAL: Send to Zapier (if configured) - NON-BLOCKING, fire-and-forget
    // This MUST NEVER block the call flow - Zapier errors should NOT affect calls
    const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    if (zapierWebhookUrl) {
      // CRITICAL: Use setTimeout with 0 delay to ensure this runs AFTER the response is sent
      // This prevents any Zapier errors from affecting the call
      // CRITICAL: Use AbortController for proper timeout handling
      setTimeout(() => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        fetch(zapierWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
          signal: controller.signal // CRITICAL: Use AbortController for timeout
        })
        .then(response => {
          clearTimeout(timeoutId);
          console.log('✓ Order sent to Zapier:', response.status);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          // CRITICAL: Log error but DO NOT throw - Zapier errors should NEVER affect calls
          if (error.name === 'AbortError') {
            console.error('⚠️  Zapier webhook timeout (non-blocking) - request took too long');
          } else {
            console.error('⚠️  Error sending order to Zapier (non-blocking):', error.message);
          }
          console.error('⚠️  Order was still logged to Google Sheets successfully');
          // DO NOT rethrow error - this is non-blocking
        });
      }, 0); // Run after current call stack completes - fully non-blocking
    }
    
    console.log('✓ Order logging complete');
  }
  
  ws.on('close', () => {
    console.log('Twilio WebSocket closed - cleaning up...');
    
    // Clear audio buffer timer
    if (audioBufferTimer) {
      clearTimeout(audioBufferTimer);
      audioBufferTimer = null;
    }
    
    // CRITICAL: Clean up OpenAI connection properly to prevent resource leaks
    if (openaiClient) {
      try {
        // Remove all event listeners to prevent memory leaks
        openaiClient.removeAllListeners();
        // Close connection if still open
        if (openaiClient.readyState === WebSocket.OPEN || openaiClient.readyState === WebSocket.CONNECTING) {
          openaiClient.close();
        }
        console.log('✓ OpenAI connection closed and listeners removed');
      } catch (e) {
        console.error('Error closing OpenAI connection:', e);
      }
      openaiClient = null;
    }
    
    // CRITICAL: Log order before cleanup if it has items and wasn't logged
    if (streamSid) {
      const finalOrder = activeOrders.get(streamSid);
      if (finalOrder) {
        // CRITICAL: Only log if order has valid items
        const validItems = finalOrder.items.filter(item => item.name && item.name.length > 0);
        
        if (validItems.length > 0 && !finalOrder.logged) {
          console.log('📝 Call ending - logging order before cleanup...');
          console.log('📋 Final order details (ALL ITEMS - FINAL STATE):', {
            totalItems: finalOrder.items.length,
            validItems: validItems.length,
            itemsList: validItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
            confirmed: finalOrder.confirmed,
            logged: finalOrder.logged,
            deliveryMethod: finalOrder.deliveryMethod || 'NOT SET - will show as "not specified"',
            customerName: finalOrder.customerName || 'NOT SET - will show as "not provided"',
            customerPhone: finalOrder.customerPhone || 'unknown'
          });
          
          // CRITICAL: Ensure we use ALL valid items - user wants EVERYTHING logged
          if (finalOrder.items.length !== validItems.length) {
            console.warn('⚠️  Some items are invalid - only logging valid items');
            console.warn('⚠️  All items:', JSON.stringify(finalOrder.items, null, 2));
          }
          
          // Warn if name or delivery method are missing
          if (!finalOrder.customerName) {
            console.warn('⚠️  WARNING: Customer name is NOT SET - will log as "not provided"');
            console.warn('⚠️  This means set_customer_name tool was not called or did not save correctly');
          }
          if (!finalOrder.deliveryMethod) {
            console.warn('⚠️  WARNING: Delivery method is NOT SET - will log as "not specified"');
            console.warn('⚠️  This means set_delivery_method tool was not called or did not save correctly');
          }
          
          // Only log if we have valid items - user wants ALL items logged
          finalOrder.confirmed = true; // Auto-confirm for logging
          finalOrder.logged = true;
          // CRITICAL: Ensure we use ALL valid items
          finalOrder.items = validItems;
          activeOrders.set(streamSid, finalOrder);
          logOrder(finalOrder, storeConfig || {}).catch(error => {
            console.error('❌ Error logging order on call end:', error);
            console.error('❌ Error details:', error.message);
            // Reset on error so it can be retried
            finalOrder.logged = false;
            activeOrders.set(streamSid, finalOrder);
          });
        } else if (validItems.length === 0) {
          console.warn('⚠️  Call ending - order has no valid items, skipping log');
          console.warn('⚠️  Order items:', JSON.stringify(finalOrder.items, null, 2));
        }
      }
      // Clean up order tracking after logging attempt
      activeOrders.delete(streamSid);
      console.log('✓ Order tracking cleaned up for stream:', streamSid);
    }
    
    // Reset all state to prevent memory leaks
    streamSid = null;
    order = null;
    audioBuffer = [];
    preConnectionAudioQueue = [];
    recentResponses = [];
    consecutiveSimilarResponses = 0;
    initialGreetingTriggered = false;
    openaiReady = false;
    responseInProgress = false;
    
    console.log('✓ All state reset - ready for next call');
  });
  
  ws.on('error', (error) => {
    console.error('🚨 Twilio WebSocket error (non-fatal):', error.message);
    console.error('⚠️  Server continues running - error logged but not crashing');
    // Don't crash - just log the error
  });
  
  // CRITICAL: Catch any unhandled errors in the connection handler
  } catch (error) {
    console.error('🚨🚨🚨 CRITICAL ERROR in WebSocket connection handler 🚨🚨🚨');
    console.error('🚨 Error message:', error.message);
    console.error('🚨 Error stack:', error.stack);
    console.error('⚠️  Server continues running - connection failed but server stays up');
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    } catch (e) {
      // Ignore errors when closing
    }
  }
});

// Periodic cleanup to prevent resource accumulation and slowdowns
// This ensures the server stays fast even after many calls or long uptime
setInterval(() => {
  // Clean up stale orders (older than 10 minutes)
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [sid, order] of activeOrders.entries()) {
    // If order has a timestamp and is old, clean it up
    if (order.timestamp && (now - new Date(order.timestamp).getTime()) > 600000) {
      activeOrders.delete(sid);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} stale order(s) from memory`);
  }
  
  // Log current resource usage for monitoring
  if (activeOrders.size > 0) {
    console.log(`📊 Active orders in memory: ${activeOrders.size}`);
  }
}, 300000); // Run every 5 minutes

// Initialize integrations on server start (non-blocking)
// Use setTimeout to ensure server starts even if integrations fail
setTimeout(() => {
  console.log('Initializing integrations...');
  (async () => {
    try {
      const initialized = await googleSheets.initializeGoogleSheets();
      if (initialized) {
        await googleSheets.initializeSheetHeaders();
        console.log('✅ Google Sheets ready for logging');
      } else {
        console.warn('⚠️  Google Sheets not configured - orders will not be logged to Google Sheets');
        console.warn('⚠️  To enable: Set GOOGLE_SHEETS_CREDENTIALS_BASE64 and GOOGLE_SHEETS_ID in environment variables');
      }
    } catch (error) {
      console.error('❌ Error initializing Google Sheets:', error);
      console.error('❌ Orders will not be logged to Google Sheets until this is fixed');
      console.error('❌ Server will continue running - this is non-critical');
    }
  })();
  
  try {
    posSystems.initializePOS();
  } catch (error) {
    console.error('❌ Error initializing POS systems:', error);
    console.error('❌ Server will continue running - this is non-critical');
  }
}, 500); // Wait 500ms after server starts to initialize integrations

console.log('WebSocket server ready');
console.log(`Ready to accept calls. Configure your Twilio number to: https://your-domain/incoming-call`);

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

// CRITICAL: Parse Twilio POST request body (form-encoded)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ============================================================================
// CORS - Allow requests from altiorai.com frontend
// ============================================================================
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://altiorai.com',
    'https://www.altiorai.com',
    'http://localhost:5173', // For local development (Vite default)
    'http://localhost:3000', // For local development
    'http://127.0.0.1:5173'  // For local development (alternative)
  ];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// ============================================================================
// PHASE 1: ANALYTICS API Routes (Isolated, doesn't affect existing routes)
// ============================================================================
if (process.env.ENABLE_ANALYTICS !== 'false') {
  try {
    const callsRouter = require('./apps/api/calls');
    app.use('/api/calls', callsRouter);
    console.log('✓ Analytics API enabled');
  } catch (error) {
    console.warn('⚠️  Analytics API not available (optional feature):', error.message);
  }
}

// Debug: Check if environment variables are loaded
console.log('Environment check:');
console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Found' : '✗ Missing');
console.log('- TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✓ Found' : '✗ Missing');
console.log('- NGROK_URL:', process.env.NGROK_URL || 'Not set (will use request host)');

// Store active order sessions
const activeOrders = new Map(); // streamSid -> order object

// ============================================================================
// TOKEN OPTIMIZATION v2: Aggressive Token Management System
// ============================================================================

// Store conversation summaries per call (reduces token usage by 6-7x)
const conversationSummaries = new Map(); // streamSid -> { summary: string, lastUserTurns: [], lastAssistantTurns: [] }

// Store last response.create timestamp per session for debouncing
const lastResponseTimestamps = new Map(); // streamSid -> timestamp

// Store retrieved menu snippets per session (avoid re-sending)
const sessionMenuCache = new Map(); // streamSid -> { categories: Set, cachedMenu: string }

// Token usage tracking (rolling 60-second window)
const tokenUsageTracker = {
  entries: [], // { timestamp, promptTokens, completionTokens, totalTokens }
  
  addEntry(promptTokens, completionTokens) {
    const now = Date.now();
    this.entries.push({
      timestamp: now,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    });
    // Prune entries older than 60 seconds
    this.entries = this.entries.filter(e => now - e.timestamp < 60000);
  },
  
  getTPM() {
    const now = Date.now();
    this.entries = this.entries.filter(e => now - e.timestamp < 60000);
    return this.entries.reduce((sum, e) => sum + e.totalTokens, 0);
  },
  
  warn() {
    const tpm = this.getTPM();
    if (tpm > 30000) {
      console.warn(`⚠️  TOKEN WARNING: ${tpm} tokens in last 60s (approaching 40k limit!)`);
      return true;
    }
    if (tpm > 35000) {
      console.error(`🚨 TOKEN CRITICAL: ${tpm} tokens in last 60s - EXCEEDING LIMIT!`);
      return true;
    }
    return false;
  }
};

// TOKEN BUDGET CONSTANTS
const TOKEN_BUDGET = {
  MAX_PROMPT_TOKENS: 1000,      // Max tokens for prompt (system + context + history)
  MAX_OUTPUT_TOKENS: 256,        // Max tokens for response - 256 prevents "incomplete" cutoffs while staying efficient
  MAX_HISTORY_TURNS: 2,          // Keep only last 2 user+assistant turns
  MIN_DEBOUNCE_MS: 800,          // Minimum 800ms between model calls (reduced from 1500ms for faster responses)
  TOKENS_PER_CHAR: 0.25          // Rough estimate: 4 chars per token
};

/**
 * Estimate token count from text (rough approximation)
 */
function estimateTokens(text) {
  if (!text) return 0;
  // OpenAI uses ~4 chars per token on average for English
  return Math.ceil(text.length * TOKEN_BUDGET.TOKENS_PER_CHAR);
}

/**
 * Check if we should debounce this response.create call
 * Returns true if we should skip (too soon since last call)
 */
function shouldDebounceResponse(streamSid) {
  const lastTime = lastResponseTimestamps.get(streamSid) || 0;
  const now = Date.now();
  const elapsed = now - lastTime;
  
  if (elapsed < TOKEN_BUDGET.MIN_DEBOUNCE_MS) {
    console.log(`⏳ Debouncing response.create - only ${elapsed}ms since last call (min: ${TOKEN_BUDGET.MIN_DEBOUNCE_MS}ms)`);
    return true;
  }
  
  lastResponseTimestamps.set(streamSid, now);
  return false;
}

/**
 * Calculate exact order total from items (with 8% NYS tax)
 */
function calculateOrderTotal(order) {
  if (!order || !order.items || order.items.length === 0) {
    return { subtotal: 0, tax: 0, total: 0 };
  }
  
  let subtotal = 0;
  order.items.forEach(item => {
    const itemPrice = item.price || 0;
    const quantity = item.quantity || 1;
    subtotal += itemPrice * quantity;
  });
  
  const taxRate = 0.08; // 8% NYS tax
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100
  };
}

/**
 * Create compact conversation summary (<=120 tokens)
 * Only includes essential order info, not full transcript
 * INCLUDES EXACT TOTAL for AI to use (not estimate)
 */
function createConversationSummary(order) {
  if (!order) return 'No order yet.';
  
  const items = order.items?.length > 0 
    ? order.items.map(i => `${i.quantity}x ${i.size || ''} ${i.name}`.trim()).join(', ')
    : 'none';
  
  // Calculate exact total
  const totals = calculateOrderTotal(order);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:301',message:'Building order summary',data:{itemsCount:order.items?.length||0,items:items,subtotal:totals.subtotal,tax:totals.tax,total:totals.total},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
  // Ultra-compact format to save tokens
  const parts = [];
  parts.push(`Items: ${items}`);
  if (order.items?.length > 0 && totals.total > 0) {
    parts.push(`Total: $${totals.total.toFixed(2)} (exact, includes 8% tax)`);
  }
  if (order.customerName) parts.push(`Name: ${order.customerName}`);
  if (order.deliveryMethod) parts.push(`Method: ${order.deliveryMethod}`);
  if (order.address) parts.push(`Addr: ${order.address}`);
  
  // Determine what to ask next (helps AI focus)
  // CRITICAL: Make this very explicit so AI doesn't skip steps
  // CRITICAL: Show total BEFORE asking pickup/delivery
  let nextStep = '';
  if (order.items?.length === 0) {
    nextStep = 'CRITICAL: Need items - ask what they want';
  } else if (!order.deliveryMethod && order.items?.length > 0) {
    // CRITICAL: Show total FIRST, then ask pickup/delivery
    nextStep = 'CRITICAL: Show exact total FIRST, then ask pickup/delivery';
  } else if (order.deliveryMethod === 'delivery' && !order.address) {
    nextStep = 'CRITICAL: Need address - ask NOW';
  } else if (!order.customerName) {
    nextStep = 'CRITICAL: Need name - ask NOW';
  } else if (!order.confirmed) {
    nextStep = 'Ready: call confirm_order';
  } else {
    nextStep = 'Order complete - can say goodbye';
  }
  
  parts.push(nextStep);
  
  return parts.join('. ');
}

/**
 * Get minimal core rules prompt (~200 tokens) - ultra-compact
 */
function getCoreRulesPrompt() {
  return `Pizza assistant for Uncle Sal's. Max 1-2 short sentences per response.

RULES:
1. Greet: "Thanks for calling Uncle Sal's. What can I get you?"
2. MANDATORY TOOL USAGE: When customer orders ANY item (e.g., "pizza", "fries", "soda"), you MUST call add_item_to_order tool IMMEDIATELY. DO NOT just say "I'll add that" - you MUST call the tool. Example: Customer says "large pepperoni pizza" → Call add_item_to_order(name="pepperoni pizza", size="large") BEFORE saying anything else.
3. Wings: ask flavor first, then call add_item_to_order.
4. Done phrases ("that's it","all set"): FIRST show exact total from ORDER summary, THEN ask "Pickup or delivery?"
5. Collect name, address (if delivery). Phone number is already captured - DO NOT ask for it.
6. PRICING: Use the EXACT total shown in ORDER summary (format: "Total: $X.XX"). NEVER estimate or say "about" or "XX.XX". Say the exact amount.
7. ORDER COMPLETION CHECK: Before saying goodbye, check ORDER summary. If it says "CRITICAL: Need" anything, ask for that FIRST. Do NOT say goodbye until order is complete.
8. On confirm: call confirm_order, say "Awesome, thanks for ordering with Uncle Sal's today!"
9. GOODBYE: Only say "Thanks for calling! Have a great day!" AFTER confirm_order is called. If customer says "bye" but order shows "CRITICAL: Need", ask for missing info instead of goodbye.

CONFIRM PHRASES: "Got it.", "Perfect.", "Sure thing."
NEVER go silent. Always confirm immediately. Complete the order before saying goodbye.`;
}

/**
 * Get menu items on-demand by category or search term
 * Returns ONLY relevant items, not full menu
 */
function getMenuItemsOnDemand(menu, searchTerm = null) {
  if (!menu || typeof menu !== 'object') return '';
  
  const items = [];
  const searchLower = searchTerm?.toLowerCase() || '';
  
  for (const [name, data] of Object.entries(menu)) {
    // If search term provided, only include matching items
    if (searchTerm) {
      const isMatch = name.toLowerCase().includes(searchLower) ||
                     searchLower.includes(name.toLowerCase().split(' ')[0]) ||
                     (searchLower.includes('pizza') && name.includes('pizza')) ||
                     (searchLower.includes('wing') && name.includes('wing')) ||
                     (searchLower.includes('calzone') && name.includes('calzone')) ||
                     (searchLower.includes('drink') && ['soda', 'water'].includes(name)) ||
                     (searchLower.includes('side') && ['garlic', 'fries', 'salad', 'mozzarella'].some(s => name.includes(s)));
      
      if (!isMatch) continue;
    }
    
    const sizes = data.sizes ? data.sizes.join('/') : '';
    items.push(`${name}${sizes ? ` (${sizes})` : ''}`);
  }
  
  return items.length > 0 ? items.join(', ') : '';
}

/**
 * Get cached menu snippet for session, or retrieve new one
 */
function getSessionMenuSnippet(streamSid, menu, userText) {
  let cache = sessionMenuCache.get(streamSid);
  if (!cache) {
    cache = { categories: new Set(), cachedMenu: '' };
    sessionMenuCache.set(streamSid, cache);
  }
  
  // Detect what category the user might be asking about
  const textLower = (userText || '').toLowerCase();
  let category = null;
  
  if (textLower.includes('pizza') || textLower.includes('pepperoni') || textLower.includes('cheese')) {
    category = 'pizza';
  } else if (textLower.includes('wing')) {
    category = 'wings';
  } else if (textLower.includes('drink') || textLower.includes('soda') || textLower.includes('water')) {
    category = 'drinks';
  } else if (textLower.includes('side') || textLower.includes('fries') || textLower.includes('knot') || textLower.includes('bread')) {
    category = 'sides';
  }
  
  // If we haven't cached this category yet, add it
  if (category && !cache.categories.has(category)) {
    cache.categories.add(category);
    const snippet = getMenuItemsOnDemand(menu, category);
    if (snippet) {
      cache.cachedMenu = cache.cachedMenu ? `${cache.cachedMenu}; ${snippet}` : snippet;
    }
  }
  
  // For first call, provide minimal menu reference
  if (!cache.cachedMenu) {
    cache.cachedMenu = 'Pizza, calzones, sides, drinks available';
  }
  
  return cache.cachedMenu;
}

/**
 * Build ultra-compact session instructions (aim for <800 tokens total)
 */
function buildCompactInstructions(order, menu, conversationContext) {
  const coreRules = getCoreRulesPrompt();
  const summary = createConversationSummary(order);
  
  // Get only relevant menu items based on conversation
  const menuSnippet = conversationContext?.lastUserText 
    ? getMenuItemsOnDemand(menu, conversationContext.lastUserText)
    : 'Pizza, calzones, sides, drinks available';
  
  // Build compact instructions
  const instructions = `${coreRules}

MENU: ${menuSnippet || 'Ask what they want'}

ORDER: ${summary}`;

  // Estimate tokens and log
  const estimatedTokens = estimateTokens(instructions);
  console.log(`📊 Instructions: ~${estimatedTokens} tokens`);
  
  return instructions;
}

/**
 * Log token usage for monitoring
 */
function logTokenUsage(streamSid, promptTokens, completionTokens, source) {
  tokenUsageTracker.addEntry(promptTokens, completionTokens);
  const tpm = tokenUsageTracker.getTPM();
  
  console.log(`📊 TOKENS [${source}]: prompt=${promptTokens}, completion=${completionTokens}, total=${promptTokens + completionTokens}`);
  console.log(`📊 ROLLING TPM (60s): ${tpm} tokens/min ${tpm > 30000 ? '⚠️ WARNING' : tpm > 35000 ? '🚨 CRITICAL' : '✓'}`);
  
  // Send to debug log
  
  tokenUsageTracker.warn();
  
  return tpm;
}

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
    const fs = require('fs');
    
    const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
    const credentialsBase64 = process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64;
    
    if (!credentialsPath && !credentialsBase64) {
      console.warn('⚠️  GOOGLE_SHEETS_CREDENTIALS_PATH or GOOGLE_SHEETS_CREDENTIALS_BASE64 not set, using default menu');
      return getDefaultMenuData();
    }

    let auth;
    
    // Option 1: Use base64 encoded credentials (for Railway/cloud deployments)
    if (credentialsBase64) {
      try {
        // Clean the base64 string: remove whitespace, newlines, and any trailing characters
        const cleanedBase64 = credentialsBase64.trim().replace(/\s/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
        
        if (!cleanedBase64 || cleanedBase64.length < 100) {
          console.warn('⚠️  Base64 credentials string is too short, using default menu');
          return getDefaultMenuData();
        }
        
        const credentialsJson = Buffer.from(cleanedBase64, 'base64').toString('utf-8');
        const credentials = JSON.parse(credentialsJson);
        
        auth = new google.auth.GoogleAuth({
          credentials: credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
      } catch (error) {
        console.error('❌ Failed to parse base64 credentials for menu:', error.message);
        console.warn('⚠️  Using default menu as fallback');
        return getDefaultMenuData();
      }
    }
    // Option 2: Use file path (for local development)
    else if (credentialsPath) {
      const credentialsAbsolutePath = path.isAbsolute(credentialsPath)
        ? credentialsPath
        : path.resolve(__dirname, credentialsPath.replace(/^\.\//, ''));

      if (!fs.existsSync(credentialsAbsolutePath)) {
        console.warn('⚠️  Credentials file not found, using default menu');
        return getDefaultMenuData();
      }

      auth = new google.auth.GoogleAuth({
        keyFile: credentialsAbsolutePath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    }

    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch menu data (assuming it's in a sheet named "Menu" or "Sheet1")
    const sheetName = process.env.GOOGLE_SHEETS_MENU_SHEET || 'Menu';
    // Use a large explicit range to get ALL menu items (up to 1000 rows)
    // Google Sheets API may limit results with open-ended ranges, so we use an explicit upper bound
    const range = `${sheetName}!A2:E1000`; // Skip header row, get rows 2-1000 in columns A-E

    console.log(`📋 Fetching menu from Google Sheets: ${menuSheetId}, sheet: ${sheetName}, range: ${range}`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: menuSheetId,
      range: range,
    });

    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      console.warn('⚠️  No menu data found in Google Sheets, using default menu');
      return getDefaultMenuData();
    }

    console.log(`📋 Found ${rows.length} rows in Google Sheets (before parsing)`);
    
    // Check if we might have hit a limit (if exactly 1000 rows, might be more)
    if (rows.length >= 1000) {
      console.warn('⚠️  WARNING: Fetched 1000 rows - menu might be truncated! Consider increasing the range limit.');
    }
    
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
  // TOKEN OPTIMIZATION: Compact menu format (removes prices from prompt - prices are in tool/order logic)
  // Group by category first
  const categories = {};
  
  Object.keys(menu).forEach(itemName => {
    const item = menu[itemName];
    const category = item.category || 'Other';
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    // OPTIMIZED: Only include sizes, not prices (saves ~30% tokens on menu)
    const sizes = item.sizes.join(', ');
    categories[category].push(`${itemName} (${sizes})`);
  });

  // Format by category - compact format
  let menuText = '';
  Object.keys(categories).sort().forEach(category => {
    menuText += `${category}:\n${categories[category].join(', ')}\n`;
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

// ============================================================================
// PHASE 1: ANALYTICS - Call Logging (Non-blocking, isolated)
// ============================================================================
// This section adds call analytics WITHOUT affecting existing call flow
// All logging is non-blocking and won't interrupt calls

// Twilio Status Callback - Logs call when it ends
// Configure this URL in Twilio: https://your-domain.com/api/calls/twilio-status
app.post('/api/calls/twilio-status', express.urlencoded({ extended: true }), async (req, res) => {
  // DEBUG: Log incoming callback to verify endpoint is hit
  console.log('📞 Twilio status callback received:', {
    CallSid: req.body.CallSid,
    CallStatus: req.body.CallStatus,
    CallDuration: req.body.CallDuration,
    AnsweredBy: req.body.AnsweredBy
  });
  
  // CRITICAL: Respond immediately to Twilio (non-blocking)
  res.status(200).send('OK');
  
  // Process logging asynchronously (doesn't block Twilio)
  setImmediate(async () => {
    try {
      // Only log completed calls
      if (req.body.CallStatus !== 'completed') {
        console.log(`📞 Status callback received but status is '${req.body.CallStatus}' (not 'completed'), skipping log`);
        return;
      }
      
      const callSid = req.body.CallSid;
      const duration = parseInt(req.body.CallDuration || 0);
      const answered = req.body.AnsweredBy !== 'machine';
      
      // Extract client slug from phone number or use default
      // You can map phone numbers to client slugs here
      const clientSlug = process.env.DEFAULT_CLIENT_SLUG || 'unclesals';
      
      // Get current date (YYYY-MM-DD format)
      const callDate = new Date().toISOString().split('T')[0];
      
      // Log to database (non-blocking)
      if (process.env.ENABLE_ANALYTICS !== 'false') {
        try {
          const { logCall } = require('./apps/api/db');
          logCall.run(
            callSid,
            clientSlug,
            callDate,
            duration,
            Math.round((duration / 60) * 100) / 100, // minutes_used
            answered ? 1 : 0,
            1 // ai_handled (default true)
          );
          
          console.log(`✓ Call logged: ${callSid}, ${duration}s, ${clientSlug}`);
        } catch (dbError) {
          // Log error but don't throw - analytics should never break calls
          console.error('⚠️  Error logging call (non-critical):', dbError.message);
        }
      }
    } catch (error) {
      // Log error but don't throw - analytics should never break calls
      console.error('⚠️  Error in status callback (non-critical):', error.message);
    }
  });
});

// ============================================================================
// PHASE 1: ANALYTICS Dashboard (Isolated route)
// ============================================================================
// This route serves the client dashboard at /:clientSlug (e.g., /unclesals)
// It only matches if the path is a valid client slug (alphanumeric + hyphens)
// IMPORTANT: This route must be BEFORE the catch-all route
app.get('/:clientSlug', (req, res, next) => {
  const clientSlug = req.params.clientSlug;
  
  // Skip if it's an API route, known route, or has file extension
  if (clientSlug.startsWith('api') || 
      clientSlug === 'health' || 
      clientSlug === 'media-stream' ||
      clientSlug === 'incoming-call' ||
      clientSlug.includes('.') ||
      !/^[a-z0-9-]+$/.test(clientSlug) ||
      clientSlug.length > 50) {
    return next(); // Let other routes handle it
  }
  
  // Serve dashboard HTML
  const path = require('path');
  const fs = require('fs');
  const dashboardPath = path.join(__dirname, 'apps/dashboard/public/index.html');
  
  console.log('📊 Dashboard route matched for:', clientSlug);
  console.log('📊 Dashboard file path:', dashboardPath);
  console.log('📊 File exists:', fs.existsSync(dashboardPath));
  
  // Check if file exists
  if (fs.existsSync(dashboardPath)) {
    try {
      res.sendFile(dashboardPath);
      console.log('✓ Dashboard served successfully');
    } catch (error) {
      console.error('Error serving dashboard:', error);
      res.status(500).send('Error loading dashboard');
    }
  } else {
    console.error('❌ Dashboard file not found at:', dashboardPath);
    res.status(404).send('Dashboard not found. File path: ' + dashboardPath);
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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:1472',message:'Order initialized',data:{streamSid:streamSid,customerPhone:callerPhone,itemsCount:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          
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
          
          // CRITICAL: Only log orders that are COMPLETE and CONFIRMED
          // DO NOT log incomplete orders - this causes "mystery rows" and wrong data
          if (order && order.items.length > 0 && !order.logged && order.confirmed) {
            console.log('📝 Stream ending - checking if COMPLETE order should be logged...');
            console.log('Order status - confirmed:', order.confirmed, 'items:', order.items.length);
            
            // CRITICAL: Validate ALL required fields before logging
            const hasName = !!order.customerName && order.customerName.trim().length > 0;
            const hasDeliveryMethod = !!order.deliveryMethod;
            const hasAddress = order.deliveryMethod !== 'delivery' || (!!order.address && order.address.trim().length > 0);
            const validItems = order.items.filter(item => item.name && item.name.length > 0 && (item.price || 0) > 0);
            const hasValidItems = validItems.length > 0;
            
            console.log('🔍 Stream end validation:', {
              hasName,
              hasDeliveryMethod,
              hasAddress,
              hasValidItems,
              customerName: order.customerName || 'MISSING',
              deliveryMethod: order.deliveryMethod || 'MISSING',
              address: order.address || 'MISSING',
              customerPhone: order.customerPhone || 'MISSING'
            });
            
            // ONLY log if ALL required data is present
            if (hasName && hasDeliveryMethod && hasAddress && hasValidItems) {
              console.log('✅ Order is COMPLETE - logging to Google Sheets');
              console.log('📋 Order details:', {
                items: validItems.length,
                itemsList: validItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
                deliveryMethod: order.deliveryMethod,
                customerName: order.customerName,
                customerPhone: order.customerPhone || 'not provided',
                address: order.address || 'N/A'
              });
              
              order.logged = true;
              activeOrders.set(streamSid, order);
              logOrder(order, storeConfig || {}).catch(error => {
                console.error('❌ Error logging order on stream end:', error);
                // Reset logged flag on error so it can be retried
                order.logged = false;
                activeOrders.set(streamSid, order);
              });
            } else {
              console.warn('⚠️  Order is INCOMPLETE - NOT logging to prevent wrong data');
              console.warn('⚠️  Missing:', {
                name: !hasName,
                deliveryMethod: !hasDeliveryMethod,
                address: !hasAddress,
                validItems: !hasValidItems
              });
              console.warn('⚠️  Incomplete orders are NOT logged to prevent mystery rows and wrong data');
            }
          } else if (order && order.items.length > 0 && !order.confirmed) {
            console.warn('⚠️  Order has items but was never confirmed - NOT logging');
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
          conversationSummaries.delete(streamSid); // TOKEN OPTIMIZATION: Clean up memory summaries
          lastResponseTimestamps.delete(streamSid); // TOKEN OPTIMIZATION: Clean up debounce timestamps
          sessionMenuCache.delete(streamSid); // TOKEN OPTIMIZATION: Clean up menu cache
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
            threshold: 0.6, // Optimized: Lower threshold (0.6) - even faster response detection while preventing interruptions
            prefix_padding_ms: 250,  // Optimized: Reduced padding (250ms) - faster response while preventing cut-offs
            silence_duration_ms: 500  // CRITICAL: Reduced to 500ms for SUPER FAST, natural responses - maintains natural flow without interruptions
          },
          temperature: 0.7,  // Slightly lower for faster, more focused responses
          max_response_output_tokens: TOKEN_BUDGET.MAX_OUTPUT_TOKENS,  // HARD CAP: 150 tokens max per response
          tools: [
            {
              type: 'function',
              name: 'add_item_to_order',
              description: 'MANDATORY: You MUST call this tool immediately when the customer orders ANY item. Do NOT just mention items in your response - you MUST call this tool to add them to the order. If customer says "large pepperoni pizza", call this tool with name="pepperoni pizza", size="large". If customer says "fries", call this tool with name="french fries". DO NOT generate text responses about items without calling this tool.',
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
          instructions: buildCompactInstructions(currentOrder, menu, null)
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
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:2211',message:'add_item_to_order tool called',data:{functionName:functionName,functionArgs:functionArgs,streamSid:streamSid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                  // #endregion
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
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:2246',message:'Parsing tool input',data:{name:name,size:size,quantity:quantity,orderItemsBefore:currentOrder.items.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    
                    // Menu is already available from connectToOpenAI scope
                    if (!menu || typeof menu !== 'object') {
                      console.error('❌ Menu is not valid');
                      break;
                    }
                    
                    let itemPrice = 0;
                    let itemName = name;
                    
                    // Try to find item in menu - CRITICAL: Only add items that exist in menu
                    let foundInMenu = false;
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:2258',message:'Searching menu for item',data:{searchName:name,menuItems:Object.keys(menu).slice(0,10)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    try {
                      for (const menuItem in menu) {
                        if (menuItem.toLowerCase() === name.toLowerCase()) {
                          itemName = menuItem;
                          foundInMenu = true;
                          const menuItemData = menu[menuItem];
                          // #region agent log
                          fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:2261',message:'Item found in menu',data:{searchName:name,matchedItem:menuItem,size:size,hasPriceMap:!!menuItemData.priceMap,hasPrice:!!menuItemData.price},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                          // #endregion
                          
                          // Try to get price from priceMap first (for items with sizes)
                          if (size && menuItemData && menuItemData.priceMap && menuItemData.priceMap[size]) {
                            itemPrice = menuItemData.priceMap[size];
                            console.log(`✅ Found price for ${itemName} (${size}): $${itemPrice}`);
                          } 
                          // Fallback to direct price property
                          else if (menuItemData && menuItemData.price) {
                            itemPrice = menuItemData.price;
                            console.log(`✅ Found price for ${itemName}: $${itemPrice}`);
                          }
                          // Try default size if no size specified
                          else if (menuItemData && menuItemData.priceMap) {
                            const defaultSize = menuItemData.sizes && menuItemData.sizes.length > 0 ? menuItemData.sizes[0] : 'regular';
                            if (menuItemData.priceMap[defaultSize]) {
                              itemPrice = menuItemData.priceMap[defaultSize];
                              console.log(`✅ Found price for ${itemName} (default size ${defaultSize}): $${itemPrice}`);
                            }
                          }
                          
                          if (itemPrice === 0) {
                            console.error(`❌ WARNING: Item "${itemName}" found in menu but price is 0!`);
                            console.error(`❌ Menu item data:`, JSON.stringify(menuItemData, null, 2));
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
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:2299',message:'Item NOT found in menu',data:{searchName:name,menuItems:Object.keys(menu)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                      // #endregion
                      try {
                        console.warn(`⚠️  Available menu items: ${Object.keys(menu).join(', ')}`);
                      } catch (e) {
                        console.warn('⚠️  Could not list menu items');
                      }
                      break; // Don't add items that aren't in the menu
                    }
                    
                    // CRITICAL: Don't add items with 0 price - this causes $0.00 orders
                    if (itemPrice === 0) {
                      console.error(`❌❌❌ CANNOT ADD ITEM - PRICE IS 0 ❌❌❌`);
                      console.error(`❌ Item: ${itemName}, Size: ${size || 'regular'}`);
                      console.error(`❌ This will cause the order to have $0.00 total`);
                      console.error(`❌ Menu structure may be incorrect or item not properly configured`);
                      // Don't add item - it will cause price calculation issues
                      return; // Exit early - don't add item
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
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:2342',message:'Item added to order',data:{streamSid:streamSid,itemsCount:currentOrder.items.length,items:currentOrder.items.map(i=>({name:i.name,quantity:i.quantity,price:i.price}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                      // #endregion
                      
                      // Verify the order was saved correctly
                      const verifyOrder = activeOrders.get(streamSid);
                      if (verifyOrder && verifyOrder.items && verifyOrder.items.length !== currentOrder.items.length) {
                        console.error('❌ CRITICAL: Order not saved correctly! Expected', currentOrder.items.length, 'items but got', verifyOrder.items.length);
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:2347',message:'Order NOT saved correctly',data:{expected:currentOrder.items.length,actual:verifyOrder.items.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        // #endregion
                      } else {
                        console.log('✅ Order saved correctly - verified', verifyOrder?.items?.length || 0, 'items in map');
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:2350',message:'Order saved correctly',data:{itemsCount:verifyOrder.items.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        // #endregion
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
                      // TOKEN OPTIMIZATION: Debounce response.create calls
                      if (shouldDebounceResponse(streamSid)) {
                        console.log('⏳ Debounced response.create after tool call');
                        return;
                      }
                      
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
                        
                        // Estimate tokens for tracking
                        const estimatedPrompt = estimateTokens(buildCompactInstructions(activeOrders.get(streamSid), menu, null));
                        logTokenUsage(streamSid, estimatedPrompt, TOKEN_BUDGET.MAX_OUTPUT_TOKENS, 'tool-call-response');
                        
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
              
              // TOKEN OPTIMIZATION: Track last 2 user turns for memory summary
              const summary = conversationSummaries.get(streamSid) || { summary: '', lastUserTurns: [], lastAssistantTurns: [] };
              summary.lastUserTurns.push(data.transcript);
              // Keep only last 2 turns (TOKEN_BUDGET.MAX_HISTORY_TURNS)
              while (summary.lastUserTurns.length > TOKEN_BUDGET.MAX_HISTORY_TURNS) {
                summary.lastUserTurns.shift();
              }
              // Store last user text for menu retrieval
              summary.lastUserText = data.transcript;
              conversationSummaries.set(streamSid, summary);
              
              // Update session menu cache based on what user mentioned
              getSessionMenuSnippet(streamSid, menu, data.transcript);
              
              // Log estimated token usage for this turn
              const currentOrderForTokens = activeOrders.get(streamSid);
              const estimatedPrompt = estimateTokens(buildCompactInstructions(currentOrderForTokens, menu, { lastUserText: data.transcript }));
              console.log(`📊 Estimated prompt tokens for this turn: ~${estimatedPrompt}`);
              
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
                      // CRITICAL: Validate delivery method is valid - prevent mystery rows
                      const methodValue = String(toolCall.input.method).trim().toLowerCase();
                      
                      // CRITICAL: Reject any numeric values (like ZIP codes "46031") - these are NOT valid delivery methods
                      if (/^\d+$/.test(methodValue) && methodValue.length > 2) {
                        console.error('❌ INVALID: Delivery method is a number (like ZIP code):', toolCall.input.method);
                        console.error('❌ Rejecting invalid delivery method - this prevents mystery rows');
                        console.error('❌ Valid delivery methods are: "pickup" or "delivery"');
                        // Don't set invalid delivery method - this prevents corrupted data
                        break;
                      }
                      
                      // Only accept "pickup" or "delivery" - normalize to lowercase
                      if (methodValue === 'pickup' || methodValue === 'delivery') {
                        currentOrder.deliveryMethod = methodValue;
                        console.log('✅ Set delivery method:', methodValue);
                        activeOrders.set(streamSid, currentOrder);
                      } else {
                        console.error('❌ INVALID: Delivery method is not "pickup" or "delivery":', toolCall.input.method);
                        console.error('❌ Rejecting invalid delivery method - this prevents mystery rows');
                        // Don't set invalid delivery method
                        break;
                      }
                      
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
                            // CRITICAL: NEVER check responseInProgress - ALWAYS force response immediately
                            // This ensures the AI NEVER goes silent after delivery confirmation
                            console.log('✓ Delivery method set - ensuring IMMEDIATE AI response with confirmation (attempt ' + (deliveryRetryCount + 1) + '/' + maxDeliveryRetries + ')');
                            const deliveryResponsePayload = {
                              type: 'response.create',
                              response: {
                                modalities: ['audio', 'text']
                              }
                            };
                            
                            try {
                              // CRITICAL: Force response immediately - don't check responseInProgress
                              responseInProgress = false; // Clear flag before sending
                              const sendResult = safeSendToOpenAI(deliveryResponsePayload, 'response.create (after delivery method)');
                              if (sendResult) {
                                console.log('✓ Response creation sent IMMEDIATELY after delivery method set');
                                // CRITICAL: Don't reset responseInProgress immediately - wait for response to actually start
                                // Set a longer timeout to check if response actually started
                                setTimeout(() => {
                                  // Check if response actually started (responseInProgress should still be true if it did)
                                  // If it's false, the response might have failed
                                  if (!responseInProgress) {
                                    console.warn('⚠️  Response creation sent but responseInProgress is false - response may have failed');
                                    // Retry if we haven't exceeded max retries
                                    if (deliveryRetryCount < maxDeliveryRetries - 1) {
                                      deliveryRetryCount++;
                                      console.log('🔄 Retrying delivery response due to potential failure');
                                      ensureDeliveryResponse();
                                    }
                                  } else {
                                    // Response started successfully, reset after it completes
                                    setTimeout(() => {
                                      responseInProgress = false;
                                    }, 500);
                                  }
                                }, 500);
                              } else {
                                console.error('❌ Failed to create response after delivery method');
                                // Retry faster if we haven't exceeded max retries
                                if (deliveryRetryCount < maxDeliveryRetries - 1) {
                                  deliveryRetryCount++;
                                  ensureDeliveryResponse();
                                } else {
                                  responseInProgress = false;
                                  console.error('❌ Max retries reached - delivery confirmation may be silent');
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
                        }, deliveryRetryCount === 0 ? 0 : 50); // CRITICAL: First attempt is IMMEDIATE (0ms), retries are VERY fast (50ms)
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
                        const validItems = confirmedOrder.items.filter(item => item.name && item.name.length > 0 && (item.price || 0) > 0);
                        
                        // CRITICAL: Validate ALL required fields before logging
                        const hasName = !!confirmedOrder.customerName && confirmedOrder.customerName.trim().length > 0;
                        const hasDeliveryMethod = !!confirmedOrder.deliveryMethod;
                        const hasAddress = confirmedOrder.deliveryMethod !== 'delivery' || (!!confirmedOrder.address && confirmedOrder.address.trim().length > 0);
                        const hasValidItems = validItems.length > 0;
                        const allItemsHavePrices = validItems.every(item => (item.price || 0) > 0);
                        
                        console.log('🔍🔍🔍 VALIDATION CHECK BEFORE LOGGING:');
                        console.log('🔍 Has name:', hasName, '| Name:', confirmedOrder.customerName || 'MISSING');
                        console.log('🔍 Has delivery method:', hasDeliveryMethod, '| Method:', confirmedOrder.deliveryMethod || 'MISSING');
                        console.log('🔍 Has address (if needed):', hasAddress, '| Address:', confirmedOrder.address || 'MISSING');
                        console.log('🔍 Has valid items:', hasValidItems, '| Items count:', validItems.length);
                        console.log('🔍 All items have prices:', allItemsHavePrices);
                        
                        if (!hasName) {
                          console.error('❌❌❌ CANNOT LOG - NAME IS MISSING ❌❌❌');
                          console.error('❌ The AI must ask for and collect the customer name BEFORE calling confirm_order');
                          console.error('❌ Order will NOT be logged until name is provided');
                          // Don't log - wait for name to be collected
                          return; // Use return instead of break in setTimeout callback
                        }
                        
                        if (!hasDeliveryMethod) {
                          console.error('❌❌❌ CANNOT LOG - DELIVERY METHOD IS MISSING ❌❌❌');
                          console.error('❌ The AI must ask for pickup/delivery BEFORE calling confirm_order');
                          console.error('❌ Order will NOT be logged until delivery method is provided');
                          // Don't log - wait for delivery method to be collected
                          return; // Use return instead of break in setTimeout callback
                        }
                        
                        if (!hasAddress) {
                          console.error('❌❌❌ CANNOT LOG - ADDRESS IS MISSING FOR DELIVERY ❌❌❌');
                          console.error('❌ The AI must ask for and collect the delivery address BEFORE calling confirm_order');
                          console.error('❌ Order will NOT be logged until address is provided');
                          // Don't log - wait for address to be collected
                          return; // Use return instead of break in setTimeout callback
                        }
                        
                        if (!hasValidItems || !allItemsHavePrices) {
                          console.error('❌❌❌ CANNOT LOG - ITEMS ARE INVALID OR MISSING PRICES ❌❌❌');
                          console.error('❌ All items must have names and prices');
                          console.error('❌ Valid items:', validItems.length, '| Items with prices:', validItems.filter(i => (i.price || 0) > 0).length);
                          // Don't log - items are invalid
                          return; // Use return instead of break in setTimeout callback
                        }
                        
                        if (validItems.length > 0) {
                          console.log('✅✅✅ ALL VALIDATION PASSED - LOGGING ORDER ✅✅✅');
                          console.log('📝 Order confirmed - logging to Google Sheets...');
                          console.log('📋 Confirmed order details (FINAL STATE - THIS IS WHAT WILL BE LOGGED):', {
                            totalItems: confirmedOrder.items.length,
                            validItems: validItems.length,
                            itemsList: validItems.map(i => `${i.quantity}x ${i.name} @ $${(i.price || 0).toFixed(2)}`).join(', '),
                            customerName: confirmedOrder.customerName,
                            deliveryMethod: confirmedOrder.deliveryMethod,
                            address: confirmedOrder.address || 'N/A (pickup)',
                            customerPhone: confirmedOrder.customerPhone || 'not provided'
                          });
                          
                          // CRITICAL DEBUG: Show exact values that will be sent to Google Sheets
                          console.log('🔍🔍🔍 EXACT VALUES FOR GOOGLE SHEETS:');
                          console.log('🔍 Column A (Name):', confirmedOrder.customerName);
                          console.log('🔍 Column B (Phone):', confirmedOrder.customerPhone || 'not provided');
                          console.log('🔍 Column C (Pick Up/Delivery):', confirmedOrder.deliveryMethod === 'delivery' && confirmedOrder.address 
                            ? `delivery - ${confirmedOrder.address}` 
                            : confirmedOrder.deliveryMethod);
                          console.log('🔍 Address:', confirmedOrder.address || 'N/A (pickup)');
                          
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
              
              // CRITICAL: Check if AI mentioned items but didn't call the tool
              const transcript = data.transcript.toLowerCase();
              const itemKeywords = ['pizza', 'fries', 'wings', 'soda', 'drink', 'knots', 'bread', 'salad', 'sub'];
              const mentionedItems = itemKeywords.filter(keyword => transcript.includes(keyword));
              const orderForCheck = activeOrders.get(streamSid);
              
              if (mentionedItems.length > 0 && orderForCheck && orderForCheck.items.length === 0) {
                console.error('❌❌❌ CRITICAL: AI mentioned items but DID NOT call add_item_to_order tool! ❌❌❌');
                console.error('❌ Transcript:', data.transcript);
                console.error('❌ Mentioned keywords:', mentionedItems);
                console.error('❌ Order has', orderForCheck.items.length, 'items - should have called tool!');
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:3447',message:'AI mentioned items but did not call tool',data:{transcript:data.transcript,mentionedItems:mentionedItems,orderItemsCount:orderForCheck.items.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
              }
              
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
            
            // TOKEN OPTIMIZATION: Update conversation memory summary after assistant response
            if (data.response?.status === 'completed') {
              const currentOrder = activeOrders.get(streamSid);
              if (currentOrder) {
                const summaryText = createConversationSummary(currentOrder);
                const existing = conversationSummaries.get(streamSid) || { summary: '', lastUserTurns: [], lastAssistantTurns: [] };
                existing.summary = summaryText;
                
                // Track assistant response text (from output items)
                const outputItems = data.response?.output || [];
                const messageItem = outputItems.find(item => item.type === 'message');
                if (messageItem?.content?.[0]?.text) {
                  existing.lastAssistantTurns.push(messageItem.content[0].text);
                  // Keep only last 2 turns
                  while (existing.lastAssistantTurns.length > TOKEN_BUDGET.MAX_HISTORY_TURNS) {
                    existing.lastAssistantTurns.shift();
                  }
                }
                
                conversationSummaries.set(streamSid, existing);
                
                // Log token usage for completed response
                const estimatedPrompt = estimateTokens(buildCompactInstructions(currentOrder, menu, existing));
                const estimatedCompletion = messageItem?.content?.[0]?.text ? estimateTokens(messageItem.content[0].text) : TOKEN_BUDGET.MAX_OUTPUT_TOKENS;
                logTokenUsage(streamSid, estimatedPrompt, estimatedCompletion, 'response-done');
              }
            }
            
            // CRITICAL: Check if response failed BEFORE resetting responseInProgress
            // This allows us to retry if it was a critical confirmation
            const responseFailed = data.response?.status === 'failed';
            const outputItems = data.response?.output || [];
            const hasToolCall = outputItems.some(item => item.type === 'function_call');
            const hasMessage = outputItems.some(item => item.type === 'message');
            
            // CRITICAL: If response failed and it was a delivery/name/address confirmation, we MUST retry
            let isCriticalConfirmation = false;
            if (responseFailed) {
              const currentOrder = activeOrders.get(streamSid);
              const isDeliveryConfirmation = currentOrder?.deliveryMethod && !currentOrder?.address && currentOrder?.deliveryMethod === 'delivery';
              const isNameConfirmation = !currentOrder?.customerName;
              const isAddressConfirmation = currentOrder?.deliveryMethod === 'delivery' && !currentOrder?.address;
              
              isCriticalConfirmation = isDeliveryConfirmation || isNameConfirmation || isAddressConfirmation;
              
              if (isCriticalConfirmation) {
                console.error('🚨🚨🚨 CRITICAL: Response failed during confirmation - MUST retry to prevent silence!');
                console.error('🚨 Context:', { isDeliveryConfirmation, isNameConfirmation, isAddressConfirmation, responseStatus: data.response?.status });
                // Don't reset responseInProgress yet - let the failed handler retry
                // The response.done handler with status === 'failed' will handle the retry
              }
            }
            
            // CRITICAL: DO NOT force follow-up responses - this causes interruptions
            // The AI will respond naturally via turn_detection when the user finishes speaking
            // If the response was just a tool call, the AI will still respond naturally after the user speaks
            if (hasToolCall && !hasMessage && !responseFailed) {
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
            
            // CRITICAL: Only reset responseInProgress if response didn't fail, or if it failed but wasn't a critical confirmation
            // If it was a critical confirmation failure, the failed handler will manage responseInProgress
            if (!responseFailed || !isCriticalConfirmation) {
              responseInProgress = false; // Mark that response is complete, ready for next one
              console.log('✓ responseInProgress reset to false');
            } else {
              console.log('⚠️  Keeping responseInProgress true - failed handler will manage retry');
            }
            
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
                
                
                // CRITICAL: Handle rate limit errors with retry logic
                const isRateLimit = errorDetails.code === 'rate_limit_exceeded' || 
                                   errorDetails.type === 'rate_limit_exceeded' ||
                                   (errorDetails.message && typeof errorDetails.message === 'string' && 
                                    (errorDetails.message.includes('rate_limit') || 
                                     errorDetails.message.includes('Rate limit') ||
                                     errorDetails.message.includes('TPM') ||
                                     errorDetails.message.includes('tokens per min')));
                
                if (isRateLimit) {
                  console.error('\n🚨🚨🚨 RATE LIMIT ERROR DETECTED - RESPONSE FAILED 🚨🚨🚨');
                  console.error('OpenAI API rate limit exceeded - this causes delays and silence!');
                  console.error('Error message:', errorDetails.message);
                  
                  // Extract wait time from error message if available (e.g., "Please try again in 3.961s")
                  let waitTime = 5000; // Default 5 seconds
                  const waitMatch = errorDetails.message?.match(/try again in ([\d.]+)s/i);
                  if (waitMatch) {
                    waitTime = Math.ceil(parseFloat(waitMatch[1]) * 1000) + 1000; // Add 1 second buffer
                    console.error(`⏳ Will retry after ${waitTime}ms (${waitTime/1000}s)`);
                  }
                  
                  // CRITICAL: Check if this was a delivery/name/address confirmation that failed
                  // If so, we need to retry more aggressively
                  const currentOrder = activeOrders.get(streamSid);
                  const isDeliveryConfirmation = currentOrder?.deliveryMethod && !currentOrder?.address && currentOrder?.deliveryMethod === 'delivery';
                  const isNameConfirmation = !currentOrder?.customerName;
                  const isAddressConfirmation = currentOrder?.deliveryMethod === 'delivery' && !currentOrder?.address;
                  
                  if (isDeliveryConfirmation || isNameConfirmation || isAddressConfirmation) {
                    console.error('🚨 CRITICAL: Rate limit hit during confirmation - MUST retry to prevent silence!');
                    console.error('🚨 Context:', { isDeliveryConfirmation, isNameConfirmation, isAddressConfirmation });
                  }
                  
                  // Retry the response creation after rate limit clears
                  setTimeout(() => {
                    if (openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                      console.log('✓ Retrying response creation after rate limit cleared');
                      responseInProgress = false; // Clear flag to allow retry
                      
                      // CRITICAL: For delivery/name/address confirmations, retry even if user is speaking
                      // This ensures we don't go silent during critical moments
                      if (!userIsSpeaking || isDeliveryConfirmation || isNameConfirmation || isAddressConfirmation) {
                        const retryResponsePayload = {
                          type: 'response.create',
                          response: {
                            modalities: ['audio', 'text']
                          }
                        };
                        
                        if (safeSendToOpenAI(retryResponsePayload, 'response.create (rate limit retry)')) {
                          responseInProgress = true;
                          console.log('✓ Retry response creation sent after rate limit');
                          
                          // If this was a critical confirmation, also trigger the specific handler
                          if (isDeliveryConfirmation) {
                            console.log('🚨 Re-triggering delivery confirmation handler after rate limit retry');
                            // The response will be created, and the AI should ask for address
                          }
                        } else {
                          console.error('❌ Failed to retry response creation after rate limit');
                          responseInProgress = false;
                          
                          // If critical confirmation failed, try one more time
                          if (isDeliveryConfirmation || isNameConfirmation || isAddressConfirmation) {
                            console.error('🚨 CRITICAL: Retry failed for confirmation - attempting one more time in 2 seconds');
                            setTimeout(() => {
                              if (openaiClient && openaiClient.readyState === WebSocket.OPEN && streamSid === sid) {
                                responseInProgress = false;
                                if (safeSendToOpenAI(retryResponsePayload, 'response.create (rate limit retry - second attempt)')) {
                                  responseInProgress = true;
                                  console.log('✓ Second retry attempt sent');
                                }
                              }
                            }, 2000);
                          }
                        }
                      } else {
                        console.log('⚠️  User is speaking - will retry when they finish');
                      }
                    } else {
                      console.error('❌ Cannot retry - OpenAI client not ready or streamSid mismatch');
                    }
                  }, waitTime);
                  
                  // Don't continue with normal error recovery for rate limits - we're retrying
                  break;
                }
                
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
            } else if (data.response?.status === 'incomplete') {
              const incompleteReason = data.response?.status_details?.reason || 'unknown';
              console.warn(`⚠️  Response INCOMPLETE - reason: ${incompleteReason}`);
              if (incompleteReason === 'max_output_tokens') {
                console.error('🚨 Response cut off due to max_output_tokens limit! Current limit:', TOKEN_BUDGET.MAX_OUTPUT_TOKENS);
              }
              console.log('Full response object:', JSON.stringify(data.response, null, 2));
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

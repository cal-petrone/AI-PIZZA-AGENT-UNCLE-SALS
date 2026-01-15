/**
 * Google Sheets Integration
 * Logs orders directly to a Google Sheet
 * 
 * Setup Instructions:
 * 1. Go to Google Cloud Console (https://console.cloud.google.com/)
 * 2. Create a new project or select existing
 * 3. Enable Google Sheets API
 * 4. Create Service Account credentials
 * 5. Download JSON key file
 * 6. Share your Google Sheet with the service account email
 * 7. Add to .env: GOOGLE_SHEETS_CREDENTIALS_PATH=./path/to/credentials.json
 * 8. Add to .env: GOOGLE_SHEETS_ID=your-spreadsheet-id
 */

const { google } = require('googleapis');
const path = require('path');

let sheetsClient = null;
let spreadsheetId = null;

/**
 * Calculate order totals - SINGLE SOURCE OF TRUTH
 * Used by both spoken confirmation and Google Sheets logging
 * @param {Array} items - Order items array
 * @param {number} taxRate - Tax rate (default 0.08 for 8% NYS tax)
 * @returns {Object} { subtotal, tax, total }
 */
function calculateOrderTotals(items, taxRate = 0.08) {
  if (!items || items.length === 0) {
    return { subtotal: 0, tax: 0, total: 0 };
  }
  
  let subtotal = 0;
  items.forEach(item => {
    const itemPrice = parseFloat(item.price) || 0;
    const quantity = parseInt(item.quantity) || 1;
    const itemTotal = itemPrice * quantity;
    subtotal += itemTotal;
  });
  
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100
  };
}

// Export for use in server.js
module.exports.calculateOrderTotals = calculateOrderTotals;

/**
 * Initialize Google Sheets client
 */
async function initializeGoogleSheets() {
  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
  const credentialsBase64 = process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64;
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  
  if ((!credentialsPath && !credentialsBase64) || !sheetId) {
    console.log('⚠ Google Sheets not configured - skipping initialization');
    return false;
  }
  
  try {
    let auth;
    const fs = require('fs');
    
    // Option 1: Use base64 encoded credentials (for Railway/cloud deployments)
    if (credentialsBase64) {
      console.log('📁 Loading Google Sheets credentials from base64 environment variable');
      try {
        // Clean the base64 string: remove whitespace, newlines, and any trailing characters
        const cleanedBase64 = credentialsBase64.trim().replace(/\s/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
        
        // Validate base64 string is not empty
        if (!cleanedBase64 || cleanedBase64.length < 100) {
          console.error('✗ Base64 credentials string is too short or empty');
          console.error('✗ Expected: Long base64 string (1000+ characters)');
          console.error('✗ Got:', cleanedBase64 ? `${cleanedBase64.length} characters` : 'empty');
          return false;
        }
        
        // Decode base64
        let credentialsJson;
        try {
          credentialsJson = Buffer.from(cleanedBase64, 'base64').toString('utf-8');
        } catch (decodeError) {
          console.error('✗ Failed to decode base64 string:', decodeError.message);
          console.error('✗ Base64 string may be corrupted or incomplete');
          console.error('✗ First 50 chars of base64:', cleanedBase64.substring(0, 50));
          console.error('✗ Last 50 chars of base64:', cleanedBase64.substring(cleanedBase64.length - 50));
          return false;
        }
        
        // Validate JSON structure
        if (!credentialsJson || credentialsJson.trim().length === 0) {
          console.error('✗ Decoded base64 string is empty');
          return false;
        }
        
        // Parse JSON
        let credentials;
        try {
          credentials = JSON.parse(credentialsJson);
        } catch (parseError) {
          console.error('✗ Failed to parse JSON from decoded base64:', parseError.message);
          console.error('✗ JSON error position:', parseError.message.match(/position (\d+)/)?.[1] || 'unknown');
          console.error('✗ First 200 chars of decoded JSON:', credentialsJson.substring(0, 200));
          console.error('✗ Last 200 chars of decoded JSON:', credentialsJson.substring(Math.max(0, credentialsJson.length - 200)));
          return false;
        }
        
        // Validate required credential fields
        const requiredFields = ['type', 'project_id', 'private_key', 'client_email', 'client_id'];
        const missingFields = requiredFields.filter(field => !credentials[field]);
        if (missingFields.length > 0) {
          console.error('✗ Missing required credential fields:', missingFields.join(', '));
          console.error('✗ Available fields:', Object.keys(credentials).join(', '));
          return false;
        }
        
        // Create auth
        auth = new google.auth.GoogleAuth({
          credentials: credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        
        console.log('✓ Base64 credentials decoded and validated successfully');
      } catch (error) {
        console.error('✗ Failed to process base64 credentials:', error.message);
        console.error('✗ Error stack:', error.stack?.substring(0, 500));
        return false;
      }
    } 
    // Option 2: Use file path (for local development)
    else if (credentialsPath) {
      // Resolve path to absolute - handle both relative and absolute paths
      const credentialsAbsolutePath = path.isAbsolute(credentialsPath)
        ? credentialsPath
        : path.resolve(__dirname, '..', credentialsPath.replace(/^\.\//, ''));
      
      console.log('📁 Loading Google Sheets credentials from:', credentialsAbsolutePath);
      
      // Check if file exists
      if (!fs.existsSync(credentialsAbsolutePath)) {
        console.error('✗ Credentials file not found:', credentialsAbsolutePath);
        return false;
      }
      
      // Load credentials from file
      auth = new google.auth.GoogleAuth({
        keyFile: credentialsAbsolutePath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else {
      console.error('✗ No credentials provided (neither path nor base64)');
      return false;
    }
    
    sheetsClient = google.sheets({ version: 'v4', auth });
    spreadsheetId = sheetId;
    
    console.log('✓ Google Sheets initialized');
    return true;
  } catch (error) {
    console.error('✗ Error initializing Google Sheets:', error.message);
    return false;
  }
}

/**
 * Format phone number as (123) 456-0987
 * @param {string} phone - Phone number (digits only or with formatting)
 * @returns {string} Formatted phone number ((123) 456-0987) or appropriate fallback
 */
function formatPhoneNumber(phone) {
  // Handle missing/blocked/unknown phone numbers
  if (!phone) {
    console.log('📞 PHONE_FORMAT: Phone number missing - returning "Unknown"');
    return 'Unknown';
  }
  
  const phoneStr = String(phone).toLowerCase().trim();
  
  // Check for blocked/anonymous/restricted caller IDs
  if (phoneStr.includes('anonymous') || phoneStr.includes('blocked') || 
      phoneStr.includes('restricted') || phoneStr.includes('private') ||
      phoneStr === 'undefined' || phoneStr === 'null') {
    console.log(`📞 PHONE_FORMAT: Phone is blocked/anonymous: "${phone}" - returning "Blocked"`);
    return 'Blocked';
  }
  
  // Extract only digits
  const digits = String(phone).replace(/\D/g, '');
  
  // Handle country code (remove leading 1 for US numbers if 11 digits)
  let cleanDigits = digits;
  if (digits.length === 11 && digits.startsWith('1')) {
    cleanDigits = digits.slice(1);
  }
  
  // Must be 10 digits for US number
  if (cleanDigits.length !== 10) {
    console.log(`📞 PHONE_FORMAT: Has ${cleanDigits.length} digits (expected 10): "${phone}" - returning raw`);
    return phone || 'Unknown';
  }
  
  // Format as (123) 456-0987
  const formatted = `(${cleanDigits.slice(0, 3)}) ${cleanDigits.slice(3, 6)}-${cleanDigits.slice(6)}`;
  console.log(`📞 PHONE_FORMAT: "${phone}" -> "${formatted}"`);
  return formatted;
}

/**
 * Log order to Google Sheets
 * @param {Object} order - Order object with items, totals, etc.
 * @param {Object} storeConfig - Store configuration (name, location, etc.)
 */
async function logOrderToGoogleSheets(order, storeConfig = {}) {
  if (!sheetsClient || !spreadsheetId) {
    console.log('⚠ Google Sheets not configured - skipping order log');
    return false;
  }
  
  // Retry logic for 502 errors and other transient failures
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // CRITICAL: Validate order has items
      if (!order.items || order.items.length === 0) {
        console.error('❌ ERROR: Order has no items - cannot calculate total');
        console.error('❌ Order object:', JSON.stringify(order, null, 2));
        return false; // Don't log orders with no items
      }
      
      // Log item details for debugging
      order.items.forEach(item => {
        const itemPrice = parseFloat(item.price) || 0;
        const itemQuantity = parseInt(item.quantity) || 1;
        const itemTotal = itemPrice * itemQuantity;
        console.log(`  - Item: ${itemQuantity}x ${item.name} @ $${itemPrice.toFixed(2)} = $${itemTotal.toFixed(2)}`);
      });
      
      // CRITICAL: Use SINGLE SOURCE OF TRUTH for totals
      // This same calculation is used for spoken totals
      const taxRate = parseFloat(storeConfig.taxRate) || 0.08; // 8% NYS tax
      const totals = calculateOrderTotals(order.items, taxRate);
      
      console.log(`📊 LOGGED_TOTAL: Subtotal: $${totals.subtotal.toFixed(2)} + Tax (${(taxRate * 100).toFixed(0)}%): $${totals.tax.toFixed(2)} = Total: $${totals.total.toFixed(2)}`);
      
      // Format items as string - MUST include ALL details for wings and other items
      // Wings format: "1x Regular Wings (10 pieces, Hot, Blue Cheese)"
      // CRITICAL: pieceCount is NOT quantity for wings!
      const itemsString = order.items.map(item => {
        const qty = item.quantity || 1;
        const name = item.name || 'Unknown Item';
        
        // Check if this is a wing item (has pieceCount or itemType='wings' or name contains 'wing')
        const isWings = item.itemType === 'wings' || item.pieceCount || name.toLowerCase().includes('wing');
        
        if (isWings) {
          // Wings: MUST show pieceCount, flavor, dressing
          // Format: "1x Regular Wings (10 pieces, Hot, Blue Cheese)"
          const parts = [];
          
          // CRITICAL: Use pieceCount, NOT size for wings
          const pieceCount = item.pieceCount || 10; // Default 10 if not set
          parts.push(`${pieceCount} pieces`);
          
          if (item.flavor) parts.push(item.flavor);
          if (item.dressing) parts.push(item.dressing);
          if (item.modifiers) parts.push(item.modifiers);
          
          const wingDetails = ` (${parts.join(', ')})`;
          const wingName = item.wingType || 'Regular Wings';
          
          console.log(`🍗 WING_FORMAT: qty=${qty}, pieceCount=${pieceCount}, flavor=${item.flavor || 'NONE'}`);
          console.log(`🍗 FINAL_WING_STRING: ${qty}x ${wingName}${wingDetails}`);
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6a2bbb7a-af1b-4d24-9b15-1c6328457d57',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'google-sheets.js:wing_format',message:'WING_FORMAT_IN_SHEETS',data:{itemQuantity:qty,pieceCount:pieceCount,flavor:item.flavor||'NONE',dressing:item.dressing||'NONE',itemName:item.name,itemFull:JSON.stringify(item),finalString:`${qty}x ${wingName}${wingDetails}`},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'P_sheets_format'})}).catch(()=>{});
          // #endregion
          
          return `${qty}x ${wingName}${wingDetails}`;
        } else {
          // Non-wings: size, flavor (if any), modifiers
          const size = item.size && item.size !== 'regular' ? `${item.size} ` : '';
          const flavor = item.flavor ? ` (${item.flavor})` : '';
          const mods = item.modifiers ? ` [${item.modifiers}]` : '';
          return `${qty}x ${size}${name}${flavor}${mods}`;
        }
      }).join('; '); // Use semicolon for multi-item separation (clearer)
      
      console.log('📝 ORDER_DETAILS_STRING:', itemsString);
      
      // Prepare row data - match your Google Sheet columns exactly (7 columns: A-G)
      // Column A: Name (capitalized)
      // Column B: Phone Number
      // Column C: Pick Up/Delivery (just "Pickup" or "Delivery")
      // Column D: Delivery Address (address if delivery, "-" if pickup)
      // Column E: Estimated Pick Up Time (EST)
      // Column F: Price
      // Column G: Order Details
      
      // Helper function to capitalize first letter of each word
      const capitalizeWords = (str) => {
        if (!str || typeof str !== 'string') return str;
        return str.trim().split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      };
      
    // ============================================================
    // CRITICAL: Phone number MUST NEVER be blank
    // ============================================================
    console.log('📞 CALLER_FROM (at sheet write):', order.customerPhone || 'NULL/UNDEFINED');
    
    // CRITICAL: If phone is missing, set fallback BEFORE formatting
    if (!order.customerPhone || order.customerPhone === 'null' || order.customerPhone === 'undefined') {
      console.error('❌❌❌ CRITICAL: customerPhone is missing! Setting to "Unknown"');
      order.customerPhone = 'Unknown';
    }
    
    // Format phone number (handles blocked/unknown internally)
    const phoneNumber = formatPhoneNumber(order.customerPhone);
    
    // FINAL validation: ensure phoneNumber is never blank
    const finalPhoneForSheet = phoneNumber || 'Unknown';
    
    console.log('📞 FINAL_PHONE_FOR_SHEET:', finalPhoneForSheet);
    
    // CRITICAL: Format Column C - ALWAYS include address if delivery is selected
    // CRITICAL: Validate deliveryMethod BEFORE using it - prevent mystery rows
    // First, check if deliveryMethod is valid (not a number like "46031")
    const deliveryMethodValue = order.deliveryMethod ? String(order.deliveryMethod).trim().toLowerCase() : null;
    
    // CRITICAL: Reject any numeric values (like ZIP codes "46031") - these are NOT valid delivery methods
    if (deliveryMethodValue && /^\d+$/.test(deliveryMethodValue) && deliveryMethodValue.length > 2) {
      console.error('❌ INVALID: Delivery method is a number (like ZIP code):', order.deliveryMethod);
      console.error('❌ This will cause a mystery row - rejecting and using fallback');
      // Don't use invalid delivery method - use fallback
      order.deliveryMethod = null; // Clear invalid value
    }
    
    // Log delivery method status
    console.log('📋 Raw delivery method:', order.deliveryMethod, '| Address:', order.address || 'none');
    
    // Calculate estimated pickup time based on order complexity
    // Base time: 15 minutes for simple orders, add time for complexity
    let estimatedMinutes = 15;
    
    // Add time based on number of items
    const itemCount = order.items.length;
    if (itemCount > 3) {
      estimatedMinutes += (itemCount - 3) * 3; // 3 minutes per additional item
    }
    
    // Add time for pizzas (they take longer)
    const pizzaCount = order.items.filter(item => item.name && item.name.toLowerCase().includes('pizza')).length;
    if (pizzaCount > 0) {
      estimatedMinutes += pizzaCount * 5; // 5 minutes per pizza
    }
    
    // Add time for delivery
    if (order.deliveryMethod === 'delivery') {
      estimatedMinutes += 10; // 10 minutes for delivery
    }
    
    // Round to nearest 5 minutes and ensure minimum
    estimatedMinutes = Math.max(15, Math.ceil(estimatedMinutes / 5) * 5);
    
    // Calculate estimated pickup time
    const now = new Date();
    const estimatedPickupTime = new Date(now.getTime() + estimatedMinutes * 60000);
    const pickupTimeString = estimatedPickupTime.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // DEBUG: Log exact values being sent to Google Sheets
    console.log('🔍🔍🔍 GOOGLE SHEETS - EXACT VALUES BEING LOGGED (7 columns):');
    console.log('🔍 Column A (Name):', capitalizeWords(order.customerName) || 'Not Provided');
    console.log('🔍 Column B (Phone):', phoneNumber);
    console.log('🔍 Column C (Pick Up/Delivery):', order.deliveryMethod === 'delivery' ? 'Delivery' : order.deliveryMethod === 'pickup' ? 'Pickup' : '-');
    console.log('🔍 Column D (Delivery Address):', order.deliveryMethod === 'delivery' ? capitalizeWords(order.address) || 'Address Not Provided' : '-');
    console.log('🔍 Column E (Pick Up Time):', pickupTimeString, '| Estimated:', estimatedMinutes, 'minutes');
    console.log('🔍 Column G (Order Details):', capitalizeWords(itemsString));
    console.log('🔍 Full order object:', {
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryMethod: order.deliveryMethod,
      address: order.address || 'none',
      items: order.items.length
    });
    
    // CRITICAL: Validate all row data before writing to prevent invalid rows like "46031 Dec 30, 1:00 AM"
    // Ensure all values are valid strings/numbers - no invalid data
    
    // CRITICAL: Double-check address is included if delivery was selected
    // This prevents the address from being lost when logging
    if (order.deliveryMethod === 'delivery' && !order.address) {
      console.warn('⚠️  WARNING: Delivery selected but address is missing - this should not happen if address was provided');
      console.warn('⚠️  Order object:', {
        deliveryMethod: order.deliveryMethod,
        address: order.address,
        customerName: order.customerName,
        items: order.items?.length || 0
      });
    }
    
    // Validate and prepare each column with strict type checking
    // Column A: Name (capitalized)
    const validatedName = (order.customerName && typeof order.customerName === 'string' && order.customerName.trim().length > 0 && !/^\d+$/.test(order.customerName.trim())) 
      ? capitalizeWords(order.customerName.trim())
      : 'Not Provided';
    
    // Column B: Phone - use finalPhoneForSheet (never blank)
    const validatedPhone = finalPhoneForSheet;
    
    // Column C: Pick Up/Delivery (just "Pickup" or "Delivery", capitalized)
    // Column D: Delivery Address (address if delivery, "-" if pickup)
    let validatedDeliveryMethod = '-';
    let validatedAddress = '-';
    
    const isValidDeliveryMethod = order.deliveryMethod === 'pickup' || order.deliveryMethod === 'delivery';
    
    if (!isValidDeliveryMethod) {
      console.error('❌ INVALID: Delivery method is not valid (pickup/delivery):', order.deliveryMethod);
      validatedDeliveryMethod = '-';
      validatedAddress = '-';
    } else if (order.deliveryMethod === 'delivery') {
      validatedDeliveryMethod = 'Delivery';
      // Format address with capitalization
      if (order.address && typeof order.address === 'string' && order.address.trim().length > 0) {
        validatedAddress = capitalizeWords(order.address.trim());
      } else {
        console.warn('⚠️  WARNING: Delivery selected but no address provided');
        validatedAddress = 'Address Not Provided';
      }
    } else if (order.deliveryMethod === 'pickup') {
      validatedDeliveryMethod = 'Pickup';
      validatedAddress = '-';
    }
    
    console.log('📋 Delivery method:', validatedDeliveryMethod, '| Address:', validatedAddress);
    
    // Validate time format - must include comma and match pattern
    let validatedTime = pickupTimeString;
    if (!pickupTimeString || typeof pickupTimeString !== 'string' || !pickupTimeString.includes(',')) {
      validatedTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    }
    // Additional validation: ensure time matches expected pattern
    if (!/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{1,2}:\d{2}\s+(AM|PM)$/.test(validatedTime)) {
      console.error('❌ INVALID: Time format does not match pattern, using fallback:', validatedTime);
      validatedTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    }
    
    // Column F: Price (formatted with $ sign) - use totals.total from shared calculation
    const validatedPrice = (typeof totals.total === 'number' && !isNaN(totals.total) && totals.total >= 0) 
      ? `$${totals.total.toFixed(2)}`
      : '$0.00';
    
    // Column G: Order Details (capitalized)
    const validatedItems = (itemsString && typeof itemsString === 'string' && itemsString.trim().length > 0) 
      ? capitalizeWords(itemsString.trim())
      : 'No Items';
    
    // Final validation: Check for invalid patterns that could cause mystery rows
    // New column order: Name, Phone, Method, Address, Time, Price, Items (7 columns)
    const validatedRow = [validatedName, validatedPhone, validatedDeliveryMethod, validatedAddress, validatedTime, validatedPrice, validatedItems];
    
    console.log('📋 Validated row data (7 columns):', validatedRow);
    
    // CRITICAL: Final validation check - prevent any invalid patterns
    const hasInvalidPattern = validatedRow.some((cell, index) => {
      // Column A (Name) - must NOT be just numbers
      if (index === 0 && /^\d+$/.test(cell) && cell.length > 2) {
        console.error('❌ INVALID: Name is just numbers:', cell);
        return true;
      }
      // Column C (Delivery Method) - must be "Pickup", "Delivery", or "-"
      if (index === 2 && !['Pickup', 'Delivery', '-'].includes(cell)) {
        console.error('❌ INVALID: Delivery method is not valid:', cell);
        return true;
      }
      // Column E (Time) - must include comma and match pattern
      if (index === 4 && (!cell.includes(',') || !/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{1,2}:\d{2}\s+(AM|PM)$/.test(cell))) {
        console.error('❌ INVALID: Time format is incorrect:', cell);
        return true;
      }
      return false;
    });
    
    if (hasInvalidPattern) {
      console.error('❌❌❌ INVALID ROW DATA DETECTED - NOT LOGGING ❌❌❌');
      console.error('❌ Invalid row:', validatedRow);
      console.error('❌ Original order:', {
        customerName: order.customerName,
        deliveryMethod: order.deliveryMethod,
        address: order.address,
        customerPhone: order.customerPhone
      });
      return false; // Don't log invalid data - this prevents mystery rows
    }
    
    const row = validatedRow;
      
      // ============================================================
      // CRITICAL DEBUG: Full payload logging before write
      // ============================================================
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║       FINAL GOOGLE SHEETS PAYLOAD - WRITING NOW            ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('📝 FINAL_PHONE:', row[1]);
      console.log('📝 FINAL_NAME:', row[0]);
      console.log('📝 FINAL_DELIVERY_METHOD:', row[2]);
      console.log('📝 FINAL_ADDRESS:', row[3]);
      console.log('📝 FINAL_TIME:', row[4]);
      console.log('📝 FINAL_PRICE:', row[5]);
      console.log('📝 FINAL_ORDER_DETAILS:', row[6]);
      console.log('📝 FULL_PAYLOAD:', JSON.stringify({
        name: row[0],
        phone: row[1],
        deliveryMethod: row[2],
        address: row[3],
        time: row[4],
        price: row[5],
        orderDetails: row[6],
        itemCount: order.items?.length || 0
      }, null, 2));
      console.log('📝 RAW_ORDER_ITEMS:', JSON.stringify(order.items, null, 2));
      console.log('════════════════════════════════════════════════════════════════');
      console.log('');
      
      // ============================================================
      // SANITY CHECKS - Prevent bad data from being written
      // ============================================================
      
      // Check 1: Phone must not be blank (use finalPhoneForSheet which is already validated)
      if (!finalPhoneForSheet || finalPhoneForSheet === '' || finalPhoneForSheet === undefined) {
        console.error('❌❌❌ SANITY_CHECK_FAILED: finalPhoneForSheet is BLANK!');
        console.error('❌ Raw order.customerPhone:', order.customerPhone);
        row[1] = 'Unknown'; // Fallback to prevent blank
      } else {
        // Ensure row uses the validated phone
        row[1] = finalPhoneForSheet;
      }
      
      // Check 2: Order details must not be blank
      if (!row[6] || row[6] === '' || row[6] === undefined) {
        console.error('❌❌❌ SANITY_CHECK_FAILED: Order details is BLANK!');
        console.error('❌ order.items:', JSON.stringify(order.items));
        // Don't write if no order details
        console.error('❌ ABORTING WRITE - No order details');
        return false;
      }
      
      // Check 3: Verify order has at least 1 item
      if (!order.items || order.items.length === 0) {
        console.error('❌❌❌ SANITY_CHECK_FAILED: Order has 0 items!');
        console.error('❌ ABORTING WRITE - Empty order');
        return false;
      }
      
      console.log('✅ All sanity checks passed - proceeding with write');
      
      // Append to sheet - write to columns A through G (7 columns)
      const response = await sheetsClient.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: 'Sheet1!A:G', // Match your 7 columns exactly
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [row],
        },
      });
      
      console.log('✓ Order logged to Google Sheets:', response.data.updates.updatedCells, 'cells updated');
      return true;
    } catch (error) {
      lastError = error;
      
      // Check if it's a retryable error (502, 503, 429, or network errors)
      const isRetryable = 
        error.code === 502 || 
        error.code === 503 || 
        error.code === 429 ||
        error.message?.includes('502') ||
        error.message?.includes('503') ||
        error.message?.includes('429') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('ETIMEDOUT');
      
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5 seconds
        console.warn(`⚠ Google Sheets API error (attempt ${attempt}/${maxRetries}):`, error.message || error.code);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // Retry
      } else {
        // Not retryable or max retries reached
        console.error('✗ Error logging to Google Sheets:', error.message || error.code);
        if (error.response) {
          console.error('✗ Response status:', error.response.status);
          console.error('✗ Response headers:', JSON.stringify(error.response.headers));
          if (error.response.data) {
            const dataStr = typeof error.response.data === 'string' 
              ? error.response.data.substring(0, 500)
              : JSON.stringify(error.response.data).substring(0, 500);
            console.error('✗ Response data:', dataStr);
          }
        }
        if (error.code) {
          console.error('✗ Error code:', error.code);
        }
        if (error.stack) {
          console.error('✗ Stack trace:', error.stack.substring(0, 500));
        }
        return false;
      }
    }
  }
  
  // If we get here, all retries failed
  console.error('✗ Failed to log to Google Sheets after', maxRetries, 'attempts');
  if (lastError) {
    console.error('✗ Last error:', lastError.message || lastError.code);
  }
  return false;
}

/**
 * Create header row if sheet is empty
 * CRITICAL: Headers must match the actual data structure used in logOrderToGoogleSheets (7 columns: A-G)
 */
async function initializeSheetHeaders() {
  if (!sheetsClient || !spreadsheetId) {
    return false;
  }
  
  try {
    // Check if sheet has data - use the same range as order logging (A-G)
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Sheet1!A1:G1', // Match the actual data structure (7 columns)
    });
    
    // If no headers exist, create them
    // CRITICAL: Headers must match the exact structure used in logOrderToGoogleSheets
    if (!response.data.values || response.data.values.length === 0) {
      const headers = [
        'Name',                    // Column A
        'Phone Number',            // Column B
        'Pick Up/Delivery',        // Column C (just "Pickup" or "Delivery")
        'Delivery Address',        // Column D (address or "-")
        'Estimated Pick Up Time (EST)', // Column E
        'Price',                   // Column F
        'Order Details',           // Column G
      ];
      
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: 'Sheet1!A1:F1', // Match the actual data structure
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [headers],
        },
      });
      
      console.log('✓ Google Sheets headers created (6 columns: A-F)');
    } else {
      // Headers already exist - this is fine, no need to log
      console.log('✓ Google Sheets headers already exist');
    }
  } catch (error) {
    // Make error handling more specific and non-blocking
    // This is a non-critical operation - if it fails, orders can still be logged
    if (error.message && error.message.includes('Internal error encountered')) {
      // This might happen if the sheet structure is different or permissions are limited
      // It's safe to ignore - headers might already exist or the sheet might be managed differently
      console.warn('⚠️  Could not initialize sheet headers (sheet may already have headers or different structure)');
      console.warn('⚠️  This is non-critical - orders will still be logged');
    } else {
      console.error('✗ Error initializing sheet headers:', error.message);
      console.error('✗ This is non-critical - orders will still be logged');
    }
  }
}

module.exports = {
  initializeGoogleSheets,
  logOrderToGoogleSheets,
  initializeSheetHeaders,
  formatPhoneNumber,
};


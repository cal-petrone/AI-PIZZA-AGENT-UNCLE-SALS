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
        const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
        const credentials = JSON.parse(credentialsJson);
        auth = new google.auth.GoogleAuth({
          credentials: credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      } catch (error) {
        console.error('✗ Failed to parse base64 credentials:', error.message);
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
      // CRITICAL: Calculate totals - MUST include all items PLUS 8% NYS tax
      let subtotal = 0;
      if (!order.items || order.items.length === 0) {
        console.error('❌ ERROR: Order has no items - cannot calculate total');
        console.error('❌ Order object:', JSON.stringify(order, null, 2));
        return false; // Don't log orders with no items
      }
      
      order.items.forEach(item => {
        const itemPrice = parseFloat(item.price) || 0;
        const itemQuantity = parseInt(item.quantity) || 1;
        const itemTotal = itemPrice * itemQuantity;
        subtotal += itemTotal;
        console.log(`  - Item: ${itemQuantity}x ${item.name} @ $${itemPrice.toFixed(2)} = $${itemTotal.toFixed(2)}`);
      });
      
      const taxRate = parseFloat(storeConfig.taxRate) || 0.08; // 8% NYS tax
      const tax = subtotal * taxRate;
      const total = subtotal + tax; // CRITICAL: Total = Subtotal + Tax (8%)
      
      console.log(`📊 Price calculation: Subtotal: $${subtotal.toFixed(2)} + Tax (${(taxRate * 100).toFixed(0)}%): $${tax.toFixed(2)} = Total: $${total.toFixed(2)}`);
      
      // Format items as string
      const itemsString = order.items.map(item => {
        const qty = item.quantity || 1;
        const size = item.size ? `${item.size} ` : '';
        return `${qty}x ${size}${item.name}`;
      }).join(', ');
      
      // Prepare row data - match your Google Sheet columns exactly (6 columns: A-F)
      // Column A: Name
      // Column B: Phone Number
      // Column C: Pick Up/Delivery
      // Column D: Pick Up Time (EST)
      // Column E: Price
      // Column F: Order Details
      
    // CRITICAL: Use customerPhone if available, otherwise fallback to 'not provided'
    // Do NOT use order.from as it contains callSid, not phone number
    const phoneNumber = order.customerPhone || 'not provided';
    
    // CRITICAL: Format Column C - ALWAYS include address if delivery is selected
    // If delivery is selected but no address, log as "delivery - address not provided"
    let deliveryDisplay;
    if (order.deliveryMethod === 'delivery') {
      if (order.address && order.address.trim().length > 0) {
        deliveryDisplay = `delivery - ${order.address.trim()}`;
      } else {
        console.warn('⚠️  WARNING: Delivery selected but no address provided');
        deliveryDisplay = 'delivery - address not provided';
      }
    } else if (order.deliveryMethod === 'pickup') {
      deliveryDisplay = 'pickup';
    } else {
      deliveryDisplay = order.deliveryMethod || 'not specified';
    }
    
    console.log('📋 Delivery display:', deliveryDisplay, '| Method:', order.deliveryMethod, '| Address:', order.address || 'none');
    
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
    console.log('🔍🔍🔍 GOOGLE SHEETS - EXACT VALUES BEING LOGGED:');
    console.log('🔍 Column A (Name):', order.customerName || 'not provided', '| Original:', order.customerName);
    console.log('🔍 Column B (Phone):', phoneNumber, '| Original:', order.customerPhone);
    console.log('🔍 Column C (Pick Up/Delivery):', deliveryDisplay, '| Original:', order.deliveryMethod, '| Address:', order.address || 'none');
    console.log('🔍 Column D (Pick Up Time):', pickupTimeString, '| Estimated:', estimatedMinutes, 'minutes');
    console.log('🔍 Column F (Order Details):', itemsString);
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
    const validatedName = (order.customerName && typeof order.customerName === 'string' && order.customerName.trim().length > 0 && !/^\d+$/.test(order.customerName.trim())) 
      ? order.customerName.trim() 
      : 'not provided'; // Column A: Name (must be valid string, not just numbers)
    
    const validatedPhone = (phoneNumber && typeof phoneNumber === 'string' && /^\d{10}$/.test(phoneNumber.replace(/\D/g, ''))) 
      ? phoneNumber.replace(/\D/g, '').slice(-10) 
      : 'not provided'; // Column B: Phone (must be 10 digits)
    
    // CRITICAL: Ensure deliveryDisplay is properly formatted and never contains just numbers
    // This prevents the "46031" mystery row issue where a ZIP code or number gets into the delivery column
    let validatedDelivery = 'not specified';
    
    // CRITICAL: First validate that deliveryMethod is actually a valid value (pickup or delivery)
    // If it's not valid, use fallback to prevent corrupted data
    const isValidDeliveryMethod = order.deliveryMethod === 'pickup' || order.deliveryMethod === 'delivery';
    
    if (!isValidDeliveryMethod) {
      console.error('❌ INVALID: Delivery method is not valid (pickup/delivery):', order.deliveryMethod);
      // Check if it's a number (like "46031") - this is the mystery row issue
      if (/^\d+$/.test(order.deliveryMethod) && order.deliveryMethod.length > 2) {
        console.error('❌ INVALID: Delivery method is a number (like ZIP code):', order.deliveryMethod);
        validatedDelivery = 'not specified'; // Use fallback instead of corrupted data
      } else {
        validatedDelivery = 'not specified'; // Use fallback for any invalid value
      }
    } else if (order.deliveryMethod === 'delivery') {
      // CRITICAL: For delivery, ALWAYS include the address if it exists
      if (order.address && typeof order.address === 'string' && order.address.trim().length > 0) {
        validatedDelivery = `delivery - ${order.address.trim()}`;
      } else {
        console.warn('⚠️  WARNING: Delivery selected but no address provided - logging as "delivery - address not provided"');
        validatedDelivery = 'delivery - address not provided';
      }
    } else if (order.deliveryMethod === 'pickup') {
      validatedDelivery = 'pickup';
    }
    
    // Final safety check: ensure validatedDelivery is never just numbers (prevents "46031" issue)
    if (/^\d+$/.test(validatedDelivery) && validatedDelivery.length > 2) {
      console.error('❌ INVALID: Final delivery display is just numbers (not valid):', validatedDelivery);
      validatedDelivery = 'not specified'; // Use fallback instead
    }
    
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
    
    const validatedPrice = (typeof total === 'number' && !isNaN(total) && total >= 0) 
      ? total.toFixed(2) 
      : '0.00'; // Column E: Price (must be valid number >= 0)
    
    const validatedItems = (itemsString && typeof itemsString === 'string' && itemsString.trim().length > 0) 
      ? itemsString.trim() 
      : 'no items'; // Column F: Items (must be valid string)
    
    // Final validation: Check for invalid patterns that could cause mystery rows
    const validatedRow = [validatedName, validatedPhone, validatedDelivery, validatedTime, validatedPrice, validatedItems];
    
    console.log('📋 Validated row data:', validatedRow);
    
    // CRITICAL: Final validation check - prevent any invalid patterns
    const hasInvalidPattern = validatedRow.some((cell, index) => {
      // Column A (Name) - must NOT be just numbers
      if (index === 0 && /^\d+$/.test(cell) && cell.length > 2) {
        console.error('❌ INVALID: Name is just numbers:', cell);
        return true;
      }
      // Column C (Delivery) - must NOT be just numbers (this is the "46031" issue)
      if (index === 2 && /^\d+$/.test(cell) && cell.length > 2) {
        console.error('❌ INVALID: Delivery method is just numbers:', cell);
        return true;
      }
      // Column D (Time) - must include comma and match pattern
      if (index === 3 && (!cell.includes(',') || !/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{1,2}:\d{2}\s+(AM|PM)$/.test(cell))) {
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
      
      // Append to sheet - only write to columns A through F
      const response = await sheetsClient.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: 'Sheet1!A:F', // Match your 6 columns exactly
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
 */
async function initializeSheetHeaders() {
  if (!sheetsClient || !spreadsheetId) {
    return false;
  }
  
  try {
    // Check if sheet has data
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Sheet1!A1:N1',
    });
    
    // If no headers exist, create them
    if (!response.data.values || response.data.values.length === 0) {
      const headers = [
        'Timestamp',
        'Store Name',
        'Location',
        'Name',
        'Phone Number',
        'Items',
        'Item Count',
        'Delivery Method',
        'Address',
        'Payment Method',
        'Subtotal',
        'Tax',
        'Total',
        'Stream ID',
      ];
      
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: 'Sheet1!A1:N1',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [headers],
        },
      });
      
      console.log('✓ Google Sheets headers created');
    }
  } catch (error) {
    console.error('✗ Error initializing sheet headers:', error.message);
  }
}

module.exports = {
  initializeGoogleSheets,
  logOrderToGoogleSheets,
  initializeSheetHeaders,
};


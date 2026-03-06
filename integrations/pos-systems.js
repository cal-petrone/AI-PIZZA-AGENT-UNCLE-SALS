/**
 * POS System Integrations
 * Supports Square, Toast, and Clover POS systems via REST APIs
 * 
 * MENU ITEM MAPPING:
 * Menu items must be mapped to POS Item IDs in Google Sheets:
 * - Column F: Square Item ID
 * - Column G: Toast Item ID
 * - Column H: Clover Item ID
 * 
 * If a POS Item ID is missing, the system will create a custom item as fallback.
 * 
 * Setup Instructions:
 * 
 * SQUARE:
 * 1. Go to Square Developer Dashboard (https://developer.squareup.com/)
 * 2. Create an application
 * 3. Get your Access Token and Location ID
 * 4. Add to .env:
 *    - POS_SYSTEM=square
 *    - SQUARE_ACCESS_TOKEN=your-access-token
 *    - SQUARE_LOCATION_ID=your-location-id
 *    - SQUARE_ENVIRONMENT=sandbox (or production)
 * 
 * TOAST:
 * 1. Go to Toast API Portal
 * 2. Get your API credentials
 * 3. Add to .env:
 *    - POS_SYSTEM=toast
 *    - TOAST_API_KEY=your-api-key
 *    - TOAST_RESTAURANT_ID=your-restaurant-id
 * 
 * CLOVER:
 * 1. Go to Clover Developer Portal (https://dev.clover.com/)
 * 2. Create an application
 * 3. Get your API Token and Merchant ID
 * 4. Add to .env:
 *    - POS_SYSTEM=clover
 *    - CLOVER_API_TOKEN=your-api-token
 *    - CLOVER_MERCHANT_ID=your-merchant-id
 *    - CLOVER_ENVIRONMENT=production (or sandbox)
 */

const { Client, Environment } = require('squareup');

let squareClient = null;
let squareLocationId = null;

/**
 * Initialize Square POS client
 */
function initializeSquare() {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
  
  if (!accessToken || !locationId) {
    console.log('⚠ Square POS not configured - skipping initialization');
    return false;
  }
  
  try {
    squareClient = new Client({
      accessToken: accessToken,
      environment: environment === 'production' ? Environment.Production : Environment.Sandbox,
    });
    
    squareLocationId = locationId;
    console.log('✓ Square POS initialized');
    return true;
  } catch (error) {
    console.error('✗ Error initializing Square POS:', error.message);
    return false;
  }
}

/**
 * Create order in Square POS
 * @param {Object} order - Order object
 * @param {Object} storeConfig - Store configuration
 * @param {Object} menuCache - Menu cache with POS Item ID mappings
 */
async function createSquareOrder(order, storeConfig = {}, menuCache = null) {
  if (!squareClient || !squareLocationId) {
    console.log('⚠ Square POS not configured - skipping order creation');
    return false;
  }
  
  try {
    // Map menu items to Square catalog items using POS Item ID mappings
    const lineItems = order.items.map(item => {
      // Get Square Item ID from menu mapping
      const menuItem = menuCache?.menu?.[item.name.toLowerCase()];
      const squareItemId = menuItem?.squareItemId;
      
      if (!squareItemId) {
        console.warn(`⚠ No Square Item ID mapped for "${item.name}" - creating custom item`);
        // Fallback: create custom item (Square supports this)
        return {
          name: `${item.size || ''} ${item.name}`.trim(),
          quantity: (item.quantity || 1).toString(),
          basePriceMoney: {
            amount: Math.round((item.price || item.unitPrice || 0) * 100), // cents
            currency: 'USD',
          },
        };
      }
      
      // Use mapped Square Item ID
      console.log(`✓ Creating Square order item: "${item.name}" with catalogObjectId: ${squareItemId}`);
      return {
        catalogObjectId: squareItemId,  // Square's Item ID from mapping
        quantity: (item.quantity || 1).toString(),
      };
    });
    
    // Create order request
    const requestBody = {
      idempotencyKey: order.streamSid || `order-${Date.now()}`,
      order: {
        locationId: squareLocationId,
        lineItems: lineItems,
        // Add customer info if available
        ...(order.customerName ? { customerId: order.customerId } : {}),
      },
    };
    
    // Create order in Square
    const { result } = await squareClient.ordersApi.createOrder(requestBody);
    console.log('✓ Order created in Square:', result.order.id);
    return result.order.id;
  } catch (error) {
    console.error('✗ Error creating Square order:', error.message);
    console.error('✗ Error details:', error.errors || error);
    return false;
  }
}

/**
 * Create order in Toast POS
 * @param {Object} order - Order object
 * @param {Object} storeConfig - Store configuration
 * @param {Object} menuCache - Menu cache with POS Item ID mappings
 */
async function createToastOrder(order, storeConfig = {}, menuCache = null) {
  const apiKey = process.env.TOAST_API_KEY;
  const restaurantId = process.env.TOAST_RESTAURANT_ID;
  
  if (!apiKey || !restaurantId) {
    console.log('⚠ Toast POS not configured - skipping order creation');
    return false;
  }
  
  try {
    // Map menu items to Toast menu item IDs using POS Item ID mappings
    const items = order.items.map(item => {
      // Get Toast Item ID from menu mapping
      const menuItem = menuCache?.menu?.[item.name.toLowerCase()];
      const toastItemId = menuItem?.toastItemId;
      
      if (!toastItemId) {
        console.warn(`⚠ No Toast Item ID mapped for "${item.name}" - using name only`);
        // Fallback: use item name (Toast may require manual mapping)
        return {
          menuItemId: null,
          quantity: item.quantity || 1,
          name: `${item.size || ''} ${item.name}`.trim(),
        };
      }
      
      // Use mapped Toast Item ID
      console.log(`✓ Creating Toast order item: "${item.name}" with menuItemId: ${toastItemId}`);
      return {
        menuItemId: toastItemId,  // Toast's Menu Item ID from mapping
        quantity: item.quantity || 1,
        name: `${item.size || ''} ${item.name}`.trim(),
      };
    });
    
    // Toast API requires specific order format
    const orderData = {
      restaurantId: restaurantId,
      orderType: order.deliveryMethod === 'delivery' ? 'DELIVERY' : 'PICKUP',
      items: items,
      customer: {
        phone: order.customerPhone || order.from || '',
        name: order.customerName || '',
      },
      // Add delivery address if delivery
      ...(order.deliveryMethod === 'delivery' && order.address ? {
        deliveryAddress: order.address,
      } : {}),
    };
    
    // Toast API call (adjust endpoint and format per Toast API docs)
    const response = await fetch(`https://api.toasttab.com/v1/restaurants/${restaurantId}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✓ Order created in Toast:', result.orderId || result.id);
      return result.orderId || result.id;
    } else {
      const errorText = await response.text();
      console.error('✗ Toast API error:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error('✗ Error creating Toast order:', error.message);
    return false;
  }
}

/**
 * Create order in Clover POS
 * @param {Object} order - Order object
 * @param {Object} storeConfig - Store configuration
 * @param {Object} menuCache - Menu cache with POS Item ID mappings
 */
async function createCloverOrder(order, storeConfig = {}, menuCache = null) {
  const apiToken = process.env.CLOVER_API_TOKEN;
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const environment = process.env.CLOVER_ENVIRONMENT || 'production';
  
  if (!apiToken || !merchantId) {
    console.log('⚠ Clover POS not configured - skipping order creation');
    return false;
  }
  
  try {
    // Map menu items to Clover item IDs using POS Item ID mappings
    const lineItems = order.items.map(item => {
      // Get Clover Item ID from menu mapping
      const menuItem = menuCache?.menu?.[item.name.toLowerCase()];
      const cloverItemId = menuItem?.cloverItemId;
      
      if (!cloverItemId) {
        console.warn(`⚠ No Clover Item ID mapped for "${item.name}" - creating custom item`);
        // Fallback: create custom item
        return {
          name: `${item.size || ''} ${item.name}`.trim(),
          price: Math.round((item.price || item.unitPrice || 0) * 100), // cents
          quantity: item.quantity || 1,
        };
      }
      
      // Use mapped Clover Item ID
      console.log(`✓ Creating Clover order item: "${item.name}" with itemId: ${cloverItemId}`);
      return {
        id: cloverItemId,  // Clover's Item ID from mapping
        quantity: item.quantity || 1,
      };
    });
    
    // Clover API base URL
    const baseUrl = environment === 'sandbox' 
      ? 'https://sandbox.dev.clover.com'
      : 'https://api.clover.com';
    
    // Create order request
    const orderData = {
      merchant: merchantId,
      items: lineItems,
      currency: 'USD',
      ...(order.customerName ? { customer: { name: order.customerName } } : {}),
      ...(order.customerPhone ? { customer: { phone: order.customerPhone } } : {}),
      ...(order.deliveryMethod === 'delivery' && order.address ? {
        deliveryAddress: order.address
      } : {}),
    };
    
    // Clover API call
    const response = await fetch(`${baseUrl}/v3/merchants/${merchantId}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✓ Order created in Clover:', result.id);
      return result.id;
    } else {
      const errorText = await response.text();
      console.error('✗ Clover API error:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error('✗ Error creating Clover order:', error.message);
    return false;
  }
}

/**
 * Send order to configured POS system
 * @param {Object} order - Order object
 * @param {Object} storeConfig - Store configuration
 * @param {Object} menuCache - Menu cache with POS Item ID mappings
 */
async function sendOrderToPOS(order, storeConfig = {}, menuCache = null) {
  const posSystem = process.env.POS_SYSTEM || 'none'; // 'square', 'toast', 'clover', 'none'
  
  // Validation: Check if order has items
  if (!order || !order.items || order.items.length === 0) {
    console.warn('⚠ Cannot send to POS: Order has no items');
    return false;
  }
  
  // Validation: Check if menuCache is available
  if (!menuCache || !menuCache.menu) {
    console.warn('⚠ Menu cache not available - POS Item ID mappings may not work correctly');
  }
  
  // Debug: Log order summary
  console.log(`📤 Sending order to ${posSystem.toUpperCase()} POS:`, {
    itemCount: order.items.length,
    items: order.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
    deliveryMethod: order.deliveryMethod || 'not specified',
    customerName: order.customerName || 'not provided'
  });
  
  // Debug: Check POS Item ID mappings for each item
  if (menuCache && menuCache.menu) {
    order.items.forEach(item => {
      const menuItem = menuCache.menu[item.name.toLowerCase()];
      if (menuItem) {
        const hasSquareId = !!menuItem.squareItemId;
        const hasToastId = !!menuItem.toastItemId;
        const hasCloverId = !!menuItem.cloverItemId;
        if (!hasSquareId && !hasToastId && !hasCloverId) {
          console.warn(`⚠ No POS Item ID mapped for "${item.name}" - will create custom item`);
        } else {
          console.log(`✓ POS Item ID mapping found for "${item.name}":`, {
            square: hasSquareId ? menuItem.squareItemId : 'not mapped',
            toast: hasToastId ? menuItem.toastItemId : 'not mapped',
            clover: hasCloverId ? menuItem.cloverItemId : 'not mapped'
          });
        }
      } else {
        console.warn(`⚠ Menu item not found in cache for "${item.name}"`);
      }
    });
  }
  
  switch (posSystem.toLowerCase()) {
    case 'square':
      return await createSquareOrder(order, storeConfig, menuCache);
    case 'toast':
      return await createToastOrder(order, storeConfig, menuCache);
    case 'clover':
      return await createCloverOrder(order, storeConfig, menuCache);
    default:
      console.log('⚠ No POS system configured (POS_SYSTEM env var not set)');
      return false;
  }
}

/**
 * Initialize all POS systems
 */
function initializePOS() {
  initializeSquare();
  // Add other POS initializations here
}

module.exports = {
  initializePOS,
  sendOrderToPOS,
  createSquareOrder,
  createToastOrder,
  createCloverOrder,
};






/**
 * POS System Integrations
 * Supports Square, Toast, and other POS systems via REST APIs
 * 
 * Setup Instructions:
 * 
 * SQUARE:
 * 1. Go to Square Developer Dashboard (https://developer.squareup.com/)
 * 2. Create an application
 * 3. Get your Access Token and Location ID
 * 4. Add to .env:
 *    - SQUARE_ACCESS_TOKEN=your-access-token
 *    - SQUARE_LOCATION_ID=your-location-id
 *    - SQUARE_ENVIRONMENT=sandbox (or production)
 * 
 * TOAST:
 * 1. Go to Toast API Portal
 * 2. Get your API credentials
 * 3. Add to .env:
 *    - TOAST_API_KEY=your-api-key
 *    - TOAST_RESTAURANT_ID=your-restaurant-id
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
 */
async function createSquareOrder(order, storeConfig = {}) {
  if (!squareClient || !squareLocationId) {
    console.log('⚠ Square POS not configured - skipping order creation');
    return false;
  }
  
  try {
    // Map menu items to Square catalog items
    // You'll need to map your menu items to Square item IDs
    const lineItems = order.items.map(item => {
      // TODO: Map your menu items to Square catalog item IDs
      // This requires setting up your Square catalog first
      return {
        name: `${item.size || ''} ${item.name}`.trim(),
        quantity: (item.quantity || 1).toString(),
        // basePriceMoney: {
        //   amount: Math.round(item.price * 100), // Square uses cents
        //   currency: 'USD',
        // },
      };
    });
    
    // Create order request
    const requestBody = {
      idempotencyKey: order.streamSid || `order-${Date.now()}`,
      order: {
        locationId: squareLocationId,
        lineItems: lineItems,
        // Add customer info if available
        // customerId: order.customerId,
      },
    };
    
    // For now, we'll just log the order structure
    // Uncomment below when you have Square catalog set up
    /*
    const { result } = await squareClient.ordersApi.createOrder(requestBody);
    console.log('✓ Order created in Square:', result.order.id);
    return result.order.id;
    */
    
    console.log('⚠ Square order creation requires catalog setup. Order data:', JSON.stringify(requestBody, null, 2));
    return false;
  } catch (error) {
    console.error('✗ Error creating Square order:', error.message);
    return false;
  }
}

/**
 * Create order in Toast POS
 * @param {Object} order - Order object
 * @param {Object} storeConfig - Store configuration
 */
async function createToastOrder(order, storeConfig = {}) {
  const apiKey = process.env.TOAST_API_KEY;
  const restaurantId = process.env.TOAST_RESTAURANT_ID;
  
  if (!apiKey || !restaurantId) {
    console.log('⚠ Toast POS not configured - skipping order creation');
    return false;
  }
  
  try {
    // Toast API requires specific order format
    // This is a basic structure - adjust based on Toast API docs
    const orderData = {
      restaurantId: restaurantId,
      orderType: order.deliveryMethod === 'delivery' ? 'DELIVERY' : 'PICKUP',
      items: order.items.map(item => ({
        // TODO: Map to Toast menu item IDs
        menuItemId: item.toastMenuItemId || null,
        quantity: item.quantity || 1,
        name: `${item.size || ''} ${item.name}`.trim(),
      })),
      customer: {
        phone: order.from || '',
      },
      // Add delivery address if delivery
      ...(order.deliveryMethod === 'delivery' && order.address ? {
        deliveryAddress: order.address,
      } : {}),
    };
    
    // Toast API call (example - adjust endpoint and format per Toast docs)
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
      console.log('✓ Order created in Toast:', result.orderId);
      return result.orderId;
    } else {
      console.error('✗ Toast API error:', await response.text());
      return false;
    }
  } catch (error) {
    console.error('✗ Error creating Toast order:', error.message);
    return false;
  }
}

/**
 * Send order to configured POS system
 * @param {Object} order - Order object
 * @param {Object} storeConfig - Store configuration
 */
async function sendOrderToPOS(order, storeConfig = {}) {
  const posSystem = process.env.POS_SYSTEM || 'none'; // 'square', 'toast', 'none'
  
  switch (posSystem.toLowerCase()) {
    case 'square':
      return await createSquareOrder(order, storeConfig);
    case 'toast':
      return await createToastOrder(order, storeConfig);
    default:
      console.log('⚠ No POS system configured');
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
};






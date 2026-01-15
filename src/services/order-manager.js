/**
 * Order Manager Service
 * Manages order state, calculations, and validation
 */

const { getMenu, findMenuItem, getPrice } = require('../config/menu');

class OrderManager {
  constructor(streamSid, callSid, fromNumber) {
    this.streamSid = streamSid;
    this.callSid = callSid;
    this.fromNumber = fromNumber;
    this.order = this.createEmptyOrder();
  }
  
  createEmptyOrder() {
    return {
      streamSid: this.streamSid,
      callSid: this.callSid,
      from: this.fromNumber,
      items: [],
      deliveryMethod: null, // 'pickup' or 'delivery'
      address: null,
      customerName: null,
      customerPhone: this.fromNumber,
      paymentMethod: null,
      confirmed: false,
      logged: false,
      timestamp: new Date().toISOString(),
      subtotal: 0,
      tax: 0,
      total: 0
    };
  }
  
  /**
   * Add item to order
   */
  addItem(itemName, size = 'regular', quantity = 1, specialInstructions = null) {
    const found = findMenuItem(itemName);
    
    if (!found) {
      throw new Error(`Menu item not found: ${itemName}`);
    }
    
    const price = getPrice(itemName, size);
    if (price === null) {
      throw new Error(`Price not found for ${itemName} (size: ${size})`);
    }
    
    // Check if item already exists with same size
    const existingIndex = this.order.items.findIndex(
      item => item.name.toLowerCase() === found.name.toLowerCase() && 
              (item.size || 'regular') === (size || 'regular')
    );
    
    if (existingIndex >= 0) {
      // Update quantity of existing item
      this.order.items[existingIndex].quantity += quantity;
    } else {
      // Add new item
      this.order.items.push({
        name: found.name,
        size: size || 'regular',
        quantity: quantity,
        price: price,
        specialInstructions: specialInstructions
      });
    }
    
    this.recalculateTotals();
    return this.order;
  }
  
  /**
   * Set delivery method
   */
  setDeliveryMethod(method) {
    if (method !== 'pickup' && method !== 'delivery') {
      throw new Error(`Invalid delivery method: ${method}. Must be 'pickup' or 'delivery'`);
    }
    this.order.deliveryMethod = method;
    return this.order;
  }
  
  /**
   * Set delivery address
   */
  setAddress(address) {
    if (!address || address.trim().length === 0) {
      throw new Error('Address cannot be empty');
    }
    this.order.address = address.trim();
    return this.order;
  }
  
  /**
   * Set customer name
   */
  setCustomerName(name) {
    if (!name || name.trim().length === 0) {
      throw new Error('Customer name cannot be empty');
    }
    this.order.customerName = name.trim();
    return this.order;
  }
  
  /**
   * Set customer phone
   */
  setCustomerPhone(phone) {
    this.order.customerPhone = phone || this.fromNumber;
    return this.order;
  }
  
  /**
   * Set payment method
   */
  setPaymentMethod(method) {
    const validMethods = ['cash', 'card', 'credit', 'debit'];
    const lowerMethod = method.toLowerCase();
    
    if (!validMethods.some(m => lowerMethod.includes(m))) {
      throw new Error(`Invalid payment method: ${method}`);
    }
    
    // Normalize to cash or card
    this.order.paymentMethod = lowerMethod.includes('cash') ? 'cash' : 'card';
    return this.order;
  }
  
  /**
   * Confirm order
   */
  confirm() {
    if (this.order.items.length === 0) {
      throw new Error('Cannot confirm order with no items');
    }
    
    if (!this.order.customerName) {
      throw new Error('Cannot confirm order without customer name');
    }
    
    this.order.confirmed = true;
    return this.order;
  }
  
  /**
   * Recalculate order totals
   */
  recalculateTotals(taxRate = 0.08) {
    let subtotal = 0;
    
    this.order.items.forEach(item => {
      subtotal += (item.price || 0) * (item.quantity || 1);
    });
    
    const tax = subtotal * taxRate;
    const total = subtotal + tax;
    
    this.order.subtotal = parseFloat(subtotal.toFixed(2));
    this.order.tax = parseFloat(tax.toFixed(2));
    this.order.total = parseFloat(total.toFixed(2));
    
    return {
      subtotal: this.order.subtotal,
      tax: this.order.tax,
      total: this.order.total
    };
  }
  
  /**
   * Get order summary as text
   */
  getSummary() {
    if (this.order.items.length === 0) {
      return 'No items in order yet.';
    }
    
    const items = this.order.items.map(item => {
      const qty = item.quantity || 1;
      const size = item.size ? ` ${item.size}` : '';
      return `${qty}x${size} ${item.name}`;
    }).join(', ');
    
    return items;
  }
  
  /**
   * Get full order summary with totals
   */
  getFullSummary() {
    const items = this.order.items.map(item => {
      const qty = item.quantity || 1;
      const size = item.size ? ` ${item.size}` : '';
      const itemTotal = (item.price || 0) * qty;
      return `${qty}x${size} ${item.name} - $${itemTotal.toFixed(2)}`;
    }).join('\n');
    
    return `Order Summary:
${items}

Subtotal: $${this.order.subtotal.toFixed(2)}
Tax: $${this.order.tax.toFixed(2)}
Total: $${this.order.total.toFixed(2)}

Delivery Method: ${this.order.deliveryMethod || 'Not specified'}
${this.order.address ? `Address: ${this.order.address}` : ''}
Customer: ${this.order.customerName || 'Not provided'}
Payment: ${this.order.paymentMethod || 'Not specified'}`;
  }
  
  /**
   * Mark order as logged
   */
  markAsLogged() {
    this.order.logged = true;
    return this.order;
  }
  
  /**
   * Get order for logging (sanitized, ready for Zapier)
   */
  getOrderForLogging() {
    return {
      callSid: this.order.callSid,
      streamSid: this.order.streamSid,
      timestamp: this.order.timestamp,
      from: this.order.from,
      customerName: this.order.customerName,
      customerPhone: this.order.customerPhone,
      items: this.order.items.map(item => ({
        name: item.name,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        itemTotal: (item.price || 0) * (item.quantity || 1),
        specialInstructions: item.specialInstructions
      })),
      deliveryMethod: this.order.deliveryMethod,
      address: this.order.address,
      paymentMethod: this.order.paymentMethod,
      subtotal: this.order.subtotal,
      tax: this.order.tax,
      total: this.order.total,
      status: this.order.confirmed ? 'completed' : 'pending',
      itemsSummary: this.getSummary()
    };
  }
  
  /**
   * Get current order state
   */
  getOrder() {
    return this.order;
  }
  
  /**
   * Check if order is ready to be logged
   */
  isReadyToLog() {
    return (
      this.order.confirmed &&
      this.order.items.length > 0 &&
      this.order.customerName &&
      !this.order.logged
    );
  }
}

module.exports = OrderManager;






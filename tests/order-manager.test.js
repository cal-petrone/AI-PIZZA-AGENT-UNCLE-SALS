/**
 * Order Manager Tests
 * Tests for order state management and calculations
 */

const OrderManager = require('../src/services/order-manager');

describe('OrderManager', () => {
  let orderManager;
  
  beforeEach(() => {
    orderManager = new OrderManager('test-stream-123', 'test-call-456', '+1234567890');
  });
  
  test('should create empty order', () => {
    const order = orderManager.getOrder();
    expect(order.items).toEqual([]);
    expect(order.confirmed).toBe(false);
    expect(order.logged).toBe(false);
    expect(order.streamSid).toBe('test-stream-123');
    expect(order.callSid).toBe('test-call-456');
  });
  
  test('should add item to order', () => {
    orderManager.addItem('pepperoni pizza', 'large', 2);
    const order = orderManager.getOrder();
    
    expect(order.items.length).toBe(1);
    expect(order.items[0].name).toBe('pepperoni pizza');
    expect(order.items[0].size).toBe('large');
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0].price).toBe(20.99);
  });
  
  test('should update quantity for duplicate items', () => {
    orderManager.addItem('cheese pizza', 'medium', 1);
    orderManager.addItem('cheese pizza', 'medium', 2);
    const order = orderManager.getOrder();
    
    expect(order.items.length).toBe(1);
    expect(order.items[0].quantity).toBe(3);
  });
  
  test('should calculate totals correctly', () => {
    orderManager.addItem('pepperoni pizza', 'large', 1); // $20.99
    orderManager.addItem('garlic knots', 'regular', 2); // $6.99 * 2 = $13.98
    
    const totals = orderManager.recalculateTotals(0.08); // 8% tax
    
    const subtotal = 20.99 + 13.98; // $34.97
    const tax = subtotal * 0.08; // $2.80
    const total = subtotal + tax; // $37.77
    
    expect(orderManager.getOrder().subtotal).toBeCloseTo(subtotal, 2);
    expect(orderManager.getOrder().tax).toBeCloseTo(tax, 2);
    expect(orderManager.getOrder().total).toBeCloseTo(total, 2);
  });
  
  test('should set delivery method', () => {
    orderManager.setDeliveryMethod('delivery');
    expect(orderManager.getOrder().deliveryMethod).toBe('delivery');
    
    orderManager.setDeliveryMethod('pickup');
    expect(orderManager.getOrder().deliveryMethod).toBe('pickup');
  });
  
  test('should reject invalid delivery method', () => {
    expect(() => {
      orderManager.setDeliveryMethod('invalid');
    }).toThrow();
  });
  
  test('should set address', () => {
    orderManager.setAddress('123 Main St, Syracuse, NY 13201');
    expect(orderManager.getOrder().address).toBe('123 Main St, Syracuse, NY 13201');
  });
  
  test('should set customer name', () => {
    orderManager.setCustomerName('John Doe');
    expect(orderManager.getOrder().customerName).toBe('John Doe');
  });
  
  test('should reject empty customer name', () => {
    expect(() => {
      orderManager.setCustomerName('');
    }).toThrow();
  });
  
  test('should confirm order', () => {
    orderManager.addItem('cheese pizza', 'large', 1);
    orderManager.setCustomerName('John Doe');
    orderManager.confirm();
    
    expect(orderManager.getOrder().confirmed).toBe(true);
  });
  
  test('should reject confirming empty order', () => {
    expect(() => {
      orderManager.confirm();
    }).toThrow();
  });
  
  test('should reject confirming without customer name', () => {
    orderManager.addItem('cheese pizza', 'large', 1);
    expect(() => {
      orderManager.confirm();
    }).toThrow();
  });
  
  test('should check if ready to log', () => {
    expect(orderManager.isReadyToLog()).toBe(false);
    
    orderManager.addItem('cheese pizza', 'large', 1);
    expect(orderManager.isReadyToLog()).toBe(false);
    
    orderManager.setCustomerName('John Doe');
    expect(orderManager.isReadyToLog()).toBe(false);
    
    orderManager.confirm();
    expect(orderManager.isReadyToLog()).toBe(true);
    
    orderManager.markAsLogged();
    expect(orderManager.isReadyToLog()).toBe(false);
  });
  
  test('should generate order summary', () => {
    orderManager.addItem('pepperoni pizza', 'large', 2);
    orderManager.addItem('garlic knots', 'regular', 1);
    
    const summary = orderManager.getSummary();
    expect(summary).toContain('pepperoni pizza');
    expect(summary).toContain('garlic knots');
  });
  
  test('should generate order for logging', () => {
    orderManager.addItem('cheese pizza', 'large', 1);
    orderManager.setDeliveryMethod('delivery');
    orderManager.setAddress('123 Main St');
    orderManager.setCustomerName('John Doe');
    orderManager.setPaymentMethod('card');
    orderManager.confirm();
    
    const logData = orderManager.getOrderForLogging();
    
    expect(logData.callSid).toBe('test-call-456');
    expect(logData.customerName).toBe('John Doe');
    expect(logData.deliveryMethod).toBe('delivery');
    expect(logData.status).toBe('completed');
    expect(logData.items.length).toBe(1);
  });
});






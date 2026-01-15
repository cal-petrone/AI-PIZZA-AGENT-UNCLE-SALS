/**
 * Menu Configuration Tests
 */

const { findMenuItem, getPrice, getMenu } = require('../src/config/menu');

describe('Menu Configuration', () => {
  test('should find menu item by exact name', () => {
    const result = findMenuItem('cheese pizza');
    expect(result).not.toBeNull();
    expect(result.name).toBe('cheese pizza');
  });
  
  test('should find menu item case-insensitively', () => {
    const result = findMenuItem('CHEESE PIZZA');
    expect(result).not.toBeNull();
    expect(result.name).toBe('cheese pizza');
  });
  
  test('should find menu item with fuzzy matching', () => {
    const result = findMenuItem('pepperoni');
    expect(result).not.toBeNull();
    expect(result.name).toBe('pepperoni pizza');
  });
  
  test('should return null for non-existent item', () => {
    const result = findMenuItem('pizza that does not exist');
    expect(result).toBeNull();
  });
  
  test('should get price for item and size', () => {
    const price = getPrice('pepperoni pizza', 'large');
    expect(price).toBe(20.99);
  });
  
  test('should get default price if size not specified', () => {
    const price = getPrice('garlic knots');
    expect(price).toBe(6.99);
  });
  
  test('should return null for invalid item', () => {
    const price = getPrice('invalid item');
    expect(price).toBeNull();
  });
  
  test('should return menu object', () => {
    const menu = getMenu();
    expect(menu).toHaveProperty('cheese pizza');
    expect(menu).toHaveProperty('pepperoni pizza');
    expect(menu).toHaveProperty('garlic knots');
  });
});






/**
 * Menu Configuration
 * Centralized menu data structure for the pizza shop
 */

const menu = {
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
    priceMap: { regular: 12.99 }
  },
  'pepperoni calzone': {
    sizes: ['regular'],
    priceMap: { regular: 14.99 }
  },
  'garlic bread': {
    sizes: ['regular'],
    priceMap: { regular: 5.99 }
  },
  'garlic knots': {
    sizes: ['regular'],
    priceMap: { regular: 6.99 }
  },
  'mozzarella sticks': {
    sizes: ['regular'],
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
    priceMap: { regular: 2.99 }
  },
  'water': {
    sizes: ['regular'],
    priceMap: { regular: 1.99 }
  }
};

/**
 * Get menu as structured object
 */
function getMenu() {
  return menu;
}

/**
 * Get menu as formatted text for AI prompts
 */
function getMenuText() {
  const lines = [];
  lines.push('PIZZA:');
  ['cheese pizza', 'pepperoni pizza', 'margherita pizza', 'white pizza', 'supreme pizza', 'veggie pizza'].forEach(name => {
    const item = menu[name];
    const sizes = item.sizes.join(', ');
    const prices = item.sizes.map(s => `${s} $${item.priceMap[s].toFixed(2)}`).join(', ');
    lines.push(`- ${name} (sizes: ${sizes}) - ${prices}`);
  });
  
  lines.push('\nCALZONE:');
  ['calzone', 'pepperoni calzone'].forEach(name => {
    const item = menu[name];
    lines.push(`- ${name} (regular) - $${item.priceMap.regular.toFixed(2)}`);
  });
  
  lines.push('\nSIDES:');
  ['garlic bread', 'garlic knots', 'mozzarella sticks'].forEach(name => {
    const item = menu[name];
    lines.push(`- ${name} (regular) - $${item.priceMap.regular.toFixed(2)}`);
  });
  const fries = menu['french fries'];
  lines.push(`- french fries (sizes: regular, large) - regular $${fries.priceMap.regular.toFixed(2)}, large $${fries.priceMap.large.toFixed(2)}`);
  const salad = menu['salad'];
  lines.push(`- salad (sizes: small, large) - small $${salad.priceMap.small.toFixed(2)}, large $${salad.priceMap.large.toFixed(2)}`);
  
  lines.push('\nDRINKS:');
  ['soda', 'water'].forEach(name => {
    const item = menu[name];
    lines.push(`- ${name} (regular) - $${item.priceMap.regular.toFixed(2)}`);
  });
  
  return lines.join('\n');
}

/**
 * Find menu item by name (case-insensitive, fuzzy matching)
 */
function findMenuItem(itemName) {
  if (!itemName) return null;
  
  const lowerName = itemName.toLowerCase().trim();
  
  // Exact match
  if (menu[lowerName]) {
    return { name: lowerName, data: menu[lowerName] };
  }
  
  // Case-insensitive match
  for (const menuItem in menu) {
    if (menuItem.toLowerCase() === lowerName) {
      return { name: menuItem, data: menu[menuItem] };
    }
  }
  
  // Fuzzy match - check if all words in item name are in menu item
  const words = lowerName.split(/\s+/);
  for (const menuItem in menu) {
    const menuWords = menuItem.toLowerCase().split(/\s+/);
    if (words.every(word => menuWords.some(mw => mw.includes(word) || word.includes(mw)))) {
      return { name: menuItem, data: menu[menuItem] };
    }
  }
  
  return null;
}

/**
 * Get price for a menu item
 */
function getPrice(itemName, size = 'regular') {
  const found = findMenuItem(itemName);
  if (!found) return null;
  
  const priceMap = found.data.priceMap;
  if (priceMap[size]) {
    return priceMap[size];
  }
  
  // If size not found, return first available price
  const sizes = Object.keys(priceMap);
  if (sizes.length > 0) {
    return priceMap[sizes[0]];
  }
  
  return null;
}

module.exports = {
  getMenu,
  getMenuText,
  findMenuItem,
  getPrice
};






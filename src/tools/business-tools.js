/**
 * Shared business logic for menu, pricing, and order logging.
 * Used by both default (OpenAI Realtime) and PersonaPlex engines.
 * Zero schema changes; calls existing Google Sheets services exactly as today.
 */

const googleSheets = require('../../integrations/google-sheets');

/**
 * Lookup menu items by category or search term (same behavior as getMenuItemsOnDemand).
 * @param {Object} menu - Parsed menu object { itemName: { sizes, priceMap, description } }
 * @param {string} [searchTerm] - Optional search/filter
 * @returns {string} Formatted menu snippet for prompts
 */
function lookupMenuItems(menu, searchTerm = null) {
  if (!menu || typeof menu !== 'object') return '';
  const items = [];
  const searchLower = searchTerm?.toLowerCase() || '';
  for (const [name, data] of Object.entries(menu)) {
    if (searchTerm) {
      const isMatch =
        name.toLowerCase().includes(searchLower) ||
        searchLower.includes(name.toLowerCase().split(' ')[0]) ||
        (searchLower.includes('pizza') && name.includes('pizza')) ||
        (searchLower.includes('wing') && name.includes('wing')) ||
        (searchLower.includes('calzone') && name.includes('calzone')) ||
        (searchLower.includes('drink') && ['soda', 'water'].includes(name)) ||
        (searchLower.includes('side') && ['garlic', 'fries', 'salad', 'mozzarella'].some(s => name.includes(s)));
      if (!isMatch) continue;
    }
    const sizes = data.sizes ? data.sizes.join('/') : '';
    const desc = data.description ? ` - ${data.description}` : '';
    items.push(`${name}${sizes ? ` (${sizes})` : ''}${desc}`);
  }
  return items.length > 0 ? items.join('\n') : '';
}

/**
 * Get wing options for display (piece counts, flavors from Wing_Options).
 * @param {Object} wingOptions - From menuData.wingOptions { pieceCounts: [], flavors: [], dressings: [] }
 * @returns {{ pieceCounts: string[], flavors: string[], dressings: string[] }}
 */
function getWingOptions(wingOptions) {
  if (!wingOptions || typeof wingOptions !== 'object') return { pieceCounts: [], flavors: [], dressings: [] };
  const pieceCounts = (wingOptions.pieceCounts || []).map(p => (p && p.name) || String(p?.pieceCount ?? '')).filter(Boolean);
  const flavors = (wingOptions.flavors || []).map(f => (f && f.name) || f).filter(Boolean);
  const dressings = (wingOptions.dressings || []).map(d => (d && d.name) || d).filter(Boolean);
  return { pieceCounts, flavors, dressings };
}

/**
 * Calculate order totals (single source of truth; same as Sheets).
 * @param {Array} items - Order items with unitPrice/price and quantity
 * @param {number} [taxRate] - Default 0.08
 * @returns {{ subtotal, tax, total }}
 */
function calculatePrice(items, taxRate = 0.08) {
  return googleSheets.calculateOrderTotals(items || [], taxRate);
}

/**
 * Log order to Google Sheets (same schema; no changes).
 * @param {Object} order - Order with items, customerName, customerPhone, deliveryMethod, address, etc.
 * @param {Object} storeConfig - Store config (name, location, taxRate)
 * @returns {Promise<boolean>}
 */
async function logOrderToGoogleSheet(order, storeConfig = {}) {
  return googleSheets.logOrderToGoogleSheets(order, storeConfig);
}

module.exports = {
  lookupMenuItems,
  getWingOptions,
  calculatePrice,
  logOrderToGoogleSheet,
};

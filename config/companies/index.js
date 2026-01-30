/**
 * Multi-tenant company configuration.
 * Company-agnostic: no hardcoded brand names in logic; all behavior from config + persona.
 */

const path = require('path');
const fs = require('fs');

const COMPANIES_DIR = path.join(__dirname);
const DEFAULT_CLIENT_SLUG = process.env.DEFAULT_CLIENT_SLUG || 'uncle_sals';

let _companies = null;
let _phoneToCompany = null;

function loadCompanies() {
  if (_companies) return _companies;
  _companies = {};
  _phoneToCompany = {};
  try {
    const dirs = fs.readdirSync(COMPANIES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules');
    for (const d of dirs) {
      const configPath = path.join(COMPANIES_DIR, d.name, 'config.json');
      const personaPath = path.join(COMPANIES_DIR, d.name, 'persona.json');
      if (!fs.existsSync(configPath)) continue;
      let config = {};
      let persona = {};
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {
        console.warn(`[companies] Invalid config ${configPath}:`, e.message);
        continue;
      }
      if (fs.existsSync(personaPath)) {
        try {
          persona = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
        } catch (e) {
          console.warn(`[companies] Invalid persona ${personaPath}:`, e.message);
        }
      }
      const companyId = config.company_id || d.name;
      _companies[companyId] = {
        company_id: companyId,
        name: config.name || companyId,
        location: config.location || '',
        taxRate: typeof config.taxRate === 'number' ? config.taxRate : 0.08,
        personaPath: config.personaPath || `${companyId}/persona.json`,
        persona,
        conversation_engine: config.conversation_engine ?? null,
        phoneNumbers: Array.isArray(config.phoneNumbers) ? config.phoneNumbers : [],
      };
      (_companies[companyId].phoneNumbers || []).forEach(phone => {
        const normalized = String(phone).replace(/\D/g, '');
        if (normalized) _phoneToCompany[normalized] = companyId;
      });
    }
  } catch (e) {
    console.warn('[companies] loadCompanies error:', e.message);
  }
  if (Object.keys(_companies).length === 0) {
    _companies[DEFAULT_CLIENT_SLUG] = {
      company_id: DEFAULT_CLIENT_SLUG,
      name: process.env.STORE_NAME || "Uncle Sal's Pizza",
      location: process.env.STORE_LOCATION || 'Syracuse, NY',
      taxRate: parseFloat(process.env.TAX_RATE) || 0.08,
      personaPath: `${DEFAULT_CLIENT_SLUG}/persona.json`,
      persona: {},
      conversation_engine: null,
      phoneNumbers: [],
    };
  }
  return _companies;
}

/**
 * Resolve store config from called phone number (or env default).
 * @param {string} calledNumber - Twilio "To" or calledNumber query param
 * @returns {Object} { company_id, name, location, taxRate, persona, conversation_engine, ... }
 */
function getStoreConfig(calledNumber) {
  const companies = loadCompanies();
  const defaultSlug = process.env.DEFAULT_CLIENT_SLUG || DEFAULT_CLIENT_SLUG;
  const defaultConfig = companies[defaultSlug] || Object.values(companies)[0];
  if (!defaultConfig) {
    return {
      company_id: 'default',
      name: process.env.STORE_NAME || "Uncle Sal's Pizza",
      location: process.env.STORE_LOCATION || 'Syracuse, NY',
      taxRate: parseFloat(process.env.TAX_RATE) || 0.08,
      persona: {},
      conversation_engine: null,
      phoneNumbers: [],
    };
  }
  if (!calledNumber || typeof calledNumber !== 'string') {
    return defaultConfig;
  }
  const normalized = String(calledNumber).replace(/\D/g, '');
  const companyId = _phoneToCompany[normalized] || defaultSlug;
  return companies[companyId] || defaultConfig;
}

function getCompanyById(companyId) {
  const companies = loadCompanies();
  return companies[companyId] || null;
}

function listCompanies() {
  return Object.keys(loadCompanies());
}

module.exports = {
  getStoreConfig,
  getCompanyById,
  listCompanies,
  loadCompanies,
};

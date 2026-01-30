/**
 * Conversation engine selection: default (OpenAI Realtime) or personaplex (gateway with fallback).
 * Company-agnostic; per-company override via config.conversation_engine.
 */

const { getStoreConfig } = require('../../config/companies');
const { PersonaPlexConversationEngine } = require('./engines/personaplex');

const ENV_ENGINE = (process.env.CONVERSATION_ENGINE || 'default').toLowerCase();

/**
 * Resolve which conversation engine to use for this company.
 * @param {Object} storeConfig - from getStoreConfig(calledNumber)
 * @returns {'default'|'personaplex'}
 */
function getConversationEngineName(storeConfig) {
  const perCompany = storeConfig?.conversation_engine;
  if (perCompany && typeof perCompany === 'string') {
    const name = perCompany.toLowerCase();
    if (name === 'personaplex' || name === 'default') return name;
  }
  return ENV_ENGINE === 'personaplex' ? 'personaplex' : 'default';
}

/**
 * Create PersonaPlex engine with fallback to connectToOpenAI.
 * @param {Function} connectToOpenAIFn - (sessionId, order) => Promise<void>
 * @returns {PersonaPlexConversationEngine}
 */
function createPersonaPlexEngine(connectToOpenAIFn) {
  return new PersonaPlexConversationEngine({
    gatewayUrl: process.env.PERSONAPLEX_GATEWAY_URL,
    timeoutMs: parseInt(process.env.PERSONAPLEX_GATEWAY_TIMEOUT_MS || '8000', 10),
    fallbackRun: connectToOpenAIFn,
  });
}

module.exports = {
  getConversationEngineName,
  createPersonaPlexEngine,
  getStoreConfig,
};

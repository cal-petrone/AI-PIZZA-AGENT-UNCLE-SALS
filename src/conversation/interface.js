/**
 * Pluggable conversation engine interface.
 * Both Default (OpenAI Realtime) and PersonaPlex use the same contract.
 * Company-agnostic: engine receives company context at runtime.
 */

/**
 * @typedef {Object} CompanyContext
 * @property {string} company_id
 * @property {string} name
 * @property {string} [location]
 * @property {number} [taxRate]
 * @property {Object} [persona]
 * @property {string|null} [conversation_engine]
 */

/**
 * @typedef {Object} SessionMetadata
 * @property {Object} [menuData] - menu, menuText, wingOptions, etc.
 * @property {Function} [onAudio] - (base64Chunk) => void
 * @property {Object} [activeOrders] - Map-like for order state
 * @property {Object} [callbacks] - engine-specific
 */

/**
 * IConversationEngine — pluggable conversation layer above business logic.
 * @interface
 */
class IConversationEngine {
  /**
   * Start a conversation session (streaming or turn-based).
   * @param {string} sessionId - streamSid or call identifier
   * @param {Object} order - current order state
   * @param {CompanyContext} companyContext - company config + persona
   * @param {SessionMetadata} metadata - menuData, callbacks, etc.
   * @returns {Promise<void>}
   */
  async startSession(sessionId, order, companyContext, metadata) {
    throw new Error('startSession not implemented');
  }

  /**
   * Handle user turn (text or audio). Optional for streaming engines that consume stream directly.
   * @param {string} sessionId
   * @param {string|Buffer} input - transcript or audio chunk
   * @param {Object} context - order, menu, etc.
   */
  handleUserTurn(sessionId, input, context) {}

  /**
   * Get next response (text or audio). Optional for streaming engines that push via callback.
   * @param {string} sessionId
   * @returns {Promise<{ text?: string, audio?: string }>}
   */
  async getResponse(sessionId) {
    return {};
  }

  /**
   * End session and release resources.
   * @param {string} sessionId
   */
  endSession(sessionId) {}
}

module.exports = { IConversationEngine };

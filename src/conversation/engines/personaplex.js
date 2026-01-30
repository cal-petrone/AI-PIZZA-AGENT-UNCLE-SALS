/**
 * PersonaPlex conversation engine: adapter to external PersonaPlex gateway.
 * On any failure, timeout, or if disabled, falls back to Default (OpenAI Realtime).
 * Company-specific persona is sent to the gateway at runtime; no hardcoded brands.
 */

const { IConversationEngine } = require('../interface');

const GATEWAY_TIMEOUT_MS = 8000;
const GATEWAY_RETRIES = 1;

/**
 * PersonaPlexConversationEngine — tries gateway, then fallback.
 */
class PersonaPlexConversationEngine extends IConversationEngine {
  constructor(options = {}) {
    super();
    this._gatewayUrl = options.gatewayUrl || process.env.PERSONAPLEX_GATEWAY_URL || '';
    this._timeoutMs = options.timeoutMs ?? GATEWAY_TIMEOUT_MS;
    this._fallbackRun = options.fallbackRun; // (sessionId, order) => Promise<void>
  }

  get name() {
    return 'personaplex';
  }

  /**
   * Start session: try PersonaPlex gateway with company persona; on fail run fallback.
   * @param {string} sessionId
   * @param {Object} order
   * @param {Object} companyContext - company_id, name, persona, etc.
   * @param {Object} metadata - menuData, onAudio, etc.
   */
  async startSession(sessionId, order, companyContext, metadata) {
    const companyId = companyContext?.company_id || 'default';
    const engineUsed = 'personaplex';

    if (!this._gatewayUrl || !this._gatewayUrl.startsWith('http')) {
      console.log(`[PersonaPlex] Gateway URL not set or invalid; falling back to default engine. company_id=${companyId} sessionId=${sessionId}`);
      return this._runFallback(sessionId, order, companyId, 'gateway_not_configured');
    }

    let lastError = null;
    for (let attempt = 0; attempt <= GATEWAY_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this._timeoutMs);
        const response = await fetch(`${this._gatewayUrl.replace(/\/$/, '')}/session/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            company_id: companyId,
            companyContext: {
              company_id: companyContext?.company_id,
              name: companyContext?.name,
              persona: companyContext?.persona || {},
              taxRate: companyContext?.taxRate,
            },
            order: order || { items: [] },
            metadata: metadata ? { menuData: !!metadata.menuData } : {},
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`[PersonaPlex] Gateway session started. company_id=${companyId} sessionId=${sessionId} engine=${engineUsed}`);
          // Gateway is responsible for full duplex; we do not run fallback here.
          // If the gateway only does HTTP and expects us to stream audio, we would need
          // to handle that here. For now we treat 2xx as "gateway handles the call".
          return;
        }
        lastError = new Error(`Gateway returned ${response.status}`);
      } catch (err) {
        lastError = err;
        const msg = err.message || String(err);
        const isAbort = err.name === 'AbortError' || msg.includes('abort');
        console.warn(`[PersonaPlex] Attempt ${attempt + 1} failed. company_id=${companyId} sessionId=${sessionId} error=${msg}`);
        if (isAbort) {
          console.warn(`[PersonaPlex] Timeout after ${this._timeoutMs}ms; falling back to default.`);
          break;
        }
      }
    }

    console.log(`[PersonaPlex] Falling back to default engine. company_id=${companyId} sessionId=${sessionId} reason=${lastError?.message || 'unknown'}`);
    return this._runFallback(sessionId, order, companyId, lastError?.message || 'gateway_error');
  }

  _runFallback(sessionId, order, companyId, reason) {
    if (typeof this._fallbackRun !== 'function') {
      console.error('[PersonaPlex] Fallback not configured; call may have no conversation.');
      return Promise.resolve();
    }
    return this._fallbackRun(sessionId, order);
  }
}

module.exports = { PersonaPlexConversationEngine };

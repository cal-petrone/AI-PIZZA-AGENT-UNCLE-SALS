/**
 * Default conversation engine: existing OpenAI Realtime API behavior.
 * Unchanged from current agent; no PersonaPlex.
 * Company-agnostic: instructions/persona can be driven by companyContext later.
 */

const { IConversationEngine } = require('../interface');

/**
 * DefaultConversationEngine — wraps the existing connectToOpenAI flow.
 * run(sessionId, order, companyContext, { connectToOpenAI, ... }) is the main entry;
 * startSession is used when the server wires engine by calling connectToOpenAI directly for default.
 */
class DefaultConversationEngine extends IConversationEngine {
  constructor(connectToOpenAIFn) {
    super();
    this._connectToOpenAI = connectToOpenAIFn;
  }

  async startSession(sessionId, order, companyContext, metadata) {
    if (typeof this._connectToOpenAI !== 'function') {
      throw new Error('DefaultConversationEngine: connectToOpenAI not injected');
    }
    return this._connectToOpenAI(sessionId, order);
  }

  get name() {
    return 'default';
  }
}

module.exports = { DefaultConversationEngine };

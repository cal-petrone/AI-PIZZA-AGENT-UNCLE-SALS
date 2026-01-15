/**
 * Logger Service
 * Handles order logging to Zapier with retries and idempotency
 */

const https = require('https');
const http = require('http');

class Logger {
  constructor(webhookUrl, maxRetries = 3, retryDelay = 1000) {
    this.webhookUrl = webhookUrl;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.loggedOrders = new Set(); // Track logged orders for idempotency
  }
  
  /**
   * Log order to Zapier webhook
   */
  async logOrder(orderData) {
    // Check idempotency - prevent duplicate logging
    const orderId = orderData.callSid || orderData.streamSid;
    if (this.loggedOrders.has(orderId)) {
      console.log(`⚠️  Order ${orderId} already logged, skipping duplicate`);
      return { success: true, skipped: true, reason: 'already_logged' };
    }
    
    const payload = JSON.stringify(orderData);
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this._sendRequest(payload);
        
        if (result.success) {
          // Mark as logged on success
          this.loggedOrders.add(orderId);
          console.log(`✓ Order logged successfully (attempt ${attempt}/${this.maxRetries})`);
          return { success: true, attempt };
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      } catch (error) {
        console.error(`✗ Log attempt ${attempt}/${this.maxRetries} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await this._sleep(delay);
        } else {
          // All retries failed
          console.error(`✗ All ${this.maxRetries} attempts failed to log order`);
          return { 
            success: false, 
            error: error.message,
            attempts: this.maxRetries
          };
        }
      }
    }
  }
  
  /**
   * Send HTTP request to Zapier webhook
   */
  _sendRequest(payload) {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.webhookUrl);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 10000 // 10 second timeout
        };
        
        const req = client.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, statusCode: res.statusCode, data });
            } else {
              resolve({ 
                success: false, 
                statusCode: res.statusCode, 
                error: `HTTP ${res.statusCode}: ${data}` 
              });
            }
          });
        });
        
        req.on('error', (error) => {
          reject(error);
        });
        
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        
        req.write(payload);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Sleep utility for retry delays
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Check if order was already logged (for idempotency checks)
   */
  isLogged(orderId) {
    return this.loggedOrders.has(orderId);
  }
  
  /**
   * Clear logged orders cache (useful for testing or long-running servers)
   */
  clearCache() {
    this.loggedOrders.clear();
  }
}

module.exports = Logger;






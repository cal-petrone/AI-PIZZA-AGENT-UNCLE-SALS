/**
 * Environment Variable Validation
 * Validates required environment variables at startup
 */

function validateEnv() {
  const required = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'OPENAI_API_KEY',
    'ZAPIER_WEBHOOK_URL',
    'PORT'
  ];
  
  const optional = [
    'GOOGLE_SHEETS_CREDENTIALS_PATH',
    'GOOGLE_SHEETS_ID',
    'NGROK_URL'
  ];
  
  const missing = [];
  const warnings = [];
  
  // Check required variables
  required.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });
  
  // Check optional variables and warn if missing
  optional.forEach(key => {
    if (!process.env[key]) {
      warnings.push(key);
    }
  });
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please check your .env file.`
    );
  }
  
  if (warnings.length > 0) {
    console.warn(`⚠️  Optional environment variables not set: ${warnings.join(', ')}`);
  }
  
  // Validate format of some variables
  if (process.env.PORT && isNaN(parseInt(process.env.PORT))) {
    throw new Error('PORT must be a valid number');
  }
  
  if (process.env.ZAPIER_WEBHOOK_URL && !process.env.ZAPIER_WEBHOOK_URL.startsWith('http')) {
    throw new Error('ZAPIER_WEBHOOK_URL must be a valid HTTP/HTTPS URL');
  }
  
  console.log('✓ Environment variables validated');
  return true;
}

/**
 * Sanitize logs to prevent leaking secrets
 */
function sanitizeForLog(data) {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveKeys = [
    'api_key', 'apiKey', 'auth_token', 'authToken',
    'password', 'secret', 'token', 'credential'
  ];
  
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeForLog(sanitized[key]);
    }
  }
  
  return sanitized;
}

module.exports = {
  validateEnv,
  sanitizeForLog
};






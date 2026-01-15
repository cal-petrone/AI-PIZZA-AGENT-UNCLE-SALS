/**
 * Health Check Route
 * Simple health endpoint for monitoring
 */

function healthCheck(req, res) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
}

module.exports = healthCheck;






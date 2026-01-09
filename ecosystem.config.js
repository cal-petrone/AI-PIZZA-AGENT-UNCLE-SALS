/**
 * PM2 Ecosystem Configuration
 * This ensures the server runs permanently and auto-restarts on crashes
 * 
 * Install PM2: npm install -g pm2
 * Start: pm2 start ecosystem.config.js
 * Status: pm2 status
 * Logs: pm2 logs
 * Stop: pm2 stop all
 * Restart: pm2 restart all
 */

module.exports = {
  apps: [{
    name: 'uncle-sals-pizza-ai',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false, // Set to true for development, false for production
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Auto-restart on crash - CRITICAL: Never stop restarting
    min_uptime: '10s',
    max_restarts: Infinity, // NEVER stop restarting - always keep trying
    restart_delay: 4000,
    // Keep server alive
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    // CRITICAL: Health check for PM2 - ensures server is always responding
    // PM2 will restart if health check fails
    health_check_grace_period: 3000,
    health_check_interval: 30000, // Check every 30 seconds
    // Health check URL - PM2 will ping this to verify server is alive
    // Note: This requires PM2 Plus or custom health check script
    // For now, we rely on auto-restart on crash
  }]
};



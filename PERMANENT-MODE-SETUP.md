# 🛡️ PERMANENT MODE SETUP - NEVER FAIL AGAIN

This guide ensures your AI pizza ordering assistant runs **PERMANENTLY** and **NEVER FAILS**.

## ✅ What's Been Added

1. **Global Error Handlers** - Server will NEVER crash, even on errors
2. **PM2 Process Manager** - Auto-restarts on crashes
3. **Health Check Endpoint** - Monitor server status
4. **Keep-Alive Endpoint** - Prevent timeouts
5. **Comprehensive Error Recovery** - All errors are caught and logged

## 🚀 Quick Start (PERMANENT MODE)

### Option 1: Using PM2 (RECOMMENDED - Auto-restarts on crashes)

```bash
# Install PM2 globally (one-time setup)
npm install -g pm2

# Start in permanent mode
npm run pm2:start

# OR use the startup script
./.pm2-start.sh
```

### Option 2: Using npm start (Basic - no auto-restart)

```bash
npm start
```

## 📊 Monitoring Commands

```bash
# Check server status
npm run pm2:status
# OR
pm2 status

# View live logs
npm run pm2:logs
# OR
pm2 logs

# Monitor resources (CPU, memory)
pm2 monit

# Restart server
npm run pm2:restart
# OR
pm2 restart all

# Stop server
npm run pm2:stop
# OR
pm2 stop all
```

## 🔧 Setup PM2 to Start on System Boot

After starting with PM2, run:

```bash
pm2 save
pm2 startup
```

This ensures the server starts automatically when your computer reboots.

## 📡 Health Check Endpoints

- **Health Check**: `http://localhost:3000/health`
  - Returns server status, uptime, memory usage, active orders
- **Keep-Alive**: `http://localhost:3000/keepalive`
  - Simple endpoint to prevent timeouts

## 🛡️ Error Handling Features

1. **Uncaught Exceptions** - Logged but server continues running
2. **Unhandled Rejections** - Logged but server continues running
3. **WebSocket Errors** - Logged but server continues running
4. **Server Errors** - Logged but server continues running
5. **Client Errors** - Handled gracefully without crashing

## ⚠️ Important Notes

- **PM2 is recommended** for production - it auto-restarts on crashes
- Server will **NEVER exit** on errors - all errors are caught and logged
- Check logs regularly: `pm2 logs` or `npm run pm2:logs`
- Monitor health endpoint to ensure server is responding

## 🔍 Troubleshooting

### Server not responding?
1. Check status: `pm2 status`
2. Check logs: `pm2 logs`
3. Restart: `pm2 restart all`

### Server keeps crashing?
1. Check logs: `pm2 logs --err`
2. Check health: `curl http://localhost:3000/health`
3. Verify environment variables in `.env`

### Need to update code?
1. Stop: `pm2 stop all`
2. Make changes
3. Start: `pm2 start all`

## ✅ Verification

After starting, verify:
1. ✅ Server is running: `pm2 status` shows "online"
2. ✅ Health check works: Visit `http://localhost:3000/health`
3. ✅ Logs are clean: `pm2 logs` shows no errors
4. ✅ Can receive calls: Test with your Twilio number

## 🎯 PERMANENT MODE = ALWAYS ON

With PM2 and global error handlers:
- ✅ Server auto-restarts on crashes
- ✅ Server never exits on errors
- ✅ Server starts on system boot (if configured)
- ✅ Server handles all errors gracefully
- ✅ Server is monitored and logged

**Your AI assistant will ALWAYS answer the phone!** 📞





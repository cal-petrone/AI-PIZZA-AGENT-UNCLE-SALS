#!/bin/bash
# PM2 Startup Script for Uncle Sal's Pizza AI Assistant
# This ensures the server runs permanently and auto-restarts

echo "🚀 Starting Uncle Sal's Pizza AI Assistant in PERMANENT MODE..."
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 is not installed. Installing PM2..."
    npm install -g pm2
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the application with PM2
echo "📦 Starting application with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
echo "🔧 Setting up PM2 to start on system boot..."
pm2 startup

echo ""
echo "✅✅✅ SERVER IS NOW RUNNING IN PERMANENT MODE ✅✅✅"
echo ""
echo "📊 Useful commands:"
echo "  pm2 status          - Check server status"
echo "  pm2 logs            - View server logs"
echo "  pm2 restart all     - Restart server"
echo "  pm2 stop all        - Stop server"
echo "  pm2 monit           - Monitor server resources"
echo ""
echo "🛡️  Server will auto-restart on crashes"
echo "💓 Server will stay running permanently"





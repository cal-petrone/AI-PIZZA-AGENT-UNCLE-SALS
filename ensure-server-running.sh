#!/bin/bash
# CRITICAL: This script ensures the server is ALWAYS running, even after reboot or sleep
# This prevents "application error" messages when the computer is closed

cd "$(dirname "$0")"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    # Try using npx pm2
    PM2_CMD="npx pm2"
else
    PM2_CMD="pm2"
fi

# Check if the server is running
if ! $PM2_CMD list | grep -q "uncle-sals-pizza-ai.*online"; then
    echo "⚠️  Server is not running - starting now..."
    
    # Save PM2 process list
    $PM2_CMD save
    
    # Start the server
    $PM2_CMD start ecosystem.config.js || $PM2_CMD restart uncle-sals-pizza-ai
    
    # Save again to ensure it's persisted
    $PM2_CMD save
    
    echo "✅ Server started successfully"
else
    echo "✅ Server is already running"
fi

# Ensure PM2 startup is configured
if [ ! -f ~/Library/LaunchAgents/pm2.calvinpetrone.plist ]; then
    echo "⚠️  PM2 startup not configured - configuring now..."
    $PM2_CMD startup launchd -u calvinpetrone --hp ~
    $PM2_CMD save
fi

# CRITICAL: Also check if ngrok is running (if installed)
# ngrok must be running for Twilio to reach the server
if command -v ngrok &> /dev/null; then
    if ! pgrep -f "ngrok" > /dev/null; then
        echo "⚠️  WARNING: ngrok is not running - Twilio webhook will not work!"
        echo "   Start ngrok with: ./start-ngrok.sh"
        echo "   Or keep your computer awake to prevent ngrok from disconnecting"
    else
        echo "✅ ngrok is running"
    fi
else
    echo "⚠️  ngrok is not installed - Twilio webhook requires ngrok or a cloud server"
fi

echo "✅ Server check complete"


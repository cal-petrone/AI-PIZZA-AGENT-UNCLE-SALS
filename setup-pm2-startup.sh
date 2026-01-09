#!/bin/bash

# PM2 Startup Script for Uncle Sal's Pizza AI Server
# This ensures the server runs even when the computer is closed/stepped away from

echo "Setting up PM2 to start on system boot..."
echo ""
echo "You will be prompted for your sudo password to install the PM2 startup script."
echo ""

cd /Users/calvinpetrone/Desktop/ai

# Save current PM2 process list
echo "Saving current PM2 process list..."
npx pm2 save

# Set up PM2 to start on boot (requires sudo)
echo ""
echo "Setting up PM2 startup (this requires sudo)..."
sudo env PATH=$PATH:/usr/local/bin /Users/calvinpetrone/Desktop/ai/node_modules/pm2/bin/pm2 startup launchd -u calvinpetrone --hp /Users/calvinpetrone

echo ""
echo "✅ PM2 startup script installed!"
echo ""
echo "Your server will now:"
echo "  - Start automatically when your computer boots"
echo "  - Continue running even when you close your laptop/step away"
echo "  - Auto-restart if it crashes (up to infinity times)"
echo ""
echo "To verify PM2 is running, use: npx pm2 status"
echo "To view logs, use: npx pm2 logs"



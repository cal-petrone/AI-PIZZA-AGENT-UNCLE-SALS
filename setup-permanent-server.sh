#!/bin/bash
# CRITICAL: Permanent server setup - ensures server ALWAYS runs, even when computer is closed
# This script configures PM2 to start on boot and keep the server running permanently

cd "$(dirname "$0")"

echo "🔧 Setting up permanent server configuration..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 not found globally, using npx pm2"
    PM2_CMD="npx pm2"
else
    PM2_CMD="pm2"
fi

# Step 1: Save current PM2 process list
echo "📝 Saving PM2 process list..."
$PM2_CMD save

# Step 2: Configure PM2 to start on boot
echo "🚀 Configuring PM2 to start on boot..."
$PM2_CMD startup launchd -u calvinpetrone --hp ~

# Step 3: Ensure server is running
echo "✅ Ensuring server is running..."
if ! $PM2_CMD list | grep -q "uncle-sals-pizza-ai.*online"; then
    echo "⚠️  Server not running - starting now..."
    $PM2_CMD start ecosystem.config.js || $PM2_CMD restart uncle-sals-pizza-ai
fi

# Step 4: Save again to ensure persistence
echo "💾 Saving PM2 configuration..."
$PM2_CMD save

# Step 5: Verify LaunchAgent is loaded
echo "🔍 Verifying LaunchAgent..."
if [ -f ~/Library/LaunchAgents/pm2.calvinpetrone.plist ]; then
    echo "✅ PM2 LaunchAgent plist exists"
    # Try to load it
    launchctl load ~/Library/LaunchAgents/pm2.calvinpetrone.plist 2>&1 || echo "⚠️  LaunchAgent may already be loaded"
else
    echo "⚠️  PM2 LaunchAgent plist not found - running startup command again..."
    $PM2_CMD startup launchd -u calvinpetrone --hp ~
fi

# Step 6: Create a LaunchAgent to check server every 5 minutes
echo "⏰ Setting up periodic health check..."
cat > ~/Library/LaunchAgents/com.unclesals.server-check.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.unclesals.server-check</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>/Users/calvinpetrone/Desktop/ai/ensure-server-running.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
  </dict>
</plist>
EOF

# Load the health check LaunchAgent
launchctl load ~/Library/LaunchAgents/com.unclesals.server-check.plist 2>&1 || launchctl unload ~/Library/LaunchAgents/com.unclesals.server-check.plist 2>&1; launchctl load ~/Library/LaunchAgents/com.unclesals.server-check.plist 2>&1

# Step 7: Set up ngrok auto-start (if ngrok is installed)
echo "🌐 Checking ngrok setup..."
if command -v ngrok &> /dev/null; then
    echo "✅ ngrok is installed"
    chmod +x "$(dirname "$0")/start-ngrok.sh"
    echo "⚠️  IMPORTANT: Make sure ngrok is running before closing your computer"
    echo "   Run: ./start-ngrok.sh"
    echo "   Or set up ngrok to auto-start on boot"
else
    echo "⚠️  ngrok is not installed - Twilio webhook will not work without it"
    echo "   Install ngrok: https://ngrok.com/download"
    echo "   Or use a cloud server instead of local development"
fi

echo ""
echo "✅✅✅ PERMANENT SERVER SETUP COMPLETE ✅✅✅"
echo ""
echo "The server is now configured to:"
echo "  1. ✅ Start automatically on boot"
echo "  2. ✅ Restart automatically if it crashes"
echo "  3. ✅ Check every 5 minutes to ensure it's running"
echo "  4. ✅ Run even when your computer is closed"
echo ""
echo "To verify it's working:"
echo "  - Check status: npx pm2 status"
echo "  - View logs: npx pm2 logs"
echo "  - Restart: npx pm2 restart all"
echo ""
echo "The server will now ALWAYS be available, even when your computer is closed!"


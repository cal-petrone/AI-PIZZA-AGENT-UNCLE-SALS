#!/bin/bash
# CRITICAL: Auto-start ngrok and keep it running
# This ensures Twilio can always reach the server, even after reboot/sleep

cd "$(dirname "$0")"

# Check if ngrok is already running
if pgrep -f "ngrok" > /dev/null; then
    echo "✅ ngrok is already running"
    exit 0
fi

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ERROR: ngrok is not installed or not in PATH"
    echo "Please install ngrok: https://ngrok.com/download"
    exit 1
fi

# Get port from environment or use default
PORT=${PORT:-3000}

echo "🚀 Starting ngrok tunnel on port $PORT..."

# Start ngrok in background
nohup ngrok http $PORT > ngrok.log 2>&1 &

# Wait a moment for ngrok to start
sleep 3

# Get the ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$NGROK_URL" ]; then
    echo "⚠️  Could not get ngrok URL - it may still be starting"
    echo "Check ngrok.log for details"
else
    echo "✅ ngrok is running at: $NGROK_URL"
    echo ""
    echo "⚠️  IMPORTANT: Update your Twilio webhook URL to:"
    echo "   $NGROK_URL/incoming-call"
    echo ""
    echo "You can also set NGROK_URL in your .env file:"
    echo "   NGROK_URL=$NGROK_URL"
fi



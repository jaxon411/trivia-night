#!/bin/bash

# Trivia Night - Launch Script
# This script starts the trivia game server and opens the TV display

set -e

echo "========================================"
echo "     Trivia Night - Starting Up         "
echo "========================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.9 or higher."
    exit 1
fi

echo "✅ Python found: $(python3 --version)"
echo ""

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt --quiet --break-system-packages

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo ""

# Get local IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')

if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="127.0.0.1"
fi

JOIN_URL="http://${LOCAL_IP}:8080"

echo "========================================"
echo "     Game is Ready to Start!            "
echo "========================================"
echo ""
echo "📱 Players join at:"
echo "   ${JOIN_URL}"
echo ""
echo "📺 TV display at:"
echo "   ${JOIN_URL}/tv"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "Opening Chromium in kiosk mode..."
echo "========================================"
echo ""

# Start the server in background
echo "Starting game server on port 8080..."
nohup python3 server.py > /tmp/trivia-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Check if server started successfully
if ! ps -p $SERVER_PID > /dev/null; then
    echo "❌ Failed to start server. Check /tmp/trivia-server.log"
    cat /tmp/trivia-server.log
    exit 1
fi

echo "✅ Server started successfully (PID: $SERVER_PID)"
echo ""

# Open Chromium in kiosk mode
if command -v chromium-browser &> /dev/null; then
    echo "Opening TV display in kiosk mode..."
    chromium-browser --kiosk --incognito --noerrdialogs --disable-popup-blocking --disable-web-security --allow-file-access-from-files --start-fullscreen "${JOIN_URL}/tv" &
    
    CHROMIUM_PID=$!
    echo "✅ Chromium started (PID: $CHROMIUM_PID)"
elif command -v google-chrome &> /dev/null; then
    echo "Opening TV display in kiosk mode..."
    google-chrome --kiosk --incognito --noerrdialogs --disable-popup-blocking --disable-web-security --allow-file-access-from-files --start-fullscreen "${JOIN_URL}/tv" &
    
    CHROMIUM_PID=$!
    echo "✅ Chrome started (PID: $CHROMIUM_PID)"
else
    echo "⚠️  No browser found. Please open ${JOIN_URL}/tv manually in your browser."
fi

echo ""
echo "========================================"
echo "     Game is Running!                   "
echo "========================================"
echo ""
echo "Questions are being fetched from APIs..."
echo "Wait for the host to start the game."
echo ""
echo "To stop the server: kill $SERVER_PID"
echo "Or press Ctrl+C in this terminal"
echo ""

# Keep script running so Ctrl+C works
wait $SERVER_PID

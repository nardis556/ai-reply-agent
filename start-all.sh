#!/bin/bash

# Twitter Bot - Start All Services
echo "🚀 Starting Twitter Bot Services..."
echo "=================================="

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down all services..."
    kill $(jobs -p) 2>/dev/null
    wait
    echo "✅ All services stopped"
    exit 0
}

# Set up trap to handle Ctrl+C
trap cleanup SIGINT SIGTERM

# Start the web server
echo "📡 Starting Web Server..."
npm start &
SERVER_PID=$!

# Wait a moment for server to start
sleep 3

# Start the scraper service
echo "🔍 Starting Scraper Service..."
npm run scraper-watch &
SCRAPER_PID=$!

# # Start the reply service
# echo "💬 Starting Reply Service..."
# npm run reply-watch &
# REPLY_PID=$!

# Display status
echo ""
echo "✅ All services started successfully!"
echo "=================================="
echo "📡 Web Interface: http://localhost:3000"
echo "🔍 Scraper: Running in watch mode"
echo "💬 Reply Service: Running in watch mode"
echo ""
echo "Press Ctrl+C to stop all services"
echo "=================================="

# Wait for all background jobs
wait 
#!/bin/bash

# Twitter AI Reply Bot Cron Script
# Runs every 30 minutes to find and reply to tweets

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$SCRIPT_DIR"

# Log file path
LOG_FILE="$BOT_DIR/cron.log"
ERROR_LOG="$BOT_DIR/cron-error.log"

# Create log files if they don't exist
touch "$LOG_FILE"
touch "$ERROR_LOG"

# Function to log with timestamp
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to log errors
log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$ERROR_LOG"
}

log_message "🚀 Starting Twitter AI Reply Bot cron job..."
log_message "Working directory: $BOT_DIR"

# Change to bot directory
cd "$BOT_DIR" || {
    log_error "Failed to change to directory: $BOT_DIR"
    exit 1
}

# Check if node is available
if ! command -v node &> /dev/null; then
    log_error "Node.js not found in PATH"
    exit 1
fi

# Check if the main script exists
if [ ! -f "index.js" ]; then
    log_error "index.js not found in $BOT_DIR"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    log_error ".env file not found. Please create .env with required configuration."
    exit 1
fi

# Run the bot with timeout (max 25 minutes to allow for next cron)
log_message "🤖 Running Twitter AI Reply Bot..."

# Set NODE_ENV for production
export NODE_ENV=production

# Run with timeout and capture both stdout and stderr
timeout 1500s node index.js >> "$LOG_FILE" 2>> "$ERROR_LOG"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    log_message "✅ Bot completed successfully"
elif [ $EXIT_CODE -eq 124 ]; then
    log_error "Bot timed out after 25 minutes"
else
    log_error "Bot exited with code: $EXIT_CODE"
fi

# Log memory and disk usage for monitoring
MEMORY_USAGE=$(free -h | grep '^Mem:' | awk '{print $3"/"$2}')
DISK_USAGE=$(df -h "$BOT_DIR" | tail -1 | awk '{print $3"/"$2" ("$5")"}')

log_message "📊 System stats - Memory: $MEMORY_USAGE, Disk: $DISK_USAGE"

# Rotate logs if they get too large (keep last 1000 lines)
if [ $(wc -l < "$LOG_FILE") -gt 1000 ]; then
    tail -1000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    log_message "📋 Log file rotated to keep last 1000 lines"
fi

if [ $(wc -l < "$ERROR_LOG") -gt 1000 ]; then
    tail -1000 "$ERROR_LOG" > "${ERROR_LOG}.tmp" && mv "${ERROR_LOG}.tmp" "$ERROR_LOG"
fi

log_message "🏁 Cron job completed"
echo "---" >> "$LOG_FILE"

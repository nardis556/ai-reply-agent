# Environment Configuration

## Scraper Service Configuration

Create a `.env` file in the project root with these configurations:

```bash
# Core Scraper Settings
SEARCH_KEYWORD="#ai video"
HEADLESS=true
SLOW_MO=1000
MAX_SCROLL_ATTEMPTS=100
NO_NEW_TWEETS_SCROLL=10
VERBOSE_LOGGING=false
RUN_CONTINUOUSLY=true
RUN_INTERVAL=30                    # Alternative: RUN_SCRAPER_EVERY_N_MINUTES=30
RUN_SCRAPER_EVERY_N_MINUTES=30    # User's preferred variable name
DELAY_BETWEEN_SCROLLS=3000

# Webhook Configuration
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
BROADCAST_WEBHOOK=true

# Data Retention Settings
RETENTION_DAYS=30           # Keep tweets for 30 days
LOG_RETENTION_DAYS=90       # Keep scraper logs for 90 days
AUTO_CLEANUP=true           # Enable automatic cleanup

# OpenAI Configuration (for replies)
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-3.5-turbo

# Reply Service Configuration
REPLY_REPLY_RUN_INTERVAL_N_MINUTES=10  # Minutes between reply processing runs
REPLY_RUN_CONTINUOUSLY=false           # Set to 'true' for continuous reply processing
REPLY_INSTRUCTIONS="You are a friendly Twitter user who loves sharing interesting connections between unexpected topics. When you see someone posting about technology, AI, or digital content, you like to draw thoughtful parallels to childhood shows like the Teletubbies - noting how their colorful, diverse world mirrors the creativity we see in modern tech. Respond naturally to the username mentioned, acknowledging their specific topic while making genuine, insightful connections. Keep your tone conversational and authentic, like you're talking to a friend who just shared something cool."
```

## New Features Added

### Database Logging
- All scraper runs are now logged to `scraper_runs` table
- Tracks run statistics, duration, errors, and webhook status
- Persistent history across service restarts

### Data Retention
- **RETENTION_DAYS**: Automatically delete old processed tweets (replied/skipped)
- **LOG_RETENTION_DAYS**: Automatically delete old scraper run logs
- **AUTO_CLEANUP**: Enable/disable automatic cleanup during runs

### Webhook Broadcasting
- **BROADCAST_WEBHOOK**: Control whether to send webhook notifications
- Webhook notifications now include detailed run statistics
- Tracks webhook delivery status in database

## API Endpoints

### Scraper Logs
- `GET /api/scraper-logs` - Get recent scraper runs
- `GET /api/scraper-logs/stats` - Get scraper statistics
- `GET /api/scraper-logs/:id` - Get specific run details  
- `POST /api/scraper-logs/cleanup` - Manual cleanup trigger

### Usage Examples

```bash
# Get scraper statistics
curl http://localhost:3000/api/scraper-logs/stats

# Get recent runs (paginated)
curl http://localhost:3000/api/scraper-logs?page=1&limit=10

# Manual cleanup (30 days tweets, 90 days logs)
curl -X POST http://localhost:3000/api/scraper-logs/cleanup \
  -H "Content-Type: application/json" \
  -d '{"tweetRetentionDays": 30, "logRetentionDays": 90}'
``` 

## Reply Service

The reply service processes tweets marked as "selected" in the web interface and actually posts replies to Twitter using Playwright.

### Features
- **Smart Reply Selection**: Uses manual replies first, then cached AI previews, then generates new AI replies
- **Playwright Integration**: Actually posts replies to Twitter (requires login)
- **Error Handling**: Tracks failed replies and marks tweets appropriately
- **Rate Limiting**: 5-second delay between replies to avoid rate limits

### Usage

```bash
# Run reply service once (visible browser)
npm run reply-once

# Run reply service once (headless)
npm run reply

# Run reply service continuously (checks every 10 minutes)
npm run reply-watch
```

### Environment Variables

```bash
# Required for reply posting
REPLY_REPLY_RUN_INTERVAL_N_MINUTES=10  # Minutes between checks when running continuously
REPLY_RUN_CONTINUOUSLY=false           # Enable continuous mode
REPLY_INSTRUCTIONS="..."               # Custom AI reply instructions

# Standard browser settings apply
HEADLESS=true                      # Run browser in headless mode
SLOW_MO=1000                      # Slow down browser actions
VERBOSE_LOGGING=false             # Enable detailed logging
```

### Workflow
1. Select tweets in web interface and click "Reply to Selected"
2. Run the reply service: `npm run reply`
3. Service finds tweets with status="selected"
4. For each tweet, uses: Manual reply → Cached AI preview → New AI generation
5. Posts reply to Twitter using Playwright
6. Updates database with reply status and text
7. Failed replies are marked with error details 
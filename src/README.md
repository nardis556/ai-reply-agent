# Backend Documentation 🚀

## Overview
This is the backend API server for the Twitter bot manual review interface. It provides REST endpoints for managing tweets, generating AI replies, and controlling the manual review workflow.

## Structure
```
src/
├── agent/              # AI reply generation modules
│   ├── config/         # AI configuration
│   ├── services/       # OpenAI service
│   ├── prompt/         # Prompt building
│   ├── validation/     # Reply validation
│   ├── processing/     # Main reply generator
│   └── index.js        # Agent entry point
├── api/                # API routes
│   └── routes/         # Route handlers
│       ├── tweets.js   # Tweet management endpoints
│       └── test.js     # Test endpoints
├── database/           # Database operations
│   └── database.js     # SQLite database class
└── server.js           # Main server entry point
```

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Make sure your `.env` file includes:
```env
OPENAI_API_KEY=your_openai_api_key
API_PORT=3000
VERBOSE_LOGGING=true
```

### 3. Start the Server
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

### 4. Test the Setup
```bash
# Test all components
curl http://localhost:3000/api/test/all

# Test just the AI agent
curl http://localhost:3000/api/test/agent

# Test database
curl http://localhost:3000/api/test/database
```

## API Endpoints

### System Endpoints
- `GET /api/status` - Server status
- `GET /api/health` - Health check with database stats
- `GET /api/test/all` - Run all tests

### Tweet Management
- `GET /api/tweets/pending` - Get tweets waiting for review
- `GET /api/tweets/history` - Get replied tweet history  
- `GET /api/tweets/skipped` - Get skipped tweets
- `GET /api/tweets/stats` - Get tweet statistics
- `PUT /api/tweets/select` - Mark tweets as selected for reply
- `PUT /api/tweets/skip` - Mark tweets as skipped
- `POST /api/tweets/generate-reply` - Generate AI reply preview
- `POST /api/tweets/reply` - Send replies to selected tweets

### Example Usage

#### Get Pending Tweets
```bash
curl "http://localhost:3000/api/tweets/pending?page=1&limit=10&video=true"
```

#### Generate AI Reply Preview
```bash
curl -X POST http://localhost:3000/api/tweets/generate-reply \
  -H "Content-Type: application/json" \
  -d '{
    "tweet_data": {
      "tweet_id": "123456",
      "username": "example",
      "tweet_text": "This is a test tweet",
      "video": false
    }
  }'
```

#### Select Tweets for Reply
```bash
curl -X PUT http://localhost:3000/api/tweets/select \
  -H "Content-Type: application/json" \
  -d '{
    "tweet_ids": ["123456", "789012"]
  }'
```

## Database Schema

### tweets table
- `id` - Primary key
- `tweet_id` - Unique Twitter ID
- `username` - Twitter username
- `tweet_text` - Tweet content
- `tweet_url` - Direct link to tweet
- `status` - Review status (pending/selected/replied/skipped)
- `video` - Boolean for video content
- `reply_text` - Generated reply text
- `reply_url` - Link to our reply tweet
- `reviewed_at` - When reviewed
- `notes` - Optional user notes

### bot_runs table
- `id` - Primary key
- `started_at` - Run start time
- `completed_at` - Run completion time
- `status` - Run status
- `tweets_found` - Number of tweets discovered
- `summary` - JSON summary data

## Manual Review Workflow

1. **Bot scrapes tweets** → status: `pending`
2. **User reviews in UI** → can select tweets
3. **Selected tweets** → status: `selected`
4. **Unselected tweets** → status: `skipped` (auto-cleanup)
5. **After replying** → status: `replied` with reply info

## SSH Access
The server binds to `127.0.0.1` for security. Access via SSH tunnel:

```bash
# From your local machine
ssh -L 3000:localhost:3000 user@your-server

# Then access: http://localhost:3000
```

## Error Handling
All endpoints return consistent JSON responses:
```json
{
  "success": true|false,
  "data": { /* response data */ },
  "error": "error message if any"
}
```

## Development Tips

### Database Management
- Database file: `tweets.db` (SQLite)
- Tables are auto-created on first run
- Use `/api/test/database` to check connection

### AI Agent Testing
- Use `/api/test/agent` to verify OpenAI setup
- Test reply generation with `/api/test/generate`
- Check agent configuration in `src/agent/config/ai-config.js`

### Adding New Endpoints
1. Create route handler in `src/api/routes/`
2. Import and use in `src/server.js`
3. Follow existing error handling patterns

### Debugging
- Set `VERBOSE_LOGGING=true` for detailed logs
- Check server logs for request/response info
- Use `/api/health` to diagnose issues 
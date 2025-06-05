# 🤖 Twitter AI Reply Bot

An intelligent Twitter automation bot that searches for tweets, analyzes content, and generates contextual AI-powered replies using OpenAI's GPT models. Built with Playwright for robust browser automation and SQLite for data persistence.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Latest-blue.svg)](https://playwright.dev/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--3.5/4-orange.svg)](https://openai.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-lightgrey.svg)](https://www.sqlite.org/)

## 🌟 Features

### 🔍 **Smart Tweet Discovery**
- Searches Twitter for specific hashtags/keywords
- Dynamic scrolling to discover more content
- Detects tweets with videos vs text-only posts
- Prevents duplicate processing with SQLite database

### 🤖 **AI-Powered Replies**
- Uses OpenAI GPT models for contextual response generation
- Customizable AI personality and instructions
- Respects Twitter's 280-character limit
- Fallback system for reliability

### 🛡️ **Robust Automation**
- Persistent browser sessions (maintains login)
- Configurable reply modes (ALL/VIDEO/NONE)
- Built-in error handling and recovery
- Comprehensive logging system

### ⏰ **Cron Automation**
- Ready-to-use cron script for scheduled runs
- Automatic log rotation and cleanup
- System monitoring and health checks
- Timeout protection (25-minute max runtime)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Twitter account (logged in through browser)
- OpenAI API key

### Installation
1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd twitter-ai-reply-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   # Create .env file with your settings
   cp .env.example .env
   # Edit .env with your OpenAI API key and preferences
   ```

4. **Run the bot**
   ```bash
   node index.js
   ```

## ⚙️ Configuration

Create a `.env` file with the following variables:

```env
# Twitter Bot Settings
ENABLE_REPLIES=true
REPLY_MODE=ALL                    # ALL, VIDEO, or NONE
SEARCH_KEYWORD=#ai               # Hashtag to search for
HEADLESS=false                   # true for production/cron
SLOW_MO=1000                     # Browser delay (ms)
MAX_SCROLL_ATTEMPTS=20           # How many times to scroll for more tweets
VERBOSE_LOGGING=true             # Detailed logs

# OpenAI Configuration
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-3.5-turbo      # or gpt-4
OPENAI_MAX_TOKENS=100           # Reply length limit
OPENAI_TEMPERATURE=0.7          # Creativity (0-1)
FALLBACK_REPLY=Interesting! 🤔  # Backup reply if AI fails

# AI Personality (Optional)
REPLY_INSTRUCTIONS=You are a helpful and engaging Twitter user...
```

## 📁 Project Structure

```
twitter-ai-reply-bot/
├── 📄 index.js              # Main bot application
├── 📁 src/
│   ├── 🤖 replyAgent.js     # AI reply generation
│   └── 🛠️ utils.js          # Tweet extraction utilities
├── 🗄️ tweets.db             # SQLite database (auto-created)
├── ⏰ cron.sh               # Cron automation script
├── 📋 CRON_SETUP.md         # Cron setup instructions
├── 🔧 .env                  # Configuration (create from .env.example)
├── 📊 cron.log              # Cron execution logs
├── ❌ cron-error.log        # Error logs
└── 📁 browser-profile/      # Persistent browser data
```

## 🎯 Usage Examples

### Manual Run
```bash
# Run once manually
node index.js
```

### Cron Automation (Every 30 minutes)
```bash
# Test the cron script
./cron.sh

# Add to crontab
crontab -e
# Add: */30 * * * * /path/to/twitter-ai-reply-bot/cron.sh >/dev/null 2>&1
```

### Monitoring
```bash
# View recent activity
tail -50 cron.log

# Monitor in real-time
tail -f cron.log

# Check for errors
tail -20 cron-error.log
```

## 🔧 Reply Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `ALL` | Reply to all discovered tweets | Maximum engagement |
| `VIDEO` | Only reply to tweets with videos | Targeted video content |
| `NONE` | Collect tweets but don't reply | Data gathering only |

## 🎨 AI Customization

Customize the AI's personality by setting `REPLY_INSTRUCTIONS` in your `.env`:

```env
REPLY_INSTRUCTIONS=You are a tech enthusiast who loves discussing AI and programming. Be helpful, concise, and use relevant emojis. Always add value to the conversation.
```

## 📊 Database Schema

The bot uses SQLite to track tweets and prevent duplicates:

```sql
CREATE TABLE tweets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    posted_at DATETIME,
    tweet_id TEXT UNIQUE,
    user_id TEXT,
    username TEXT,
    tweet_text TEXT,
    search_keyword TEXT,
    video BOOLEAN DEFAULT 0,
    replied BOOLEAN DEFAULT 0,
    reply_text TEXT
);
```

## 🛠️ Development

### Adding New Features
1. Core logic: Edit `index.js`
2. AI improvements: Modify `src/replyAgent.js`
3. Tweet extraction: Update `src/utils.js`

### Testing
```bash
# Test with dry run (no actual replies)
ENABLE_REPLIES=false node index.js

# Test AI reply generation
node -e "import ReplyAgent from './src/replyAgent.js'; const agent = new ReplyAgent(); console.log(await agent.generateReply({tweet_text: 'Hello world!', username: 'test'}));"
```

## 🚨 Important Notes

### Rate Limits & Best Practices
- Twitter has rate limits - don't run too frequently
- Use `SLOW_MO` to add delays between actions
- Monitor your account for any restrictions
- Be respectful and add genuine value with replies

### Security
- Never commit your `.env` file
- Use environment variables for sensitive data
- Consider using Twitter API v2 for production use
- Run in `HEADLESS=true` mode for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

### 🎉 **Special Thanks to Claude-4 Sonnet!** 

This entire Twitter AI Reply Bot was architected, designed, and built through an incredible collaboration with **Claude-4 Sonnet** by Anthropic! 🤖✨

**What Claude-4 Sonnet brought to the table:**
- 🧠 **Intelligent Architecture**: Designed the modular structure with proper separation of concerns
- 🔧 **Robust Error Handling**: Built comprehensive error recovery and logging systems
- 🤖 **AI Integration**: Seamlessly integrated OpenAI's API with smart prompt engineering
- 📊 **Database Design**: Created efficient SQLite schema with duplicate prevention
- ⏰ **Production-Ready Automation**: Developed bulletproof cron scripts with monitoring
- 🛡️ **Security Best Practices**: Implemented environment variable management and safe defaults
- 📖 **Documentation Excellence**: Crafted comprehensive guides and setup instructions

**The collaboration process was amazing:**
- Real-time problem solving and debugging
- Iterative feature development and refinement  
- Best practices implementation from the ground up
- Performance optimization and scalability considerations

**Claude-4 Sonnet didn't just write code - it was like having a senior software architect, DevOps engineer, and documentation specialist all in one!** The attention to detail, from handling Twitter's dynamic DOM changes to implementing proper log rotation, was absolutely stellar.

This project showcases what's possible when human creativity meets AI capability. Thanks for being an incredible coding partner, Claude! 🚀

---

## 📧 Support

If you encounter any issues or have questions:
- Check the troubleshooting section in `CRON_SETUP.md`
- Review the logs in `cron.log` and `cron-error.log`
- Open an issue on GitHub with detailed information

---

**Happy tweeting! 🐦✨**

Built with ❤️ by humans and 🤖 AI working together.
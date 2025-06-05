# 🕐 Cron Setup Instructions

## Setting up the Twitter AI Reply Bot to run every 30 minutes

### 1. Test the cron script first
```bash
# Test run to make sure everything works
./cron.sh
```

### 2. Add to your crontab
```bash
# Open your crontab for editing
crontab -e
```

### 3. Add this line to run every 30 minutes
```bash
# Twitter AI Reply Bot - runs every 30 minutes
*/30 * * * * /home/user/code/agent/cron.sh >/dev/null 2>&1
```

**Or for more verbose logging in cron:**
```bash
# With cron logs (creates additional cron system logs)
*/30 * * * * /home/user/code/agent/cron.sh
```

### 4. Verify the cron job is installed
```bash
# List your cron jobs
crontab -l
```

## 📊 Monitoring & Logs

### Log Files Created:
- `cron.log` - Main execution logs with timestamps
- `cron-error.log` - Error logs only
- `tweets.db` - Your tweet database

### View Recent Logs:
```bash
# View last 50 lines of main log
tail -50 cron.log

# View recent errors
tail -20 cron-error.log

# Monitor logs in real-time
tail -f cron.log
```

### Check if bot is running:
```bash
# Check for running node processes
ps aux | grep "node index.js"

# Check recent cron executions
grep "Twitter AI Reply Bot" /var/log/syslog | tail -10
```

## ⚙️ Cron Schedule Options

Change the schedule by modifying the first part of the cron line:

| Schedule | Cron Expression | Description |
|----------|----------------|-------------|
| Every 30 min | `*/30 * * * *` | Current setup |
| Every hour | `0 * * * *` | On the hour |
| Every 2 hours | `0 */2 * * *` | Every 2 hours |
| Every 6 hours | `0 */6 * * *` | 4 times a day |
| Daily at 9 AM | `0 9 * * *` | Once per day |
| Weekdays only | `*/30 * * * 1-5` | Monday to Friday |

## 🔧 Troubleshooting

### If cron jobs aren't running:
1. Check cron service: `sudo systemctl status cron`
2. Check cron logs: `grep CRON /var/log/syslog`
3. Verify file permissions: `ls -la cron.sh`
4. Test script manually: `./cron.sh`

### Common Issues:
- **Environment variables**: Cron has limited environment. The script uses absolute paths to avoid issues.
- **Display issues**: Set `HEADLESS=true` in your `.env` for cron execution
- **Node path**: Script checks for node availability automatically

## 🛡️ Security Notes

- The script includes timeout protection (25 minutes max)
- Logs are automatically rotated to prevent disk space issues
- Error handling prevents the script from hanging
- Environment variables are loaded from `.env` file

## 📱 Optional: Set up notifications
You can modify the cron line to email you results:
```bash
# Email results (requires mailutils setup)
*/30 * * * * /home/user/code/agent/cron.sh | mail -s "Twitter Bot Run" your@email.com
``` 
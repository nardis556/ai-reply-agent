module.exports = {
  apps: [
    {
      name: 'twitter-bot-server',
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      log_file: './logs/server-combined.log',
      time: true
    },
    {
      name: 'twitter-bot-scraper',
      script: 'scraper-service.js',
      env: {
        NODE_ENV: 'production',
        RUN_CONTINUOUSLY: 'true'
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      error_file: './logs/scraper-error.log',
      out_file: './logs/scraper-out.log',
      log_file: './logs/scraper-combined.log',
      time: true
    },
    {
      name: 'twitter-bot-reply',
      script: 'reply-service.js',
      env: {
        NODE_ENV: 'production',
        RUN_CONTINUOUSLY: 'true'
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      error_file: './logs/reply-error.log',
      out_file: './logs/reply-out.log',
      log_file: './logs/reply-combined.log',
      time: true
    }
  ]
};

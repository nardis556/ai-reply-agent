#!/bin/bash

# Twitter Bot - PM2 Management Script
echo "🚀 Twitter Bot PM2 Management"
echo "=============================="

case "${1:-start}" in
  start)
    echo "📡 Starting all services with PM2..."
    npm run pm2:start
    echo ""
    echo "✅ All services started!"
    echo "📊 Check status with: npm run pm2:status"
    echo "📋 View logs with: npm run pm2:logs"
    echo "🖥️  Monitor with: npm run pm2:monit"
    ;;
  
  stop)
    echo "🛑 Stopping all services..."
    npm run pm2:stop
    echo "✅ All services stopped!"
    ;;
  
  restart)
    echo "🔄 Restarting all services..."
    npm run pm2:restart
    echo "✅ All services restarted!"
    ;;
  
  status)
    npm run pm2:status
    ;;
  
  logs)
    npm run pm2:logs
    ;;
  
  delete)
    echo "🗑️  Deleting all PM2 processes..."
    npm run pm2:delete
    echo "✅ All processes deleted!"
    ;;
  
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|delete}"
    echo ""
    echo "Commands:"
    echo "  start   - Start all services"
    echo "  stop    - Stop all services"
    echo "  restart - Restart all services"
    echo "  status  - Show service status"
    echo "  logs    - Show logs from all services"
    echo "  delete  - Delete all PM2 processes"
    exit 1
    ;;
esac 
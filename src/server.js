/**
 * Main Express Server
 * Serves API endpoints and static frontend for Twitter bot manual review interface
 */
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from './database/database.js';
import tweetsRouter from './api/routes/tweets.js';
import testRouter from './api/routes/test.js';
import scraperRouter from './api/routes/scraper.js';
import scraperLogsRouter from './api/routes/scraper-logs.js';
import replyRouter from './api/routes/reply.js';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.API_PORT || 3000;

// Initialize database
const database = new Database();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add database to request object
app.use((req, res, next) => {
    req.db = database;
    next();
});

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${req.method} ${req.path}`);
    next();
});

// API Routes
app.use('/api/tweets', tweetsRouter);
app.use('/api/test', testRouter);
app.use('/api/scraper', scraperRouter);
app.use('/api/scraper-logs', scraperLogsRouter);
app.use('/api/reply', replyRouter);

// API Status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'running',
            timestamp: new Date().toISOString(),
            database_connected: database.isConnected,
            version: '1.0.0'
        }
    });
});

// API Health check
app.get('/api/health', async (req, res) => {
    try {
        const stats = await database.getStats();
        
        res.json({
            success: true,
            data: {
                status: 'healthy',
                database: {
                    connected: database.isConnected,
                    stats
                },
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Health check failed',
            details: error.message
        });
    }
});

// Serve static files (frontend)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Catch-all handler for SPA (serve index.html for any non-API routes)
app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found'
        });
    }
    
    const indexPath = path.join(publicDir, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(404).json({
                success: false,
                error: 'Frontend not available'
            });
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Initialize and start server
async function startServer() {
    try {
        // Initialize database
        console.log('🔌 Initializing database...');
        await database.initialize();
        
        // Start server
        app.listen(PORT, '127.0.0.1', () => {
            console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
            console.log(`📊 API available at http://127.0.0.1:${PORT}/api`);
            console.log(`🌐 Frontend available at http://127.0.0.1:${PORT}`);
            console.log(`💾 Database: ${database.dbPath}`);
            console.log('');
            console.log('🔧 Available API endpoints:');
            console.log('   GET  /api/status');
            console.log('   GET  /api/health');
            console.log('   GET  /api/tweets/pending');
            console.log('   GET  /api/tweets/history');
            console.log('   GET  /api/tweets/stats');
            console.log('   POST /api/tweets/generate-reply');
            console.log('   PUT  /api/tweets/select');
            console.log('   PUT  /api/tweets/skip');
            console.log('');
            console.log('🚇 Access via SSH tunnel:');
            console.log(`   ssh -L ${PORT}:localhost:${PORT} user@your-server`);
            console.log('');
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    
    try {
        await database.close();
        console.log('✅ Server shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    
    try {
        await database.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
    }
});

// Start the server
startServer();

export default app; 
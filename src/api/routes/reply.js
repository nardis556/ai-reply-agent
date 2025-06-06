/**
 * Reply Service API Routes
 * Handles reply service status and control endpoints
 */
import express from 'express';
import fs from 'fs/promises';

const router = express.Router();

// Status file path
const REPLY_STATUS_FILE = 'reply-status.json';

/**
 * GET /api/reply/status
 * Get current reply service status
 */
router.get('/status', async (req, res) => {
    try {
        const statusData = await fs.readFile(REPLY_STATUS_FILE, 'utf8');
        const status = JSON.parse(statusData);
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        // If status file doesn't exist, return default status
        res.json({
            success: true,
            data: {
                status: 'stopped',
                message: 'Reply service not running',
                isRunning: false,
                currentRun: 0,
                totalRuns: 0,
                successfulRuns: 0,
                lastRunTime: null,
                nextRunTimestamp: null,
                remainingSeconds: 0,
                timestamp: new Date().toISOString(),
                config: {
                    runInterval: 10,
                    runContinuously: false,
                    headless: true
                }
            }
        });
    }
});

/**
 * POST /api/reply/refresh
 * Trigger manual reply processing by calling the reply service directly
 */
router.post('/refresh', async (req, res) => {
    try {
        console.log('🚀 Starting reply processing...');
        
        // Import the processReplies function
        const { processReplies } = await import('../../../reply-service.js');
        
        // Send immediate response to user
        res.json({
            success: true,
            data: {
                message: 'Reply processing started',
                timestamp: new Date().toISOString()
            }
        });
        
        // Start reply processing in background (don't await - let it run async)
        setImmediate(async () => {
            try {
                console.log('▶️ Starting reply processing...');
                const result = await processReplies();
                console.log('✅ Reply processing completed:', result);
            } catch (error) {
                console.error('❌ Reply processing failed:', error);
            }
        });
        
    } catch (error) {
        console.error('Error starting reply processing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start reply processing: ' + error.message
        });
    }
});

/**
 * GET /api/reply/stats
 * Get reply service statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const statusData = await fs.readFile(REPLY_STATUS_FILE, 'utf8');
        const status = JSON.parse(statusData);
        
        // Get tweet statistics from database
        const tweetStats = await req.db.getStats();
        
        res.json({
            success: true,
            data: {
                service: {
                    totalRuns: status.totalRuns || 0,
                    successfulRuns: status.successfulRuns || 0,
                    lastRunTime: status.lastRunTime,
                    isRunning: status.isRunning || false,
                    status: status.status || 'stopped'
                },
                tweets: {
                    selected: tweetStats.selected || 0,
                    replied: tweetStats.replied || 0,
                    failed: tweetStats.failed || 0
                },
                lastRun: status.lastRunResult || null
            }
        });
    } catch (error) {
        console.error('Error fetching reply stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reply statistics'
        });
    }
});

export default router; 
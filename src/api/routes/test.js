/**
 * Test API Routes
 * For validating the backend setup and agent integration
 */
import express from 'express';
import { testAgent, createReplyAgent } from '../../agent/index.js';

const router = express.Router();

/**
 * GET /api/test/agent
 * Test the AI reply agent
 */
router.get('/agent', async (req, res) => {
    try {
        const result = await testAgent();
        
        res.json({
            success: true,
            data: {
                agent_test: result,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Agent test error:', error);
        res.status(500).json({
            success: false,
            error: 'Agent test failed',
            details: error.message
        });
    }
});

/**
 * GET /api/test/status
 * Quick API health check
 */
router.get('/status', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                status: 'API is working',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'API health check failed'
        });
    }
});

/**
 * POST /api/test/update-status
 * Test tweet status update functionality
 */
router.post('/update-status', async (req, res) => {
    try {
        const { tweet_ids, status = 'selected' } = req.body;

        if (!tweet_ids || !Array.isArray(tweet_ids)) {
            return res.status(400).json({
                success: false,
                error: 'tweet_ids array is required (use database row IDs, not Twitter IDs)'
            });
        }

        console.log(`🧪 Testing status update for IDs: ${tweet_ids.join(', ')}`);
        
        const updated = await req.db.updateTweetStatus(tweet_ids, status, {
            notes: 'Test update via API'
        });

        res.json({
            success: true,
            data: {
                message: `Successfully updated ${updated} tweets to status: ${status}`,
                tweet_ids: tweet_ids,
                updated_count: updated,
                status: status
            }
        });

    } catch (error) {
        console.error('Test status update error:', error);
        res.status(500).json({
            success: false,
            error: 'Status update test failed',
            details: error.message
        });
    }
});

/**
 * POST /api/test/generate
 * Test reply generation with custom tweet data
 */
router.post('/generate', async (req, res) => {
    try {
        const testTweet = req.body.tweet_data || {
            tweet_id: 'test123',
            username: 'testuser',
            tweet_text: 'This is a test tweet for the AI agent',
            video: false,
            search_keyword: 'test'
        };

        const agent = createReplyAgent();
        const result = await agent.generateReply(testTweet);
        
        res.json({
            success: true,
            data: {
                input_tweet: testTweet,
                generated_reply: result,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Reply generation test error:', error);
        res.status(500).json({
            success: false,
            error: 'Reply generation test failed',
            details: error.message
        });
    }
});

/**
 * GET /api/test/database
 * Test database connection and operations
 */
router.get('/database', async (req, res) => {
    try {
        const stats = await req.db.getStats();
        
        res.json({
            success: true,
            data: {
                database_connected: req.db.isConnected,
                database_path: req.db.dbPath,
                stats,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({
            success: false,
            error: 'Database test failed',
            details: error.message
        });
    }
});

/**
 * GET /api/test/all
 * Run all tests
 */
router.get('/all', async (req, res) => {
    try {
        const results = {
            database: null,
            agent: null,
            timestamp: new Date().toISOString()
        };

        // Test database
        try {
            const stats = await req.db.getStats();
            results.database = {
                success: true,
                connected: req.db.isConnected,
                stats
            };
        } catch (error) {
            results.database = {
                success: false,
                error: error.message
            };
        }

        // Test agent
        try {
            const agentResult = await testAgent();
            results.agent = agentResult;
        } catch (error) {
            results.agent = {
                success: false,
                error: error.message
            };
        }

        const allSuccess = results.database.success && results.agent.success;

        res.status(allSuccess ? 200 : 500).json({
            success: allSuccess,
            data: results,
            summary: {
                database_ok: results.database.success,
                agent_ok: results.agent.success,
                overall_status: allSuccess ? 'healthy' : 'issues_detected'
            }
        });

    } catch (error) {
        console.error('Full test error:', error);
        res.status(500).json({
            success: false,
            error: 'Full test failed',
            details: error.message
        });
    }
});

export default router; 
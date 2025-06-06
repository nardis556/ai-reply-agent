/**
 * Scraper Logs API Routes
 * Endpoints for viewing scraper run history and statistics
 */
import express from 'express';

const router = express.Router();

/**
 * GET /api/scraper-logs
 * Get recent scraper runs with pagination
 */
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        const runs = await req.database.getScraperRuns(parseInt(limit), offset);
        
        res.json({
            success: true,
            data: runs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: runs.length === parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching scraper logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch scraper logs'
        });
    }
});

/**
 * GET /api/scraper-logs/stats
 * Get scraper statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await req.database.getScraperStats();
        
        // Calculate additional metrics
        const successRate = stats.totalRuns > 0 
            ? Math.round((stats.successfulRuns / stats.totalRuns) * 100) 
            : 0;
            
        const avgDurationFormatted = stats.avgDuration 
            ? `${Math.floor(stats.avgDuration / 60)}m ${Math.floor(stats.avgDuration % 60)}s`
            : '0s';

        res.json({
            success: true,
            data: {
                ...stats,
                successRate,
                avgDurationFormatted,
                totalTweetsSaved: stats.totalTweetsSaved || 0,
                totalVideoTweets: stats.totalVideoTweets || 0
            }
        });
    } catch (error) {
        console.error('Error fetching scraper stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch scraper statistics'
        });
    }
});

/**
 * POST /api/scraper-logs/cleanup
 * Manually trigger cleanup of old data
 */
router.post('/cleanup', async (req, res) => {
    try {
        const { 
            tweetRetentionDays = 30, 
            logRetentionDays = 90 
        } = req.body;

        const deletedTweets = await req.database.cleanupOldTweets(tweetRetentionDays);
        const deletedLogs = await req.database.cleanupOldScraperRuns(logRetentionDays);

        res.json({
            success: true,
            data: {
                deletedTweets,
                deletedLogs,
                message: `Cleanup completed: ${deletedTweets} tweets and ${deletedLogs} log entries removed`
            }
        });
    } catch (error) {
        console.error('Error during cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform cleanup'
        });
    }
});

/**
 * GET /api/scraper-logs/:id
 * Get specific scraper run details
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Custom query to get specific run
        const run = await new Promise((resolve, reject) => {
            req.database.db.get(
                'SELECT * FROM scraper_runs WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!run) {
            return res.status(404).json({
                success: false,
                error: 'Scraper run not found'
            });
        }

        res.json({
            success: true,
            data: run
        });
    } catch (error) {
        console.error('Error fetching scraper run:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch scraper run details'
        });
    }
});

export default router; 
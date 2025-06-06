/**
 * Tweets API Routes
 * Handles all tweet-related API endpoints for manual review workflow
 */
import express from 'express';
import { createReplyAgent } from '../../agent/index.js';

const router = express.Router();

/**
 * GET /api/tweets/pending
 * Get tweets waiting for review
 */
router.get('/pending', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const filters = {
            video: req.query.video !== undefined ? req.query.video === 'true' : undefined,
            search_keyword: req.query.search_keyword,
            username: req.query.username
        };

        const result = await req.db.getTweetsByStatus('pending', page, limit, filters);
        
        res.json({
            success: true,
            data: {
                tweets: result.tweets,
                pagination: result.pagination
            }
        });

    } catch (error) {
        console.error('Error fetching pending tweets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pending tweets'
        });
    }
});

/**
 * GET /api/tweets/selected
 * Get selected tweets waiting for reply
 */
router.get('/selected', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const filters = {
            search_keyword: req.query.search_keyword,
            username: req.query.username
        };

        const result = await req.db.getTweetsByStatus('selected', page, limit, filters);
        
        res.json({
            success: true,
            data: {
                tweets: result.tweets,
                pagination: result.pagination
            }
        });

    } catch (error) {
        console.error('Error fetching selected tweets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch selected tweets'
        });
    }
});

/**
 * GET /api/tweets/history
 * Get replied tweet history only
 */
router.get('/history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const filters = {
            search_keyword: req.query.search_keyword,
            username: req.query.username
        };

        const result = await req.db.getTweetsByStatus('replied', page, limit, filters);
        
        res.json({
            success: true,
            data: {
                tweets: result.tweets,
                pagination: result.pagination
            }
        });

    } catch (error) {
        console.error('Error fetching tweet history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tweet history'
        });
    }
});

/**
 * GET /api/tweets/skipped
 * Get skipped tweets
 */
router.get('/skipped', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const result = await req.db.getTweetsByStatus('skipped', page, limit);
        
        res.json({
            success: true,
            data: {
                tweets: result.tweets,
                pagination: result.pagination
            }
        });

    } catch (error) {
        console.error('Error fetching skipped tweets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch skipped tweets'
        });
    }
});

/**
 * PUT /api/tweets/select
 * Mark tweets as selected for reply
 */
router.put('/select', async (req, res) => {
    try {
        const { tweet_ids } = req.body;

        if (!tweet_ids || !Array.isArray(tweet_ids)) {
            return res.status(400).json({
                success: false,
                error: 'tweet_ids array is required'
            });
        }

        const updated = await req.db.updateTweetStatus(tweet_ids, 'selected');
        
        res.json({
            success: true,
            data: {
                updated_count: updated,
                selected_tweets: tweet_ids
            }
        });

    } catch (error) {
        console.error('Error selecting tweets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to select tweets'
        });
    }
});

/**
 * PUT /api/tweets/skip
 * Mark tweets as skipped (for auto-cleanup)
 */
router.put('/skip', async (req, res) => {
    try {
        const { tweet_ids } = req.body;

        if (!tweet_ids || !Array.isArray(tweet_ids)) {
            return res.status(400).json({
                success: false,
                error: 'tweet_ids array is required'
            });
        }

        const updated = await req.db.updateTweetStatus(tweet_ids, 'skipped', {
            skipped_at: new Date().toISOString()
        });
        
        res.json({
            success: true,
            data: {
                updated_count: updated,
                skipped_tweets: tweet_ids
            }
        });

    } catch (error) {
        console.error('Error skipping tweets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to skip tweets'
        });
    }
});

/**
 * POST /api/tweets/generate-reply
 * Generate AI reply preview for a tweet
 */
router.post('/generate-reply', async (req, res) => {
    try {
        const { tweet_data, options = {} } = req.body;

        if (!tweet_data) {
            return res.status(400).json({
                success: false,
                error: 'tweet_data is required'
            });
        }

        const replyAgent = createReplyAgent();
        
        if (options.multiple) {
            // Generate multiple options
            const count = options.count || 3;
            const result = await replyAgent.generateReplyOptions(tweet_data, count);
            
            res.json({
                success: true,
                data: {
                    type: 'multiple',
                    options: result.validOptions,
                    invalid_options: result.invalidOptions,
                    generated_count: result.totalGenerated,
                    success_rate: result.successRate
                }
            });
        } else {
            // Generate single reply
            const result = await replyAgent.generateReply(tweet_data);
            
            res.json({
                success: true,
                data: {
                    type: 'single',
                    reply: result.reply,
                    attempts: result.attempts,
                    warnings: result.warnings,
                    fallback: result.fallback || false,
                    usage: result.usage
                }
            });
        }

    } catch (error) {
        console.error('Error generating reply:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate reply'
        });
    }
});

/**
 * POST /api/tweets/reply
 * Send replies to selected tweets - marks tweets and triggers reply service
 */
router.post('/reply', async (req, res) => {
    try {
        const { tweet_ids, reply_options = {} } = req.body;

        if (!tweet_ids || !Array.isArray(tweet_ids)) {
            return res.status(400).json({
                success: false,
                error: 'tweet_ids array is required'
            });
        }

        // Step 1: Mark tweets as selected for reply
        const updated = await req.db.updateTweetStatus(tweet_ids, 'selected', {
            notes: 'Selected for reply via web interface'
        });

        // Step 2: Mark tweets as ready for reply processing
        // No automatic triggering - user will use the REPLY button manually
        res.json({
            success: true,
            data: {
                message: 'Tweets selected for reply',
                tweet_count: tweet_ids.length,
                updated_count: updated,
                status: 'ready_for_processing',
                action_required: 'Click the REPLY button in the dashboard to process these tweets'
            }
        });

    } catch (error) {
        console.error('Error processing reply request:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process reply request'
        });
    }
});

/**
 * GET /api/tweets/stats
 * Get tweet statistics for dashboard
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await req.db.getStats();
        
        res.json({
            success: true,
            data: {
                pending: stats.pending,
                replied: stats.replied,
                skipped: stats.skipped,
                total: stats.total,
                videos: stats.videos,
                text_only: stats.total - stats.videos
            }
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

/**
 * POST /api/tweets/:id/preview
 * Generate AI reply preview for a specific tweet (with caching)
 */
router.post('/:id/preview', async (req, res) => {
    try {
        const { id } = req.params;
        const { force_regenerate = false } = req.body;
        
        // Get tweet data from database
        const tweet = await new Promise((resolve, reject) => {
            req.db.db.get(
                'SELECT * FROM tweets WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tweet) {
            return res.status(404).json({
                success: false,
                error: 'Tweet not found'
            });
        }

        // Check for cached preview unless force regenerate is requested
        if (!force_regenerate) {
            const cachedPreview = await req.db.getCachedPreview(tweet.tweet_id);
            
            if (cachedPreview) {
                const tweetData = {
                    tweet_id: tweet.tweet_id,
                    username: tweet.username,
                    tweet_text: tweet.tweet_text,
                    video: !!tweet.video,
                    tweet_url: tweet.tweet_url,
                    search_keyword: tweet.search_keyword
                };

                return res.json({
                    success: true,
                    data: {
                        tweet: tweetData,
                        replies: [{ 
                            reply: cachedPreview.preview, 
                            isValid: true, 
                            errors: [], 
                            warnings: [],
                            cached: true,
                            generatedAt: cachedPreview.generatedAt
                        }],
                        cached: true,
                        generatedAt: cachedPreview.generatedAt
                    }
                });
            }
        }

        // Create tweet data object for AI agent
        const tweetData = {
            tweet_id: tweet.tweet_id,
            username: tweet.username,
            tweet_text: tweet.tweet_text,
            video: !!tweet.video,
            tweet_url: tweet.tweet_url,
            search_keyword: tweet.search_keyword
        };

        const replyAgent = createReplyAgent();
        
        // Generate single reply option for preview
        const result = await replyAgent.generateReply(tweetData);
        
        // Save the generated preview to cache
        await req.db.savePreview(tweet.tweet_id, result.reply);
        
        res.json({
            success: true,
            data: {
                tweet: tweetData,
                replies: [{ 
                    reply: result.reply, 
                    isValid: true, 
                    errors: [], 
                    warnings: [],
                    cached: false
                }],
                usage: result.usage,
                cached: false
            }
        });

    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate preview'
        });
    }
});

/**
 * PUT /api/tweets/:id/manual-reply
 * Save manual reply for a specific tweet
 */
router.put('/:id/manual-reply', async (req, res) => {
    try {
        const { id } = req.params;
        const { manual_reply } = req.body;

        if (!manual_reply || typeof manual_reply !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Manual reply text is required'
            });
        }

        // Validate reply length (Twitter character limit)
        if (manual_reply.length > 280) {
            return res.status(400).json({
                success: false,
                error: 'Manual reply exceeds 280 character limit'
            });
        }

        // Get tweet data from database to validate it exists
        const tweet = await new Promise((resolve, reject) => {
            req.db.db.get(
                'SELECT tweet_id FROM tweets WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tweet) {
            return res.status(404).json({
                success: false,
                error: 'Tweet not found'
            });
        }

        // Save the manual reply
        await req.db.saveManualReply(tweet.tweet_id, manual_reply);
        
        res.json({
            success: true,
            data: {
                message: 'Manual reply saved successfully',
                manual_reply,
                updated_at: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error saving manual reply:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save manual reply'
        });
    }
});

/**
 * GET /api/tweets/:id/manual-reply
 * Get manual reply for a specific tweet
 */
router.get('/:id/manual-reply', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get tweet data from database
        const tweet = await new Promise((resolve, reject) => {
            req.db.db.get(
                'SELECT tweet_id FROM tweets WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tweet) {
            return res.status(404).json({
                success: false,
                error: 'Tweet not found'
            });
        }

        // Get manual reply if it exists
        const manualReply = await req.db.getManualReply(tweet.tweet_id);
        
        if (manualReply) {
            res.json({
                success: true,
                data: {
                    manual_reply: manualReply.reply,
                    updated_at: manualReply.updatedAt
                }
            });
        } else {
            res.json({
                success: true,
                data: {
                    manual_reply: null,
                    updated_at: null
                }
            });
        }

    } catch (error) {
        console.error('Error fetching manual reply:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch manual reply'
        });
    }
});

/**
 * DELETE /api/tweets/:id/manual-reply
 * Delete manual reply for a specific tweet
 */
router.delete('/:id/manual-reply', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get tweet data from database
        const tweet = await new Promise((resolve, reject) => {
            req.db.db.get(
                'SELECT tweet_id FROM tweets WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tweet) {
            return res.status(404).json({
                success: false,
                error: 'Tweet not found'
            });
        }

        // Clear manual reply from database
        await new Promise((resolve, reject) => {
            req.db.db.run(
                'UPDATE tweets SET manual_reply = NULL, manual_reply_updated_at = NULL WHERE tweet_id = ?',
                [tweet.tweet_id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            data: {
                message: 'Manual reply deleted successfully'
            }
        });

    } catch (error) {
        console.error('Error deleting manual reply:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete manual reply'
        });
    }
});

/**
 * DELETE /api/tweets/:id/preview
 * Delete generated AI preview for a specific tweet
 */
router.delete('/:id/preview', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get tweet data from database
        const tweet = await new Promise((resolve, reject) => {
            req.db.db.get(
                'SELECT tweet_id FROM tweets WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!tweet) {
            return res.status(404).json({
                success: false,
                error: 'Tweet not found'
            });
        }

        // Clear generated preview from database
        await new Promise((resolve, reject) => {
            req.db.db.run(
                'UPDATE tweets SET generated_preview = NULL, preview_generated_at = NULL WHERE tweet_id = ?',
                [tweet.tweet_id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({
            success: true,
            data: {
                message: 'AI preview cleared successfully'
            }
        });

    } catch (error) {
        console.error('Error clearing AI preview:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear AI preview'
        });
    }
});

/**
 * PUT /api/tweets/:id/reset
 * Reset tweet status from 'selected' back to 'pending' and clear reply fields
 */
router.put('/:id/reset', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Reset tweet status and clear reply-related fields
        const updated = await new Promise((resolve, reject) => {
            req.db.db.run(
                `UPDATE tweets SET 
                 status = 'pending',
                 manual_reply = NULL,
                 manual_reply_updated_at = NULL,
                 generated_preview = NULL,
                 preview_generated_at = NULL,
                 reviewed_at = NULL
                 WHERE id = ?`,
                [id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });

        if (updated === 0) {
            return res.status(404).json({
                success: false,
                error: 'Tweet not found'
            });
        }

        res.json({
            success: true,
            data: {
                message: 'Tweet reset to pending status successfully',
                updated_count: updated
            }
        });

    } catch (error) {
        console.error('Error resetting tweet:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset tweet'
        });
    }
});

/**
 * PUT /api/tweets/:id/notes
 * Update notes for a specific tweet
 */
router.put('/:id/notes', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const updated = await req.db.updateTweetStatus([id], null, { notes });
        
        if (updated === 0) {
            return res.status(404).json({
                success: false,
                error: 'Tweet not found'
            });
        }

        res.json({
            success: true,
            data: {
                message: 'Notes updated successfully'
            }
        });

    } catch (error) {
        console.error('Error updating notes:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update notes'
        });
    }
});

export default router; 
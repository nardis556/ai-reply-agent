/**
 * Database Module
 * Centralized SQLite database operations for the Twitter bot
 */
import sqlite3 from 'sqlite3';
import path from 'path';

export class Database {
    constructor(dbPath = null) {
        // Use provided path or default to tweets.db in project root
        this.dbPath = dbPath || path.join(process.cwd(), 'tweets.db');
        this.db = null;
        this.isConnected = false;
    }

    /**
     * Initialize database connection and create tables
     * @returns {Promise<void>}
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Error opening database:', err.message);
                    reject(err);
                    return;
                }
                
                console.log('✅ Connected to SQLite database');
                this.isConnected = true;
                this.createTables()
                    .then(() => resolve())
                    .catch(reject);
            });
        });
    }

    /**
     * Create all necessary tables
     * @returns {Promise<void>}
     */
    async createTables() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Main tweets table with manual review workflow fields
                this.db.run(`CREATE TABLE IF NOT EXISTS tweets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    posted_at DATETIME,
                    tweet_id TEXT UNIQUE,
                    user_id TEXT,
                    username TEXT,
                    tweet_text TEXT,
                    tweet_url TEXT,
                    search_keyword TEXT,
                    video BOOLEAN DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    replied BOOLEAN DEFAULT 0,
                    reply_text TEXT,
                    reply_tweet_id TEXT,
                    reply_url TEXT,
                    reviewed_at DATETIME,
                    skipped_at DATETIME,
                    notes TEXT,
                    generated_preview TEXT,
                    preview_generated_at DATETIME,
                    manual_reply TEXT,
                    manual_reply_updated_at DATETIME
                )`, (err) => {
                    if (err) {
                        console.error('❌ Error creating tweets table:', err.message);
                        reject(err);
                        return;
                    }
                });

                // Enhanced scraper runs table for tracking all scraping sessions
                this.db.run(`CREATE TABLE IF NOT EXISTS scraper_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_number INTEGER NOT NULL,
                    started_at DATETIME NOT NULL,
                    completed_at DATETIME,
                    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
                    search_keyword TEXT,
                    total_discovered INTEGER DEFAULT 0,
                    total_saved INTEGER DEFAULT 0,
                    video_tweets INTEGER DEFAULT 0,
                    scroll_attempts INTEGER DEFAULT 0,
                    duration_seconds INTEGER DEFAULT 0,
                    error_message TEXT,
                    webhook_sent BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) {
                        console.error('❌ Error creating scraper_runs table:', err.message);
                        reject(err);
                        return;
                    }
                });

                // Keep legacy bot_runs table for backward compatibility
                this.db.run(`CREATE TABLE IF NOT EXISTS bot_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    status TEXT DEFAULT 'running',
                    tweets_found INTEGER DEFAULT 0,
                    tweets_saved INTEGER DEFAULT 0,
                    scroll_attempts INTEGER DEFAULT 0,
                    search_keyword TEXT,
                    summary TEXT
                )`, (err) => {
                    if (err) {
                        console.error('❌ Error creating bot_runs table:', err.message);
                        reject(err);
                        return;
                    }
                });

                // Bot configuration table
                this.db.run(`CREATE TABLE IF NOT EXISTS bot_config (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    config_key TEXT UNIQUE,
                    config_value TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) {
                        console.error('❌ Error creating bot_config table:', err.message);
                        reject(err);
                        return;
                    }
                    console.log('✅ Database tables created/verified');
                    resolve();
                });
            });
        });
    }

    /**
     * Get tweets by status with pagination
     * @param {string} status - Tweet status ('pending', 'replied', 'skipped')
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Items per page
     * @param {Object} filters - Additional filters
     * @returns {Promise<Object>} Paginated results
     */
    async getTweetsByStatus(status = 'pending', page = 1, limit = 20, filters = {}) {
        return new Promise((resolve, reject) => {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE status = ?';
            let params = [status];

            // Add filters
            if (filters.video !== undefined) {
                whereClause += ' AND video = ?';
                params.push(filters.video ? 1 : 0);
            }

            if (filters.search_keyword) {
                whereClause += ' AND search_keyword = ?';
                params.push(filters.search_keyword);
            }

            if (filters.username) {
                whereClause += ' AND username LIKE ?';
                params.push(`%${filters.username}%`);
            }

            // Get total count
            this.db.get(`SELECT COUNT(*) as total FROM tweets ${whereClause}`, params, (err, countRow) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Get paginated results
                const query = `SELECT * FROM tweets ${whereClause} ORDER BY posted_at DESC LIMIT ? OFFSET ?`;
                this.db.all(query, [...params, limit, offset], (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve({
                        tweets: rows,
                        pagination: {
                            page,
                            limit,
                            total: countRow.total,
                            pages: Math.ceil(countRow.total / limit)
                        }
                    });
                });
            });
        });
    }

    /**
     * Update tweet status (for manual review workflow)
     * @param {string|Array} rowIds - Database row ID(s) to update (not tweet_id)
     * @param {string} status - New status
     * @param {Object} additional - Additional fields to update
     * @returns {Promise<number>} Number of updated rows
     */
    async updateTweetStatus(rowIds, status, additional = {}) {
        return new Promise((resolve, reject) => {
            const ids = Array.isArray(rowIds) ? rowIds : [rowIds];
            const placeholders = ids.map(() => '?').join(',');
            
            let setClause = 'status = ?, reviewed_at = CURRENT_TIMESTAMP';
            let params = [status, ...ids];

            // Add additional fields
            Object.entries(additional).forEach(([key, value]) => {
                setClause += `, ${key} = ?`;
                params.splice(-ids.length, 0, value);
            });

            // Use database row id, not tweet_id
            const query = `UPDATE tweets SET ${setClause} WHERE id IN (${placeholders})`;
            
            this.db.run(query, params, function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes);
            });
        });
    }

    /**
     * Save a new tweet to the database
     * @param {Object} tweetData - Tweet data to save
     * @returns {Promise<number>} Database row ID
     */
    async saveTweet(tweetData) {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO tweets (
                tweet_id, user_id, username, tweet_text, tweet_url, 
                search_keyword, posted_at, video, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
            const params = [
                tweetData.tweetId,
                tweetData.userId,
                tweetData.username,
                tweetData.tweetText,
                tweetData.tweetUrl,
                tweetData.searchKeyword,
                tweetData.postedAt,
                tweetData.hasVideo ? 1 : 0,
                'pending'
            ];

            this.db.run(query, params, function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            });
        });
    }

    /**
     * Get database statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStats() {
        return new Promise((resolve, reject) => {
            const queries = {
                pending: "SELECT COUNT(*) as count FROM tweets WHERE status = 'pending'",
                replied: "SELECT COUNT(*) as count FROM tweets WHERE status = 'replied'",
                skipped: "SELECT COUNT(*) as count FROM tweets WHERE status = 'skipped'",
                failed: "SELECT COUNT(*) as count FROM tweets WHERE status = 'failed'",
                total: "SELECT COUNT(*) as count FROM tweets",
                videos: "SELECT COUNT(*) as count FROM tweets WHERE video = 1"
            };

            const stats = {};
            const queryKeys = Object.keys(queries);
            let completed = 0;

            queryKeys.forEach(key => {
                this.db.get(queries[key], (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    stats[key] = row.count;
                    completed++;
                    
                    if (completed === queryKeys.length) {
                        resolve(stats);
                    }
                });
            });
        });
    }

    /**
     * Start a new bot run record
     * @param {string} searchKeyword - Search keyword for this run
     * @returns {Promise<number>} Run ID
     */
    async startBotRun(searchKeyword) {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO bot_runs (search_keyword, status) VALUES (?, 'running')`;
            
            this.db.run(query, [searchKeyword], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            });
        });
    }

    /**
     * Complete a bot run record
     * @param {number} runId - Run ID to complete
     * @param {Object} summary - Run summary data
     * @returns {Promise<void>}
     */
    async completeBotRun(runId, summary) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE bot_runs SET 
                completed_at = CURRENT_TIMESTAMP,
                status = 'completed',
                tweets_found = ?,
                tweets_saved = ?,
                scroll_attempts = ?,
                summary = ?
                WHERE id = ?`;
            
            const params = [
                summary.tweetsFound || 0,
                summary.tweetsSaved || 0,
                summary.scrollAttempts || 0,
                JSON.stringify(summary),
                runId
            ];

            this.db.run(query, params, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Close database connection
     * @returns {Promise<void>}
     */
    async close() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }

            this.db.close((err) => {
                if (err) {
                    console.error('❌ Error closing database:', err.message);
                    reject(err);
                    return;
                }
                
                console.log('✅ Database connection closed');
                this.isConnected = false;
                resolve();
            });
        });
    }

    /**
     * Check if a tweet exists in the database
     * @param {string} tweetId - Tweet ID to check
     * @returns {Promise<boolean>} True if tweet exists
     */
    async tweetExists(tweetId) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT 1 FROM tweets WHERE tweet_id = ?", [tweetId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(!!row);
            });
        });
    }

    /**
     * Start a new scraper run record
     * @param {number} runNumber - Run number
     * @param {string} searchKeyword - Search keyword for this run
     * @returns {Promise<number>} Run ID
     */
    async startScraperRun(runNumber, searchKeyword) {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO scraper_runs (
                run_number, started_at, search_keyword, status
            ) VALUES (?, CURRENT_TIMESTAMP, ?, 'running')`;
            
            this.db.run(query, [runNumber, searchKeyword], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            });
        });
    }

    /**
     * Complete a scraper run record
     * @param {number} runId - Run ID to complete
     * @param {Object} result - Run result data
     * @returns {Promise<void>}
     */
    async completeScraperRun(runId, result) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE scraper_runs SET 
                completed_at = CURRENT_TIMESTAMP,
                status = ?,
                total_discovered = ?,
                total_saved = ?,
                video_tweets = ?,
                scroll_attempts = ?,
                duration_seconds = ?,
                error_message = ?,
                webhook_sent = ?
                WHERE id = ?`;
            
            const params = [
                result.success ? 'completed' : 'failed',
                result.totalDiscovered || 0,
                result.totalSaved || 0,
                result.videoTweets || 0,
                result.scrollAttempts || 0,
                result.durationSeconds || 0,
                result.error || null,
                result.webhookSent ? 1 : 0,
                runId
            ];

            this.db.run(query, params, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Get recent scraper runs with optional limit and offset
     * @param {number} limit - Maximum number of runs to return
     * @param {number} offset - Number of records to skip
     * @returns {Promise<Array>} Array of scraper run records
     */
    async getScraperRuns(limit = 50, offset = 0) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM scraper_runs 
                          ORDER BY started_at DESC 
                          LIMIT ? OFFSET ?`;
            
            this.db.all(query, [limit, offset], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }

    /**
     * Clean up old scraper runs based on retention days
     * @param {number} retentionDays - Number of days to keep
     * @returns {Promise<number>} Number of deleted records
     */
    async cleanupOldScraperRuns(retentionDays) {
        return new Promise((resolve, reject) => {
            const query = `DELETE FROM scraper_runs 
                          WHERE started_at < datetime('now', '-' || ? || ' days')`;
            
            this.db.run(query, [retentionDays], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes);
            });
        });
    }

    /**
     * Clean up old tweets based on retention days
     * @param {number} retentionDays - Number of days to keep
     * @returns {Promise<number>} Number of deleted records
     */
    async cleanupOldTweets(retentionDays) {
        return new Promise((resolve, reject) => {
            const query = `DELETE FROM tweets 
                          WHERE created_at < datetime('now', '-' || ? || ' days')
                          AND status IN ('skipped', 'replied')`;
            
            this.db.run(query, [retentionDays], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes);
            });
        });
    }

    /**
     * Get scraper statistics
     * @returns {Promise<Object>} Scraper statistics
     */
    async getScraperStats() {
        return new Promise((resolve, reject) => {
            const queries = {
                totalRuns: "SELECT COUNT(*) as count FROM scraper_runs",
                successfulRuns: "SELECT COUNT(*) as count FROM scraper_runs WHERE status = 'completed'",
                failedRuns: "SELECT COUNT(*) as count FROM scraper_runs WHERE status = 'failed'",
                totalTweetsSaved: "SELECT SUM(total_saved) as total FROM scraper_runs WHERE status = 'completed'",
                totalVideoTweets: "SELECT SUM(video_tweets) as total FROM scraper_runs WHERE status = 'completed'",
                avgDuration: "SELECT AVG(duration_seconds) as avg FROM scraper_runs WHERE status = 'completed'"
            };

            const stats = {};
            const queryKeys = Object.keys(queries);
            let completed = 0;

            queryKeys.forEach(key => {
                this.db.get(queries[key], (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    stats[key] = row.count || row.total || row.avg || 0;
                    completed++;
                    
                    if (completed === queryKeys.length) {
                        resolve(stats);
                    }
                });
            });
        });
    }

    /**
     * Save generated preview for a tweet
     * @param {string} tweetId - Tweet ID
     * @param {string} preview - Generated preview text
     * @returns {Promise<void>}
     */
    async savePreview(tweetId, preview) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE tweets SET 
                generated_preview = ?, 
                preview_generated_at = CURRENT_TIMESTAMP
                WHERE tweet_id = ?`;
            
            this.db.run(query, [preview, tweetId], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Get cached preview for a tweet
     * @param {string} tweetId - Tweet ID
     * @returns {Promise<Object|null>} Cached preview data or null
     */
    async getCachedPreview(tweetId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT generated_preview, preview_generated_at 
                          FROM tweets WHERE tweet_id = ?`;
            
            this.db.get(query, [tweetId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (row && row.generated_preview) {
                    resolve({
                        preview: row.generated_preview,
                        generatedAt: row.preview_generated_at
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    /**
     * Save manual reply for a tweet
     * @param {string} tweetId - Tweet ID
     * @param {string} manualReply - Manual reply text
     * @returns {Promise<void>}
     */
    async saveManualReply(tweetId, manualReply) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE tweets SET 
                manual_reply = ?, 
                manual_reply_updated_at = CURRENT_TIMESTAMP
                WHERE tweet_id = ?`;
            
            this.db.run(query, [manualReply, tweetId], (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    /**
     * Get manual reply for a tweet
     * @param {string} tweetId - Tweet ID
     * @returns {Promise<Object|null>} Manual reply data or null
     */
    async getManualReply(tweetId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT manual_reply, manual_reply_updated_at 
                          FROM tweets WHERE tweet_id = ?`;
            
            this.db.get(query, [tweetId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (row && row.manual_reply) {
                    resolve({
                        reply: row.manual_reply,
                        updatedAt: row.manual_reply_updated_at
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }
}

export default Database; 
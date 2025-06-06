/**
 * Twitter Reply Service
 * Simple function to process replies to Twitter using Playwright
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs/promises';
import Database from './src/database/database.js';
import { createReplyAgent } from './src/agent/index.js';
import dotenv from 'dotenv';
dotenv.config();

// Configuration
const config = {
    headless: true,
    slowMo: parseInt(process.env.SLOW_MO) || 1000,
    delayBetweenTweets: 5000, // 5 seconds between replies
    maxRetries: 3,
};

// Status file for API integration
const REPLY_STATUS_FILE = 'reply-status.json';

/**
 * Update status file with current state
 */
async function updateStatus(status, message = '', additionalData = {}) {
    const statusData = {
        status,
        message,
        timestamp: new Date().toISOString(),
        mode: 'trigger-based',
        ...additionalData
    };

    try {
        await fs.writeFile(REPLY_STATUS_FILE, JSON.stringify(statusData, null, 2));
    } catch (error) {
        console.error('Failed to update reply status file:', error.message);
    }
}

/**
 * Get selected tweets from database
 */
async function getSelectedTweets(database) {
    return new Promise((resolve, reject) => {
        database.db.all(
            `SELECT * FROM tweets 
             WHERE status = 'selected' 
             ORDER BY created_at ASC 
             LIMIT 10`, // Process max 10 at a time
            [],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

/**
 * Update tweet reply status in database
 */
async function updateTweetReplyStatus(database, tweetId, replyText, replyTweetId = null) {
    return new Promise((resolve, reject) => {
        const replyUrl = replyTweetId ? `https://x.com/user/status/${replyTweetId}` : null;

        database.db.run(
            `UPDATE tweets SET 
             status = 'replied',
             replied = 1,
             reply_text = ?,
             reply_tweet_id = ?,
             reply_url = ?,
             reviewed_at = CURRENT_TIMESTAMP
             WHERE tweet_id = ?`,
            [replyText, replyTweetId, replyUrl, tweetId],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

/**
 * Mark tweet as failed in database
 */
async function markTweetFailed(database, tweetId, error) {
    return new Promise((resolve, reject) => {
        database.db.run(
            `UPDATE tweets SET 
             status = 'failed',
             notes = ?,
             reviewed_at = CURRENT_TIMESTAMP
             WHERE tweet_id = ?`,
            [`Reply failed: ${error}`, tweetId],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

/**
 * Get reply text for a tweet (manual reply, cached AI, or generate new)
 */
async function getReplyText(database, replyAgent, tweet) {
    // Check if there's a manual reply first
    const manualReply = await database.getManualReply(tweet.tweet_id);
    if (manualReply) {
        console.log('📝 Using manual reply');
        return manualReply.reply;
    }

    // Check for cached AI preview
    const cachedPreview = await database.getCachedPreview(tweet.tweet_id);
    if (cachedPreview) {
        console.log('💾 Using cached AI preview');
        return cachedPreview.preview;
    }

    // Generate new AI reply
    console.log('🤖 Generating new AI reply...');
    const tweetData = {
        tweet_id: tweet.tweet_id,
        username: tweet.username,
        tweet_text: tweet.tweet_text,
        video: tweet.video,
        search_keyword: tweet.search_keyword
    };

    const result = await replyAgent.generateReply(tweetData);

    // Cache the generated reply
    await database.savePreview(tweet.tweet_id, result.reply);

    return result.reply;
}

/**
 * Post reply to Twitter
 */
async function postReply(page, tweet, replyText) {
    const tweetUrl = `https://x.com/${tweet.username}/status/${tweet.tweet_id}`;
    console.log(`🌐 Navigating to: ${tweetUrl}`);

    // Navigate to tweet
    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded' });
    
    // Wait for page load
    console.log('⏳ Waiting for page to load...');
    try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch (e) {
        console.log('⚠️ Network not idle, continuing anyway...');
        await page.waitForSelector('body', { timeout: 10000 });
    }
    
    await page.waitForTimeout(2000);

    // Click reply button
    console.log('💬 Clicking reply button...');
    await page.getByTestId('reply').first().click();
    await page.waitForTimeout(1000);

    // Fill in reply text
    console.log('✏️ Filling reply text...');
    const textarea = page.getByTestId('tweetTextarea_0').first();
    await textarea.click();
    await textarea.fill(replyText);
    await page.waitForTimeout(1000);

    // Post the reply
    console.log('📤 Posting reply...');
    await page.getByTestId('tweetButton').first().click();
    await page.waitForTimeout(2000);

    // Verify reply was posted
    const tweetButtonStillVisible = await page.getByTestId('tweetButton').first().isVisible().catch(() => false);
    if (tweetButtonStillVisible) {
        throw new Error('Reply posting failed - tweet button still visible');
    }

    console.log(`✅ Reply posted successfully: "${replyText}"`);
    return true;
}

/**
 * Main function to process replies
 */
export async function processReplies() {
    console.log('\n🎬 ===== REPLY PROCESSING STARTED =====');
    
    const startTime = Date.now();
    let processed = 0;
    let successful = 0;
    let failed = 0;
    let database = null;
    let context = null;

    try {
        console.log('\n🔍 Step 1: Initializing database...');
        await updateStatus('running', 'Initializing database...');
        
        database = new Database();
        await database.initialize();
        console.log('✅ Database initialized');

        console.log('\n🔍 Step 2: Checking for tweets to reply to...');
        const selectedTweets = await getSelectedTweets(database);
        console.log(`📊 Found ${selectedTweets.length} selected tweets`);
        
        if (selectedTweets.length === 0) {
            console.log('📭 No tweets selected for reply');
            await updateStatus('completed', 'No tweets selected for reply', { 
                lastRunResult: { processed: 0, successful: 0, failed: 0 }
            });
            return { success: true, processed: 0, successful: 0, failed: 0 };
        }

        console.log('\n🚀 Step 3: Starting browser...');
        await updateStatus('running', `Processing ${selectedTweets.length} tweets...`);

        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const userDataDir = path.join(__dirname, 'browser-profile');

        context = await chromium.launchPersistentContext(userDataDir, {
            headless: config.headless,
            slowMo: config.slowMo,
            viewport: { width: 1280, height: 720 }
        });

        const page = await context.newPage();
        page.setDefaultTimeout(30000);

        // Navigate to Twitter
        await page.goto('https://x.com/home');
        await page.waitForTimeout(3000);

        console.log('\n🔄 Step 4: Processing each tweet...');
        const replyAgent = createReplyAgent();
        
        // Process each tweet
        for (const tweet of selectedTweets) {
            processed++;
            const videoIndicator = tweet.video ? '[📹 VIDEO]' : '[📝 TEXT]';

            console.log(`\n🎯 --- Processing tweet ${processed}/${selectedTweets.length} ---`);
            console.log(`👤 @${tweet.username} ${videoIndicator}`);
            console.log(`💬 ${tweet.tweet_text.substring(0, 100)}...`);

            try {
                // Get reply text
                const replyText = await getReplyText(database, replyAgent, tweet);
                console.log(`✅ Reply text: "${replyText}"`);

                // Post the reply
                await postReply(page, tweet, replyText);

                // Update database
                await updateTweetReplyStatus(database, tweet.tweet_id, replyText);
                successful++;

                console.log(`✅ Tweet ${processed} completed successfully`);

                // Wait between replies
                if (processed < selectedTweets.length) {
                    console.log(`⏳ Waiting ${config.delayBetweenTweets / 1000}s...`);
                    await page.waitForTimeout(config.delayBetweenTweets);
                }

            } catch (error) {
                console.error(`❌ Error processing tweet ${tweet.tweet_id}:`, error.message);
                await markTweetFailed(database, tweet.tweet_id, error.message);
                failed++;
            }
        }

    } catch (error) {
        console.error('❌ Error in reply processing:', error.message);
        await updateStatus('failed', `Error: ${error.message}`, {
            lastRunResult: { processed, successful, failed, error: error.message }
        });
        throw error;
    } finally {
        // Cleanup
        if (context) {
            await context.close();
            console.log('🔒 Browser closed');
        }
        
        if (database) {
            await database.close();
            console.log('🔒 Database closed');
        }

        const duration = Math.round((Date.now() - startTime) / 1000);
        
        console.log('\n--- Reply Processing Complete ---');
        console.log(`📊 Processed: ${processed} tweets`);
        console.log(`✅ Successful: ${successful} replies`);
        console.log(`❌ Failed: ${failed} replies`);
        console.log(`⏱️ Duration: ${duration} seconds`);

        await updateStatus('completed', 'Reply processing completed', {
            lastRunResult: { 
                processed, 
                successful, 
                failed, 
                duration,
                timestamp: new Date().toISOString()
            }
        });
    }

    return { success: true, processed, successful, failed };
}

// Export as default for backward compatibility
export default { processReplies };

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    processReplies().catch(console.error);
} 
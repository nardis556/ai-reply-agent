/**
 * Dedicated Twitter Scraper Service
 * Runs independently from the web server, focuses only on scraping tweets
 * Communicates via file system and database
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { setTimeout } from 'timers/promises';
import Database from './src/database/database.js';
import { extractAndLogAllTweets, scrollAndWaitForTweets, countVisibleTweets } from './src/scraper/tweet-extractor.js';

// Load configuration from .env
const config = {
    searchKeyword: process.env.SEARCH_KEYWORD || '#test_test_test_12345',
    headless: process.env.HEADLESS !== 'false', // Default to true (headless)
    slowMo: parseInt(process.env.SLOW_MO) || 1000,
    maxScrollAttempts: parseInt(process.env.MAX_SCROLL_ATTEMPTS) || 20,
    noNewTweetsScrollLimit: parseInt(process.env.NO_NEW_TWEETS_SCROLL) || 3,
    verboseLogging: process.env.VERBOSE_LOGGING === 'true',
    runContinuously: process.env.RUN_CONTINUOUSLY === 'true',
    runInterval: parseInt(process.env.RUN_INTERVAL || process.env.RUN_SCRAPER_EVERY_N_MINUTES) || 30, // minutes
    delayBetweenScrolls: parseInt(process.env.DELAY_BETWEEN_SCROLLS) || 3000,
    webhookUrl: process.env.WEBHOOK_URL || '',
    // Retention settings
    retentionDays: parseInt(process.env.RETENTION_DAYS) || 30,
    logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 90,
    autoCleanup: process.env.AUTO_CLEANUP === 'true',
    // Webhook broadcasting
    broadcastWebhook: process.env.BROADCAST_WEBHOOK === 'true'
};

// Control files
const CONTROL_FILE = './scraper-control.json';
const STATUS_FILE = './scraper-status.json';

// Global state
let isRunning = false;
let currentContext = null;
let runStats = {
    totalRuns: 0,
    successfulRuns: 0,
    lastRunTime: null,
    lastResult: null
};

console.log('🤖 Twitter Scraper Service Starting...');
console.log('📋 Configuration:');
console.log(`   Search keyword: "${config.searchKeyword}"`);
console.log(`   Headless mode: ${config.headless}`);
console.log(`   Max scroll attempts: ${config.maxScrollAttempts}`);
console.log(`   Verbose logging: ${config.verboseLogging}`);
console.log(`   Run continuously: ${config.runContinuously}`);
console.log(`   Run interval: ${config.runInterval} minutes`);
console.log(`   Data retention: ${config.retentionDays} days`);
console.log(`   Log retention: ${config.logRetentionDays} days`);
console.log(`   Auto cleanup: ${config.autoCleanup}`);
console.log(`   Webhook broadcast: ${config.broadcastWebhook}`);
console.log('');

/**
 * Perform automatic cleanup of old data
 */
async function performCleanup(database) {
    if (!config.autoCleanup) return;

    try {
        console.log('🧹 Running automatic cleanup...');
        
        const deletedTweets = await database.cleanupOldTweets(config.retentionDays);
        const deletedLogs = await database.cleanupOldScraperRuns(config.logRetentionDays);
        
        console.log(`🗑️ Cleaned up ${deletedTweets} old tweets and ${deletedLogs} old log entries`);
    } catch (error) {
        console.error('⚠️ Cleanup error:', error.message);
    }
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(summary) {
    if (!config.webhookUrl || !config.broadcastWebhook) return;

    try {
        const statusColor = summary.error ? '#FF6B6B' : summary.totalSaved > 0 ? '#4ECDC4' : '#95A5A6';
        const statusEmoji = summary.error ? '⚠️' : summary.totalSaved > 0 ? '✅' : '🔍';

        const payload = {
            attachments: [{
                color: statusColor,
                title: `${statusEmoji} Scraper Service - Run #${summary.runNumber}`,
                fields: [
                    {
                        title: '🔍 Results',
                        value: `Keyword: \`${summary.searchKeyword}\`\nTweets saved: ${summary.totalSaved}\nDuration: ${summary.duration}`,
                        short: true
                    }
                ],
                footer: 'Twitter Scraper Service',
                ts: Math.floor(Date.now() / 1000)
            }]
        };

        if (summary.error) {
            payload.attachments[0].fields.push({
                title: '❌ Error',
                value: `\`\`\`${summary.error}\`\`\``,
                short: false
            });
        }

        await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log('📢 Webhook notification sent');
    } catch (error) {
        console.error('📢 Webhook error:', error.message);
    }
}

/**
 * Update status file with enhanced timing information
 */
function updateStatus(status) {
    try {
        const now = new Date();
        const statusData = {
            ...status,
            lastUpdated: now.toISOString(),
            timestamp: now.getTime(),
            config: {
                searchKeyword: config.searchKeyword,
                runInterval: config.runInterval,
                headless: config.headless,
                runContinuously: config.runContinuously
            }
        };
        fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2));
    } catch (error) {
        console.error('Error updating status file:', error.message);
    }
}

/**
 * Check for manual refresh requests
 */
function checkForRefreshRequest() {
    try {
        if (fs.existsSync(CONTROL_FILE)) {
            const control = JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8'));
            if (control.forceRefresh) {
                console.log('🔄 Manual refresh requested');
                // Clear the flag
                control.forceRefresh = false;
                fs.writeFileSync(CONTROL_FILE, JSON.stringify(control, null, 2));
                return true;
            }
        }
    } catch (error) {
        console.error('Error checking control file:', error.message);
    }
    return false;
}

/**
 * Initialize browser with persistent profile
 */
async function initializeBrowser() {
    const userDataDir = path.join(process.cwd(), 'browser-profile');
    
    // Ensure directory exists
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
        console.log(`📁 Created browser profile directory: ${userDataDir}`);
    }

    console.log(`🚀 Launching browser (headless: ${config.headless})...`);
    console.log(`📁 Profile directory: ${userDataDir}`);

    try {
        currentContext = await chromium.launchPersistentContext(userDataDir, {
            headless: config.headless,
            slowMo: config.slowMo,
            viewport: { width: 1280, height: 720 },
            args: [
                '--no-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        console.log('✅ Browser initialized successfully');
        return currentContext;
    } catch (error) {
        console.error('❌ Failed to initialize browser:', error.message);
        throw error;
    }
}

/**
 * Run a single scraping session
 */
async function runScrapingSession(runNumber) {
    const sessionStart = Date.now();
    isRunning = true;
    
    updateStatus({
        isRunning: true,
        status: 'running',
        currentRun: runNumber,
        startTime: new Date().toISOString(),
        remainingSeconds: 0
    });

    const database = new Database();
    let context = null;
    let page = null;
    let runId = null;

    try {
        console.log(`🚀 Starting scraping session #${runNumber}`);
        
        // Initialize database
        await database.initialize();
        
        // Start database logging
        runId = await database.startScraperRun(runNumber, config.searchKeyword);
        console.log(`📝 Database logging started (run ID: ${runId})`);
        
        // Initialize browser
        console.log('🚀 Starting browser for scraping session...');
        console.log(`   Headless: ${config.headless}`);
        context = await initializeBrowser();
        console.log('📄 Creating new page...');
        page = await context.newPage();
        page.setDefaultTimeout(60000);
        console.log('✅ Page created with 60s timeout');

        // Navigate to Twitter
        console.log('📱 Going to X.com...');
        await page.goto('https://x.com/', { waitUntil: 'domcontentloaded' });

        // Wait for page load
        console.log('⏳ Waiting for page to load...');
        try {
            await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            console.log('⚠️ Network not idle, continuing anyway...');
            await page.waitForSelector('body', { timeout: 10000 });
        }

        // Check login status
        console.log('🔐 Checking login status...');
        const isLoggedIn = await page.locator('[data-testid="tweetTextarea_0"]').isVisible().catch(() => false);

        if (!isLoggedIn) {
            if (config.headless) {
                console.log('❌ Not logged in and running headless. Please login first with visible browser.');
                throw new Error('Login required - run with HEADLESS=false first to login');
            } else {
                console.log('❌ Not logged in. Waiting 30 seconds for manual login...');
                await page.waitForTimeout(30000);
            }
        } else {
            console.log('✅ Already logged in!');
        }

        // Search for tweets
        console.log(`🔍 Searching for: "${config.searchKeyword}"`);
        await page.getByTestId('SearchBox_Search_Input').click();
        await page.getByTestId('SearchBox_Search_Input').fill(config.searchKeyword);
        await page.getByTestId('SearchBox_Search_Input').press('Enter');
        await page.waitForTimeout(5000);

        // Scrape tweets with scrolling
        console.log('🔄 Starting tweet extraction...');
        let scrollAttempts = 0;
        let consecutiveNoNewTweets = 0;
        const seenTweetIds = new Set();
        let totalSaved = 0;
        let videoTweets = 0;

        while (scrollAttempts < config.maxScrollAttempts && 
               consecutiveNoNewTweets < config.noNewTweetsScrollLimit) {

            const currentTweetCount = await countVisibleTweets(page);
            console.log(`📊 Visible tweets: ${currentTweetCount} (scroll ${scrollAttempts + 1}/${config.maxScrollAttempts})`);

            // Extract current tweets
            const currentTweets = await extractAndLogAllTweets(page);
            let newTweetsInThisScroll = 0;

            for (const tweet of currentTweets) {
                if (tweet.tweetId && !seenTweetIds.has(tweet.tweetId)) {
                    seenTweetIds.add(tweet.tweetId);

                    try {
                        const exists = await database.tweetExists(tweet.tweetId);
                        if (!exists) {
                            await database.saveTweet({
                                tweetId: tweet.tweetId,
                                userId: tweet.userId || 'Unknown',
                                username: tweet.username,
                                tweetText: tweet.tweetText,
                                tweetUrl: `https://x.com/${tweet.username}/status/${tweet.tweetId}`,
                                postedAt: tweet.datetime,
                                searchKeyword: config.searchKeyword,
                                hasVideo: tweet.hasVideo
                            });

                            totalSaved++;
                            newTweetsInThisScroll++;
                            if (tweet.hasVideo) videoTweets++;

                            if (config.verboseLogging) {
                                const videoStatus = tweet.hasVideo ? '[📹 VIDEO]' : '[📝 TEXT]';
                                console.log(`   💾 SAVED: @${tweet.username} ${videoStatus}`);
                                console.log(`           "${tweet.tweetText.substring(0, 50)}..."`);
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Error saving tweet ${tweet.tweetId}:`, error.message);
                    }
                }
            }

            if (newTweetsInThisScroll > 0) {
                console.log(`   ✅ Saved ${newTweetsInThisScroll} new tweets`);
                consecutiveNoNewTweets = 0;
            } else {
                consecutiveNoNewTweets++;
                console.log(`   ⚠️ No new tweets (${consecutiveNoNewTweets}/${config.noNewTweetsScrollLimit})`);
            }

            if (consecutiveNoNewTweets >= config.noNewTweetsScrollLimit) {
                console.log(`🛑 Stopping: ${consecutiveNoNewTweets} scrolls with no new tweets`);
                break;
            }

            // Scroll down
            await scrollAndWaitForTweets(page, {
                scrollSteps: 3,
                waitTime: config.delayBetweenScrolls,
                scrollMethod: 'PageDown'
            });

            scrollAttempts++;
        }

        const sessionEnd = Date.now();
        const durationSeconds = Math.floor((sessionEnd - sessionStart) / 1000);
        const duration = `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;

        const result = {
            success: true,
            runNumber,
            totalDiscovered: seenTweetIds.size,
            totalSaved,
            videoTweets,
            scrollAttempts,
            duration,
            durationSeconds,
            searchKeyword: config.searchKeyword,
            timestamp: new Date().toISOString(),
            webhookSent: false
        };

        // Send webhook notification
        if (config.webhookUrl && config.broadcastWebhook) {
            try {
                await sendWebhookNotification(result);
                result.webhookSent = true;
            } catch (error) {
                console.error('📢 Webhook error:', error.message);
            }
        }

        // Log to database
        if (runId) {
            await database.completeScraperRun(runId, result);
            console.log('📝 Run logged to database');
        }

        // Perform cleanup if enabled
        await performCleanup(database);

        console.log('✅ Scraping session completed successfully!');
        console.log(`📊 Results: ${totalSaved} tweets saved, ${videoTweets} videos, ${duration}`);

        runStats.successfulRuns++;
        runStats.lastResult = result;

        return result;

    } catch (error) {
        console.error('❌ Scraping session failed:', error.message);
        
        const durationSeconds = Math.floor((Date.now() - sessionStart) / 1000);
        const errorResult = {
            success: false,
            runNumber,
            error: error.message,
            searchKeyword: config.searchKeyword,
            timestamp: new Date().toISOString(),
            duration: `${durationSeconds}s`,
            durationSeconds,
            webhookSent: false
        };

        // Send webhook notification
        if (config.webhookUrl && config.broadcastWebhook) {
            try {
                await sendWebhookNotification(errorResult);
                errorResult.webhookSent = true;
            } catch (webhookError) {
                console.error('📢 Webhook error:', webhookError.message);
            }
        }

        // Log to database
        if (runId) {
            try {
                await database.completeScraperRun(runId, errorResult);
                console.log('📝 Error logged to database');
            } catch (dbError) {
                console.error('📝 Database logging error:', dbError.message);
            }
        }

        runStats.lastResult = errorResult;

        return errorResult;

    } finally {
        isRunning = false;
        runStats.totalRuns++;
        runStats.lastRunTime = new Date().toISOString();

        updateStatus({
            isRunning: false,
            status: 'completed',
            lastCompletedRun: runNumber,
            totalRuns: runStats.totalRuns,
            successfulRuns: runStats.successfulRuns,
            lastRunTime: runStats.lastRunTime,
            lastRunResult: runStats.lastResult,
            remainingSeconds: 0
        });

        // Cleanup
        try {
            if (context) {
                await context.close();
                console.log('🔒 Browser closed, profile saved');
            }
            await database.close();
        } catch (error) {
            console.error('⚠️ Cleanup error:', error.message);
        }
    }
}

/**
 * Main continuous scraping loop
 */
async function runContinuousScraping() {
    console.log(`🔄 Starting continuous scraping (every ${config.runInterval} minutes)`);
    
    let runCount = 0;

    // Initialize control file
    try {
        fs.writeFileSync(CONTROL_FILE, JSON.stringify({ forceRefresh: false }, null, 2));
    } catch (error) {
        console.error('Error creating control file:', error.message);
    }

    while (true) {
        runCount++;
        console.log(`\n🚀 --- Scraping Run #${runCount} ---`);

        const result = await runScrapingSession(runCount);

        if (result.success) {
            console.log(`✅ Run ${runCount} completed: ${result.totalSaved} new tweets`);
        } else {
            console.log(`❌ Run ${runCount} failed: ${result.error}`);
        }

        console.log(`\n⏰ Waiting ${config.runInterval} minutes...`);
        console.log(`🔄 Manual refresh: modify ${CONTROL_FILE}`);

        // Wait with periodic checks for manual refresh and status updates
        const intervalMs = config.runInterval * 60 * 1000;
        const checkInterval = 5 * 1000; // Check every 5 seconds for better real-time updates
        let waited = 0;
        const waitStartTime = Date.now();
        const nextRunTime = waitStartTime + intervalMs;

        // Update status to sleeping with next run time
        updateStatus({
            isRunning: false,
            status: 'sleeping',
            lastCompletedRun: runCount,
            totalRuns: runStats.totalRuns,
            successfulRuns: runStats.successfulRuns,
            lastRunTime: runStats.lastRunTime,
            lastRunResult: runStats.lastResult,
            nextRunTime: new Date(nextRunTime).toISOString(),
            nextRunTimestamp: nextRunTime,
            remainingSeconds: Math.floor((intervalMs - waited) / 1000)
        });

        while (waited < intervalMs) {
            await setTimeout(Math.min(checkInterval, intervalMs - waited));
            waited += checkInterval;

            // Update remaining time every 5 seconds
            const remainingMs = intervalMs - waited;
            updateStatus({
                isRunning: false,
                status: 'sleeping',
                lastCompletedRun: runCount,
                totalRuns: runStats.totalRuns,
                successfulRuns: runStats.successfulRuns,
                lastRunTime: runStats.lastRunTime,
                lastRunResult: runStats.lastResult,
                nextRunTime: new Date(nextRunTime).toISOString(),
                nextRunTimestamp: nextRunTime,
                remainingSeconds: Math.floor(remainingMs / 1000)
            });

            if (checkForRefreshRequest()) {
                console.log('🔄 Manual refresh triggered!');
                break;
            }
        }
    }
}

/**
 * Main function
 */
async function main() {
    try {
        if (config.runContinuously) {
            await runContinuousScraping();
        } else {
            const result = await runScrapingSession(1);
            if (result.success) {
                console.log('🏁 Single session completed successfully');
            } else {
                console.error('❌ Single session failed');
                process.exit(1);
            }
        }
    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        updateStatus({
            isRunning: false,
            error: error.message,
            crashTime: new Date().toISOString()
        });
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    updateStatus({
        isRunning: false,
        shutdownTime: new Date().toISOString()
    });
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM...');
    updateStatus({
        isRunning: false,
        shutdownTime: new Date().toISOString()
    });
    process.exit(0);
});

// Start the service
main(); 
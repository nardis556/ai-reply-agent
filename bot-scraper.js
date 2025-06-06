/**
 * Bot Scraper Script
 * Advanced bot that scrapes tweets automatically with polling and manual refresh
 * No automatic replies - all replies are handled via the web interface
 */
import 'dotenv/config';
import Database from './src/database/database.js';
import TwitterScraper from './src/scraper/twitter-scraper.js';
import { setTimeout } from 'timers/promises';
import fs from 'fs';

// Load configuration from .env
const config = {
    searchKeyword: process.env.SEARCH_KEYWORD || '#test_test_test_12345',
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO) || 1000,
    maxScrollAttempts: parseInt(process.env.MAX_SCROLL_ATTEMPTS) || 20,
    noNewTweetsScrollLimit: parseInt(process.env.NO_NEW_TWEETS_SCROLL) || 3,
    verboseLogging: process.env.VERBOSE_LOGGING === 'true',
    runContinuously: process.env.RUN_CONTINUOUSLY === 'true',
    runInterval: parseInt(process.env.RUN_INTERVAL) || 30, // minutes
    delayBetweenScrolls: parseInt(process.env.DELAY_BETWEEN_SCROLLS) || 3000,
    webhookUrl: process.env.WEBHOOK_URL || ''
};

// Global state for polling control
let isPolling = false;
let currentScraper = null;
let pollingSummary = {
    totalRuns: 0,
    successfulRuns: 0,
    lastRunTime: null,
    lastRunResult: null,
    isRunning: false
};

// Create control file paths for communication
const CONTROL_FILE = './scraper-control.json';
const STATUS_FILE = './scraper-status.json';

console.log('🔧 Bot Scraper Configuration:');
console.log(`   Search keyword: "${config.searchKeyword}"`);
console.log(`   Headless mode: ${config.headless}`);
console.log(`   Max scroll attempts: ${config.maxScrollAttempts}`);
console.log(`   No new tweets scroll limit: ${config.noNewTweetsScrollLimit}`);
console.log(`   Verbose logging: ${config.verboseLogging}`);
console.log(`   Run continuously: ${config.runContinuously}`);
if (config.runContinuously) {
    console.log(`   Run interval: ${config.runInterval} minutes`);
}
console.log('');

/**
 * Send a fancy webhook notification with run summary
 * @param {Object} summary - Run summary data
 */
async function sendWebhookSummary(summary) {
    if (!config.webhookUrl) {
        console.log('📢 No webhook URL configured, skipping notification');
        return;
    }

    try {
        const statusColor = summary.errors > 0 ? '#FF6B6B' : summary.totalSaved > 0 ? '#4ECDC4' : '#95A5A6';
        const statusEmoji = summary.errors > 0 ? '⚠️' : summary.totalSaved > 0 ? '✅' : '🔍';

        const payload = {
            attachments: [
                {
                    color: statusColor,
                    title: `${statusEmoji} Twitter Bot Scraper Summary`,
                    title_link: 'http://localhost:3000',
                    fields: [
                        {
                            title: '🔍 Search Results',
                            value: `• Keyword: \`${summary.searchKeyword}\`\n• Scroll attempts: ${summary.scrollAttempts}\n• Unique tweets discovered: ${summary.totalDiscovered}`,
                            short: true
                        },
                        {
                            title: '💾 Database Activity',
                            value: `• New tweets saved: ${summary.totalSaved}\n• Video tweets: ${summary.videoTweets}\n• Duration: ${summary.durationFormatted}`,
                            short: true
                        },
                        {
                            title: '⏱️ Performance',
                            value: `• Run #${summary.runNumber || 'N/A'}\n• Status: ${summary.success ? 'Success' : 'Failed'}\n• Stop reason: ${summary.stopReason || 'Completed'}`,
                            short: false
                        }
                    ],
                    footer: 'Twitter Bot Scraper',
                    footer_icon: 'https://abs.twimg.com/favicons/twitter.3.ico',
                    ts: Math.floor(Date.now() / 1000)
                }
            ]
        };

        if (summary.errors && summary.error) {
            payload.attachments[0].fields.push({
                title: '❌ Error Details',
                value: `\`\`\`${summary.error}\`\`\``,
                short: false
            });
        }

        const response = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('📢 Webhook notification sent successfully');
        } else {
            console.log(`📢 Webhook failed: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('📢 Error sending webhook:', error.message);
    }
}

/**
 * Update status file for external monitoring
 */
function updateStatusFile(status) {
    try {
        const statusData = {
            ...status,
            lastUpdated: new Date().toISOString(),
            config: {
                searchKeyword: config.searchKeyword,
                runInterval: config.runInterval,
                maxScrollAttempts: config.maxScrollAttempts
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
function checkForManualRefresh() {
    try {
        if (fs.existsSync(CONTROL_FILE)) {
            const control = JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8'));
            if (control.forceRefresh) {
                console.log('🔄 Manual refresh requested via control file');
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
 * Run a single scraping session with enhanced tracking
 */
async function runSingleSession(runNumber = 1) {
    const sessionStart = Date.now();
    pollingSummary.isRunning = true;
    
    // Update status at start
    updateStatusFile({
        isRunning: true,
        currentRun: runNumber,
        totalRuns: pollingSummary.totalRuns,
        successfulRuns: pollingSummary.successfulRuns,
        startTime: new Date().toISOString()
    });

    const database = new Database();
    const scraper = new TwitterScraper({
        headless: config.headless,
        slowMo: config.slowMo,
        maxScrollAttempts: config.maxScrollAttempts,
        noNewTweetsScrollLimit: config.noNewTweetsScrollLimit,
        delayBetweenScrolls: config.delayBetweenScrolls,
        verboseLogging: config.verboseLogging
    });

    // Store globally for potential manual stop
    currentScraper = scraper;

    try {
        console.log(`🚀 Starting scraping session #${runNumber}...`);
        console.log(`🔍 Search keyword: "${config.searchKeyword}"`);
        
        // Initialize database
        await database.initialize();
        
        // Run scraping session
        const result = await scraper.runScrapingSession(database, config.searchKeyword);
        
        // Calculate session metrics
        const sessionEnd = Date.now();
        const durationMs = sessionEnd - sessionStart;
        const durationFormatted = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;

        const summary = {
            ...result.summary,
            runNumber,
            durationMs,
            durationFormatted,
            searchKeyword: config.searchKeyword,
            timestamp: new Date().toISOString()
        };

        if (result.success) {
            console.log('\n✅ Scraping session completed successfully!');
            console.log('📊 Session Summary:');
            console.log(`   Run #${runNumber} | Duration: ${durationFormatted}`);
            console.log(`   Tweets discovered: ${result.summary.totalDiscovered}`);
            console.log(`   Tweets saved: ${result.summary.totalSaved}`);
            console.log(`   Video tweets: ${result.summary.videoTweets}`);
            console.log(`   Scroll attempts: ${result.summary.scrollAttempts}`);
            console.log(`   Stop reason: ${result.summary.stopReason}`);
            console.log(`   Run ID: ${result.runId}`);
            
            pollingSummary.successfulRuns++;
        } else {
            console.error('❌ Scraping session failed:', result.error);
            summary.error = result.error;
        }

        // Update polling summary
        pollingSummary.lastRunTime = new Date().toISOString();
        pollingSummary.lastRunResult = summary;
        pollingSummary.totalRuns++;
        
        // Send webhook notification
        await sendWebhookSummary(summary);

        return { ...result, summary };

    } catch (error) {
        console.error('❌ Session error:', error.message);
        
        const errorSummary = {
            success: false,
            error: error.message,
            runNumber,
            searchKeyword: config.searchKeyword,
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - sessionStart
        };
        
        pollingSummary.lastRunTime = new Date().toISOString();
        pollingSummary.lastRunResult = errorSummary;
        pollingSummary.totalRuns++;
        
        await sendWebhookSummary(errorSummary);
        
        return errorSummary;
    } finally {
        pollingSummary.isRunning = false;
        currentScraper = null;
        
        // Update final status
        updateStatusFile({
            isRunning: false,
            lastCompletedRun: runNumber,
            totalRuns: pollingSummary.totalRuns,
            successfulRuns: pollingSummary.successfulRuns,
            lastRunTime: pollingSummary.lastRunTime,
            lastRunResult: pollingSummary.lastRunResult
        });
        
        // Cleanup
        try {
            await scraper.close();
            await database.close();
        } catch (error) {
            console.error('⚠️ Error during cleanup:', error.message);
        }
    }
}

/**
 * Run continuous scraping with intervals and manual refresh capability
 */
async function runContinuous() {
    console.log(`🔄 Starting continuous scraping mode (every ${config.runInterval} minutes)`);
    console.log(`📁 Control file: ${CONTROL_FILE}`);
    console.log(`📊 Status file: ${STATUS_FILE}`);
    
    isPolling = true;
    let runCount = 0;
    
    // Initialize control file
    try {
        fs.writeFileSync(CONTROL_FILE, JSON.stringify({ forceRefresh: false }, null, 2));
    } catch (error) {
        console.error('Error creating control file:', error.message);
    }
    
    while (isPolling) {
        runCount++;
        console.log(`\n🚀 --- Scraping Session #${runCount} ---`);
        
        const result = await runSingleSession(runCount);
        
        if (result.success) {
            const newTweets = result.summary?.totalSaved || 0;
            console.log(`✅ Session ${runCount} completed. ${newTweets} new tweets available for review.`);
        } else {
            console.log(`❌ Session ${runCount} failed: ${result.error}`);
        }
        
        // Check if we should continue polling
        if (!isPolling) {
            console.log('🛑 Polling stopped');
            break;
        }
        
        console.log(`\n⏰ Waiting ${config.runInterval} minutes before next session...`);
        console.log(`💻 Web interface: http://localhost:3000`);
        console.log(`🔄 Manual refresh: modify ${CONTROL_FILE} or restart the bot`);
        
        // Wait for the specified interval, but check for manual refresh every 30 seconds
        const intervalMs = config.runInterval * 60 * 1000;
        const checkIntervalMs = 30 * 1000; // Check every 30 seconds
        let waitedMs = 0;
        
        while (waitedMs < intervalMs && isPolling) {
            await setTimeout(Math.min(checkIntervalMs, intervalMs - waitedMs));
            waitedMs += checkIntervalMs;
            
            // Check for manual refresh request
            if (checkForManualRefresh()) {
                console.log('🔄 Manual refresh triggered! Starting next session immediately.');
                break;
            }
        }
    }
    
    console.log('🏁 Continuous scraping stopped');
}

/**
 * Stop polling gracefully
 */
function stopPolling() {
    console.log('🛑 Stopping polling...');
    isPolling = false;
    if (currentScraper) {
        currentScraper.stop();
    }
}

/**
 * Trigger manual refresh
 */
function triggerManualRefresh() {
    try {
        const control = { forceRefresh: true, timestamp: new Date().toISOString() };
        fs.writeFileSync(CONTROL_FILE, JSON.stringify(control, null, 2));
        console.log('🔄 Manual refresh triggered via control file');
        return true;
    } catch (error) {
        console.error('Error triggering manual refresh:', error.message);
        return false;
    }
}

/**
 * Main execution function
 */
async function main() {
    console.log('🤖 Bot Scraper Starting...');
    console.log('📝 Note: This bot only scrapes tweets. Use the web interface to review and send replies.');
    console.log('🌐 Web interface: http://localhost:3000 (if server is running)');
    console.log('🔄 Manual refresh: modify scraper-control.json or restart');
    console.log('');

    try {
        if (config.runContinuously) {
            await runContinuous();
        } else {
            const result = await runSingleSession(1);
            if (result.success) {
                console.log('\n🏁 Single session completed successfully. Exiting...');
            } else {
                console.error('\n❌ Single session failed. Exiting...');
                process.exit(1);
            }
        }
    } catch (error) {
        console.error('💥 Fatal error:', error.message);
        pollingSummary.isRunning = false;
        updateStatusFile({
            isRunning: false,
            error: error.message,
            crashTime: new Date().toISOString()
        });
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    stopPolling();
    updateStatusFile({
        isRunning: false,
        shutdownTime: new Date().toISOString(),
        reason: 'SIGINT'
    });
    setTimeout(() => process.exit(0), 2000); // Give time for cleanup
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    stopPolling();
    updateStatusFile({
        isRunning: false,
        shutdownTime: new Date().toISOString(),
        reason: 'SIGTERM'
    });
    setTimeout(() => process.exit(0), 2000); // Give time for cleanup
});

// Export functions for external access (e.g., API endpoints)
export { 
    triggerManualRefresh, 
    stopPolling, 
    pollingSummary, 
    runSingleSession,
    checkForManualRefresh
};

// Start the bot
main(); 
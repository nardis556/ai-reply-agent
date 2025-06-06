import 'dotenv/config';
import { chromium } from 'playwright';
import path from 'path';
import sqlite3 from 'sqlite3';
import ReplyAgent from './src/replyAgent.js';
import {
    extractAndLogAllTweets,
    extractTimelineTweets,
    extractTweetData,
    extractTweetId,
    checkTweetExists,
    saveTweet,
    saveTimelineTweets,
    getUnprocessedTweets,
    updateTweetReply
} from './src/utils.js';
import { setTimeout } from 'timers/promises';

// Load configuration from .env
const config = {
    enableReplies: process.env.ENABLE_REPLIES === 'true',
    // replyText: process.env.REPLY_TEXT || 'test reply from bot',
    replyMode: process.env.REPLY_MODE || 'ALL', // ALL, NONE, VIDEO
    searchKeyword: process.env.SEARCH_KEYWORD || '#test_test_test_12345',
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO) || 1000,
    maxScrollAttempts: parseInt(process.env.MAX_SCROLL_ATTEMPTS) || 20,
    maxTweetsPerRun: parseInt(process.env.MAX_TWEETS_PER_RUN) || 999,
    delayBetweenTweets: parseInt(process.env.DELAY_BETWEEN_TWEETS) || 2000,
    onlyVideoTweets: process.env.ONLY_VIDEO_TWEETS === 'true',
    verboseLogging: process.env.VERBOSE_LOGGING === 'true',
    noNewTweetsScrollLimit: parseInt(process.env.NO_NEW_TWEETS_SCROLL) || 3,
    webhookUrl: process.env.WEBHOOK_URL || ''
};

console.log('🔧 Configuration loaded:');
console.log(`   Replies enabled: ${config.enableReplies}`);
console.log(`   Reply mode: ${config.replyMode}`);
// console.log(`   Reply text: "${config.replyText}"`);
console.log(`   Search keyword: "${config.searchKeyword}"`);
console.log(`   Headless mode: ${config.headless}`);
console.log(`   Only video tweets: ${config.onlyVideoTweets}`);
console.log(`   Max scroll attempts: ${config.maxScrollAttempts}`);
console.log(`   No new tweets scroll limit: ${config.noNewTweetsScrollLimit}`);
console.log('');

// Initialize AI Reply Agent
const replyAgent = new ReplyAgent();

/**
 * Send a fancy Slack webhook notification with run summary
 * @param {Object} summary - Run summary data
 */
async function sendWebhookSummary(summary) {
    if (!config.webhookUrl) {
        console.log('📢 No webhook URL configured, skipping notification');
        return;
    }

    try {
        const statusColor = summary.errors > 0 ? '#FF6B6B' : summary.newTweets > 0 ? '#4ECDC4' : '#95A5A6';
        const statusEmoji = summary.errors > 0 ? '⚠️' : summary.newTweets > 0 ? '✅' : '🔍';
        
        const payload = {
            attachments: [
                {
                    color: statusColor,
                    title: `${statusEmoji} Twitter Bot Run Summary`,
                    title_link: 'https://x.com/',
                    fields: [
                        {
                            title: '🔍 Search Results',
                            value: `• Keyword: \`${summary.searchKeyword}\`\n• Scroll attempts: ${summary.scrollAttempts}\n• Unique tweets discovered: ${summary.totalDiscovered}`,
                            short: true
                        },
                        {
                            title: '💾 Database Activity',
                            value: `• New tweets saved: ${summary.newTweets}\n• Total visible: ${summary.totalVisible}\n• Video tweets: ${summary.videoTweets}`,
                            short: true
                        },
                        {
                            title: '🤖 Processing Stats',
                            value: `• Tweets processed: ${summary.processed}\n• Replies sent: ${summary.repliesSent}\n• Reply mode: \`${summary.replyMode}\``,
                            short: true
                        },
                        {
                            title: '⏱️ Performance',
                            value: `• Duration: ${summary.duration}\n• Status: ${summary.status}\n• Errors: ${summary.errors}`,
                            short: true
                        }
                    ],
                    footer: 'Twitter Bot',
                    footer_icon: 'https://abs.twimg.com/favicons/twitter.3.ico',
                    ts: Math.floor(Date.now() / 1000)
                }
            ]
        };

        if (summary.stopReason) {
            payload.attachments[0].fields.push({
                title: '🛑 Stop Reason',
                value: summary.stopReason,
                short: false
            });
        }

        if (summary.errors > 0 && summary.errorDetails) {
            payload.attachments[0].fields.push({
                title: '❌ Latest Error',
                value: `\`\`\`${summary.errorDetails}\`\`\``,
                short: false
            });
        }

        const response = await fetch(config.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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

const main = async () => {
    const startTime = Date.now();
    let runSummary = {
        searchKeyword: config.searchKeyword,
        scrollAttempts: 0,
        totalDiscovered: 0,
        newTweets: 0,
        totalVisible: 0,
        videoTweets: 0,
        processed: 0,
        repliesSent: 0,
        replyMode: config.replyMode,
        errors: 0,
        errorDetails: null,
        status: 'Success',
        stopReason: null,
        duration: '0m 0s'
    };

    // Initialize SQLite database for this run
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const dbPath = path.join(__dirname, 'tweets.db');
    const db = new sqlite3.Database(dbPath);

    // Create table if it doesn't exist
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS tweets (
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
        replied BOOLEAN DEFAULT 0,
        reply_text TEXT
      )`);
    });
    // Use persistent context to save login sessions
    const userDataDir = path.join(__dirname, 'browser-profile');

    // Launch browser with persistent profile
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: config.headless,  // From .env
        slowMo: config.slowMo,      // From .env
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    // Set longer timeouts
    page.setDefaultTimeout(60000); // 60 seconds instead of default 30

    try {
        // Navigate to X.com
        console.log('Going to X.com...');
        await page.goto('https://x.com/', { waitUntil: 'domcontentloaded' });

        // Wait for page to load with better strategy
        console.log('Waiting for page to load...');
        try {
            // Try to wait for networkidle, but with timeout
            await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            console.log('Network not idle, but continuing anyway...');
            // Wait for essential elements instead
            await page.waitForSelector('body', { timeout: 10000 });
        }

        // Check if already logged in
        console.log('Checking login status...');
        const isLoggedIn = await page.locator('[data-testid="tweetTextarea_0"]').isVisible().catch(() => false);

        if (!isLoggedIn) {
            console.log('Not logged in yet. Please login manually in the browser...');
            console.log('Waiting 30 seconds for you to login...');
            await page.waitForTimeout(30000);
        } else {
            console.log('Already logged in! Continuing with actions...');
        }

        // Search for tweets
        console.log('Starting search...');
        const searchKeyword = config.searchKeyword;
        await page.getByTestId('SearchBox_Search_Input').click();
        await page.getByTestId('SearchBox_Search_Input').fill(searchKeyword);
        await page.getByTestId('SearchBox_Search_Input').press('Enter');

        // Wait for search results
        console.log('Waiting for search results...');
        await page.waitForTimeout(5000);

        // Scroll down to load more tweets
        console.log('Scrolling to load more tweets...');
        let previousTweetCount = 0;
        let scrollAttempts = 0;
        let consecutiveNoNewTweets = 0; // Track consecutive scrolls with no new tweets
        const maxScrollAttempts = config.maxScrollAttempts; // From .env
        const noNewTweetsScrollLimit = config.noNewTweetsScrollLimit; // From .env
        const seenTweetIds = new Set(); // Track seen tweets to avoid duplicate logging
        let totalSavedTweets = 0; // Track total tweets saved to DB
        let totalVideoTweets = 0; // Track video tweets saved during scroll

        while (scrollAttempts < maxScrollAttempts && consecutiveNoNewTweets < noNewTweetsScrollLimit) {
            // Get current tweet count
            const currentTweetCount = await page.locator('[data-testid="tweet"]').count();
            console.log(`Current tweet count: ${currentTweetCount} (scroll attempt ${scrollAttempts + 1}/${maxScrollAttempts})`);

            // Extract and immediately save new tweets discovered in this scroll
            console.log('🔍 Extracting tweets from current view...');

            // Extract current tweets to check for new ones - now get ALL tweets, not just video
            const currentTweets = await extractAndLogAllTweets(page);
            let newTweetsInThisScroll = 0;

            for (const tweet of currentTweets) {
                if (tweet.tweetId && !seenTweetIds.has(tweet.tweetId)) {
                    seenTweetIds.add(tweet.tweetId);

                    // Save immediately to database to prevent loss from re-rendering
                    try {
                        const exists = await checkTweetExists(db, tweet.tweetId);
                        if (!exists) {
                            await saveTweet(db, {
                                tweetId: tweet.tweetId,
                                userId: tweet.userId || 'Unknown',
                                username: tweet.username,
                                tweetText: tweet.tweetText,
                                tweetUrl: `https://x.com/${tweet.username}/status/${tweet.tweetId}`,
                                postedAt: tweet.datetime, // Use the actual ISO datetime, not timeAgo
                                searchKeyword: searchKeyword,
                                hasVideo: tweet.hasVideo
                            });
                            totalSavedTweets++;
                            newTweetsInThisScroll++;
                            if (tweet.hasVideo) {
                                totalVideoTweets++;
                            }

                            if (config.verboseLogging) {
                                const videoStatus = tweet.hasVideo ? '[📹 VIDEO]' : '[📝 TEXT]';
                                const tweetPreview = tweet.tweetText.substring(0, 50);
                                console.log(`   💾 SAVED: @${tweet.username} (${tweet.timeAgo}) ${videoStatus}`);
                                console.log(`           "${tweetPreview}${tweetPreview.length >= 50 ? '...' : ''}"`);
                                console.log(`           ID: ${tweet.tweetId}`);
                                if (tweet.datetime) {
                                    console.log(`           Posted: ${tweet.datetime}`);
                                }
                            }
                        } else {
                            if (config.verboseLogging) {
                                console.log(`   ⏭️  SKIP: @${tweet.username} (already in DB)`);
                            }
                        }
                    } catch (error) {
                        console.error(`Error saving tweet ${tweet.tweetId}:`, error.message);
                    }
                }
            }

            if (newTweetsInThisScroll > 0) {
                console.log(`   ✅ Saved ${newTweetsInThisScroll} new tweets to database`);
                consecutiveNoNewTweets = 0; // Reset counter when new tweets are found
            } else {
                consecutiveNoNewTweets++;
                console.log(`   ⚠️  No new tweets found in this scroll (${consecutiveNoNewTweets}/${noNewTweetsScrollLimit})`);

                // Check if we've hit the consecutive no new tweets limit
                if (consecutiveNoNewTweets >= noNewTweetsScrollLimit) {
                    console.log(`🛑 Stopping scroll: ${consecutiveNoNewTweets} consecutive scrolls with no new tweets`);
                    break;
                }
            }



            previousTweetCount = currentTweetCount;

            // Scroll down
            await page.keyboard.press('PageDown');
            await page.keyboard.press('PageDown'); // Double scroll for more distance

            // Wait for new content to load
            await page.waitForTimeout(3000);

            scrollAttempts++;
        }

        console.log(`Finished scrolling after ${scrollAttempts} attempts. Total tweets saved to database: ${totalSavedTweets}`);
        console.log(`Total unique tweets discovered during search: ${seenTweetIds.size}`);

        // Update summary data
        runSummary.scrollAttempts = scrollAttempts;
        runSummary.totalDiscovered = seenTweetIds.size;
        runSummary.newTweets = totalSavedTweets;
        runSummary.videoTweets = totalVideoTweets;

        // Log why scrolling stopped
        if (consecutiveNoNewTweets >= noNewTweetsScrollLimit) {
            runSummary.stopReason = `${consecutiveNoNewTweets} consecutive scrolls with no new tweets (limit: ${noNewTweetsScrollLimit})`;
            console.log(`📋 Scroll stopped: ${runSummary.stopReason}`);
        } else if (scrollAttempts >= maxScrollAttempts) {
            runSummary.stopReason = `Reached maximum scroll attempts (${maxScrollAttempts})`;
            console.log(`📋 Scroll stopped: ${runSummary.stopReason}`);
        } else {
            runSummary.stopReason = 'DOM content unchanged';
            console.log(`📋 Scroll stopped: ${runSummary.stopReason}`);
        }

        // Remove the old timeline extraction since we're now saving during scroll
        // Extract and log ALL tweets first (for comprehensive logging)
        console.log('\n=== FINAL TWEET ANALYSIS ===');
        const allTweets = await extractAndLogAllTweets(page);
        console.log(`\nTotal tweets visible at end: ${allTweets.length}`);

        console.log('\n--- FINAL VISIBLE TWEETS ---');
        allTweets.forEach((tweet, index) => {
            const videoStatus = tweet.hasVideo ? '[📹 HAS VIDEO]' : '[📝 TEXT ONLY]';
            const tweetPreview = tweet.tweetText.substring(0, 60);
            console.log(`${tweet.index}. @${tweet.username} (${tweet.timeAgo}) ${videoStatus}`);
            console.log(`   ID: ${tweet.tweetId || 'Unknown'}`);
            console.log(`   Text: "${tweetPreview}${tweetPreview.length >= 60 ? '...' : ''}"`);
            console.log('');
        });

        // Count video vs non-video tweets
        const videoTweets = allTweets.filter(tweet => tweet.hasVideo);
        const textOnlyTweets = allTweets.filter(tweet => !tweet.hasVideo);

        console.log('--- FINAL SUMMARY ---');
        console.log(`📹 Final visible tweets with videos: ${videoTweets.length}`);
        console.log(`📝 Final visible text-only tweets: ${textOnlyTweets.length}`);
        console.log(`💾 Total tweets saved to DB during scroll: ${totalSavedTweets}`);

        // Update summary data  
        runSummary.totalVisible = seenTweetIds.size; // Use actual discovered count, not final page state
        // runSummary.videoTweets already set during scroll to be more accurate

        // Remove old timeline processing since we're doing it during scroll
        // Extract all tweets from timeline
        // console.log('Extracting tweets with videos from timeline...');
        // const timelineTweets = await extractTimelineTweets(page);
        // console.log(`Found ${timelineTweets.length} tweets with videos in timeline`);

        // // Save timeline tweets to database
        // if (timelineTweets.length > 0) {
        //     const insertedIds = await saveTimelineTweets(db, timelineTweets, searchKeyword);
        //     console.log(`Saved ${insertedIds.length} new video tweets to database`);

        //     // Log the tweets we found
        //     timelineTweets.forEach((tweet, index) => {
        //         console.log(`${index + 1}. @${tweet.username}: ${tweet.tweetText.substring(0, 50)}... (${tweet.timeAgo}) [HAS VIDEO]`);
        //     });
        // } else {
        //     console.log('No tweets with videos found for this search');
        // }

        // Get unprocessed tweets from database
        console.log('\nChecking for unprocessed tweets...');
        const unprocessedTweets = await getUnprocessedTweets(db);
        console.log(`Found ${unprocessedTweets.length} unprocessed tweets`);

        // Configuration: How many tweets to process per run
        const maxTweetsPerRun = config.maxTweetsPerRun; // From .env

        const tweetsToProcess = Math.min(unprocessedTweets.length, maxTweetsPerRun);
        console.log(`Will process ${tweetsToProcess} tweets this run`);

        // Check reply mode and filter tweets accordingly
        let tweetsToReply = unprocessedTweets;

        if (config.replyMode === 'NONE') {
            console.log('⚠️  Reply mode is NONE - will only extract data, no replies will be sent');
            tweetsToReply = unprocessedTweets; // Process all for data extraction, but skip replies
        } else if (config.replyMode === 'VIDEO') {
            console.log('🎥 Reply mode is VIDEO - will only reply to tweets with videos');
            tweetsToReply = unprocessedTweets.filter(tweet => tweet.video === 1);
            console.log(`Filtered to ${tweetsToReply.length} video tweets out of ${unprocessedTweets.length} total`);
        } else {
            console.log('📝 Reply mode is ALL - will reply to all tweets');
        }

        const finalTweetsToProcess = Math.min(tweetsToReply.length, maxTweetsPerRun);
        console.log(`Will process ${finalTweetsToProcess} tweets this run`);

        runSummary.processed = finalTweetsToProcess;

        // Process each tweet
        for (let i = 0; i < finalTweetsToProcess; i++) {
            const tweet = tweetsToReply[i];
            const videoIndicator = tweet.video ? '[📹 VIDEO]' : '[📝 TEXT]';
            console.log(`\n--- Processing tweet ${i + 1}/${finalTweetsToProcess} ---`);
            console.log(`Tweet ID: ${tweet.tweet_id}`);
            console.log(`Username: ${tweet.username} ${videoIndicator}`);
            console.log(`Text: ${tweet.tweet_text.substring(0, 100)}...`);

            try {
                // Navigate to the specific tweet
                const tweetUrl = `https://x.com/${tweet.username}/status/${tweet.tweet_id}`;
                console.log(`Navigating to: ${tweetUrl}`);
                await page.goto(tweetUrl);

                // Wait for tweet to load
                await page.waitForTimeout(3000);

                // Extract detailed tweet data (including user ID)
                const detailedData = await extractTweetData(page);

                if (detailedData.userId && detailedData.userId !== 'Unknown') {
                    // Update the tweet with user ID
                    console.log(`Found user ID: ${detailedData.userId}`);
                    db.run("UPDATE tweets SET user_id = ? WHERE tweet_id = ?", [detailedData.userId, tweet.tweet_id]);
                }

                // Determine if we should reply based on reply mode
                const shouldReply = config.enableReplies &&
                    (config.replyMode === 'ALL' ||
                        (config.replyMode === 'VIDEO' && tweet.video === 1));

                if (shouldReply) {
                    console.log('🤖 Generating AI reply...');

                    // Generate AI reply
                    const aiReplyText = await replyAgent.generateReply({
                        tweet_id: tweet.tweet_id,
                        username: tweet.username,
                        tweet_text: tweet.tweet_text,
                        video: tweet.video,
                        search_keyword: tweet.search_keyword
                    });

                    console.log(`Generated AI reply: "${aiReplyText}"`);
                    console.log('Sending reply to tweet...');

                    await page.getByTestId('reply').first().click();
                    await page.waitForTimeout(1000);

                    await page.getByTestId('tweetTextarea_0').first().click();
                    await page.getByTestId('tweetTextarea_0').first().fill(aiReplyText);

                    // Wait a moment for any autocomplete dialogs to appear
                    await page.waitForTimeout(1000);

                    // Check if reply ends with # or @ which might trigger autocomplete dialogs
                    const endsWithSpecialChar = aiReplyText.endsWith('#') || aiReplyText.endsWith('@') ||
                        aiReplyText.match(/#\w*$/) || aiReplyText.match(/@\w*$/);

                    if (endsWithSpecialChar) {
                        console.log('🔧 Reply ends with # or @, handling potential autocomplete dialogs...');

                        // Try to close any autocomplete dialogs by:
                        // 1. Pressing Escape key
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(500);

                        // 2. Click outside the textarea to close dialogs
                        await page.click('body', { position: { x: 100, y: 100 } });
                        await page.waitForTimeout(500);

                        // 3. Click back on the textarea to ensure focus
                        await page.getByTestId('tweetTextarea_0').first().click();
                        await page.waitForTimeout(500);

                        // 4. Add a space and then backspace to close any lingering dialogs
                        await page.keyboard.press('End'); // Go to end of text
                        await page.keyboard.press(' ');   // Add space
                        await page.keyboard.press('Backspace'); // Remove space
                        await page.waitForTimeout(500);
                    }

                    // Now try to click the tweet button
                    await page.getByTestId('tweetButton').first().click();

                    // Wait and verify the reply was posted by checking if the reply dialog closes
                    await page.waitForTimeout(2000);

                    // Check if reply was successful by looking for the absence of the tweet button
                    const tweetButtonStillVisible = await page.getByTestId('tweetButton').first().isVisible().catch(() => false);

                    if (tweetButtonStillVisible) {
                        console.log('⚠️  Tweet button still visible, reply may not have posted. Retrying...');

                        // Try one more time with additional dialog closing
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(500);
                        await page.getByTestId('tweetButton').first().click();
                        await page.waitForTimeout(2000);

                        const stillVisible = await page.getByTestId('tweetButton').first().isVisible().catch(() => false);
                        if (stillVisible) {
                            console.log('❌ Reply posting failed despite retry attempts');
                        } else {
                            console.log(`✅ AI reply sent (after retry): "${aiReplyText}"`);
                            runSummary.repliesSent++;
                        }
                    } else {
                        console.log(`✅ AI reply sent: "${aiReplyText}"`);
                        runSummary.repliesSent++;
                    }

                    // Update database
                    await updateTweetReply(db, tweet.tweet_id, aiReplyText);
                    console.log('Database updated');
                } else {
                    const reason = !config.enableReplies ? 'DISABLED' :
                        config.replyMode === 'NONE' ? 'MODE:NONE' :
                            config.replyMode === 'VIDEO' && !tweet.video ? 'NOT-VIDEO' : 'UNKNOWN';
                    console.log(`💬 Skipping reply (${reason})`);
                    // Still mark as processed but without reply
                    await updateTweetReply(db, tweet.tweet_id, `[NO REPLY - ${reason}]`);
                }

                // Wait between tweets
                await page.waitForTimeout(config.delayBetweenTweets);

            } catch (error) {
                console.error(`Error processing tweet ${tweet.tweet_id}:`, error.message);
                runSummary.errors++;
                runSummary.errorDetails = error.message;
            }
        }

        console.log('\n--- Processing completed! ---');

        // Keep browser open for 5 seconds
        await page.waitForTimeout(5000);

    } catch (error) {
        console.error('Error:', error);
        runSummary.errors++;
        runSummary.errorDetails = error.message;
        runSummary.status = 'Failed';
    } finally {
        // Calculate run duration
        const endTime = Date.now();
        const durationMs = endTime - startTime;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        runSummary.duration = `${minutes}m ${seconds}s`;

        // Send webhook summary
        await sendWebhookSummary(runSummary);

        await context.close();
        console.log('Profile saved! Next run will remember your login.');

        // Close database connection
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
        });
    }
}

const runEvery30Mins = async () => {
    while (true) {
        console.log('\n🔄 Starting new run...');
        await main();
        console.log('\n⏰ Waiting 30 minutes before next run...');
        // Wait 30 minutes (30 * 60 * 1000 milliseconds)
        await setTimeout(30 * 60 * 1000);
    }
}

runEvery30Mins();
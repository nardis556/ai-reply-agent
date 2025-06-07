/**
 * Twitter Scraper Controller
 * Orchestrates the complete scraping workflow with the new architecture
 */
import { firefox } from 'playwright';
import path from 'path';
import { extractAndLogAllTweets, scrollAndWaitForTweets, countVisibleTweets } from './tweet-extractor.js';

export class TwitterScraper {
    constructor(config = {}) {
        this.config = {
            headless: config.headless !== undefined ? config.headless : true,
            slowMo: config.slowMo || 1000,
            maxScrollAttempts: config.maxScrollAttempts || 20,
            noNewTweetsScrollLimit: config.noNewTweetsScrollLimit || 3,
            delayBetweenScrolls: config.delayBetweenScrolls || 3000,
            verboseLogging: config.verboseLogging || false,
            ...config
        };

        this.context = null;
        this.page = null;
        this.isRunning = false;
    }

    /**
     * Initialize the browser and page
     * @returns {Promise<void>}
     */
    async initialize() {
        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const userDataDir = path.join(__dirname, '..', '..', 'browser-profile');

        // Launch browser with persistent profile
        this.context = await firefox.launchPersistentContext(userDataDir, {
            // headless: this.config.headless,
            headless: false,
            slowMo: this.config.slowMo,
            viewport: { width: 1280, height: 720 }
        });

        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(60000); // 60 seconds

        console.log('🚀 Browser initialized');
    }

    /**
     * Navigate to Twitter and check login status
     * @returns {Promise<boolean>} True if logged in
     */
    async navigateAndCheckLogin() {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        console.log('📱 Going to X.com...');
        await this.page.goto('https://x.com/', { waitUntil: 'domcontentloaded' });

        // Wait for page to load
        console.log('⏳ Waiting for page to load...');
        try {
            await this.page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            console.log('⚠️ Network not idle, but continuing anyway...');
            await this.page.waitForSelector('body', { timeout: 10000 });
        }

        // Check login status
        console.log('🔐 Checking login status...');
        const isLoggedIn = await this.page.locator('[data-testid="tweetTextarea_0"]').isVisible().catch(() => false);

        if (!isLoggedIn) {
            console.log('❌ Not logged in yet. Please login manually in the browser...');
            console.log('⏰ Waiting 30 seconds for you to login...');
            await this.page.waitForTimeout(30000);
        } else {
            console.log('✅ Already logged in! Continuing with scraping...');
        }

        return isLoggedIn;
    }

    /**
     * Search for tweets with given keyword
     * @param {string} searchKeyword - Keyword to search for
     * @returns {Promise<void>}
     */
    async searchTweets(searchKeyword) {
        if (!this.page) {
            throw new Error('Browser not initialized');
        }

        console.log(`🔍 Starting search for: "${searchKeyword}"`);
        await this.page.getByTestId('SearchBox_Search_Input').click();
        await this.page.getByTestId('SearchBox_Search_Input').fill(searchKeyword);
        await this.page.getByTestId('SearchBox_Search_Input').press('Enter');

        // Wait for search results
        console.log('⏳ Waiting for search results...');
        await this.page.waitForTimeout(5000);
    }

    /**
     * Scrape tweets from current page with scrolling
     * @param {Database} database - Database instance to save tweets
     * @param {string} searchKeyword - Search keyword used
     * @returns {Promise<Object>} Scraping results
     */
    async scrapeTweets(database, searchKeyword) {
        if (!this.page) {
            throw new Error('Browser not initialized');
        }

        this.isRunning = true;
        console.log('🔄 Starting tweet scraping with scrolling...');

        const results = {
            totalDiscovered: 0,
            totalSaved: 0,
            videoTweets: 0,
            scrollAttempts: 0,
            stopReason: null,
            seenTweetIds: new Set()
        };

        let consecutiveNoNewTweets = 0;

        while (results.scrollAttempts < this.config.maxScrollAttempts && 
               consecutiveNoNewTweets < this.config.noNewTweetsScrollLimit &&
               this.isRunning) {

            // Get current tweet count for logging
            const currentTweetCount = await countVisibleTweets(this.page);
            console.log(`📊 Current tweet count: ${currentTweetCount} (scroll attempt ${results.scrollAttempts + 1}/${this.config.maxScrollAttempts})`);

            // Extract and save new tweets discovered in this scroll
            console.log('🔍 Extracting tweets from current view...');
            const currentTweets = await extractAndLogAllTweets(this.page);
            let newTweetsInThisScroll = 0;

            for (const tweet of currentTweets) {
                if (tweet.tweetId && !results.seenTweetIds.has(tweet.tweetId)) {
                    results.seenTweetIds.add(tweet.tweetId);

                    // Check if tweet already exists in database
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
                                searchKeyword: searchKeyword,
                                hasVideo: tweet.hasVideo
                            });

                            results.totalSaved++;
                            newTweetsInThisScroll++;
                            if (tweet.hasVideo) {
                                results.videoTweets++;
                            }

                            if (this.config.verboseLogging) {
                                const videoStatus = tweet.hasVideo ? '[📹 VIDEO]' : '[📝 TEXT]';
                                const tweetPreview = tweet.tweetText.substring(0, 50);
                                console.log(`   💾 SAVED: @${tweet.username} (${tweet.timeAgo}) ${videoStatus}`);
                                console.log(`           "${tweetPreview}${tweetPreview.length >= 50 ? '...' : ''}"`);
                                console.log(`           ID: ${tweet.tweetId}`);
                            }
                        } else {
                            if (this.config.verboseLogging) {
                                console.log(`   ⏭️  SKIP: @${tweet.username} (already in DB)`);
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Error saving tweet ${tweet.tweetId}:`, error.message);
                    }
                }
            }

            // Update results and log progress
            results.totalDiscovered = results.seenTweetIds.size;

            if (newTweetsInThisScroll > 0) {
                console.log(`   ✅ Saved ${newTweetsInThisScroll} new tweets to database`);
                consecutiveNoNewTweets = 0; // Reset counter
            } else {
                consecutiveNoNewTweets++;
                console.log(`   ⚠️  No new tweets found in this scroll (${consecutiveNoNewTweets}/${this.config.noNewTweetsScrollLimit})`);

                if (consecutiveNoNewTweets >= this.config.noNewTweetsScrollLimit) {
                    results.stopReason = `${consecutiveNoNewTweets} consecutive scrolls with no new tweets`;
                    console.log(`🛑 Stopping scroll: ${results.stopReason}`);
                    break;
                }
            }

            // Scroll down and wait
            const scrollResult = await scrollAndWaitForTweets(this.page, {
                scrollSteps: 3,
                waitTime: this.config.delayBetweenScrolls,
                scrollMethod: 'PageDown'
            });

            results.scrollAttempts++;

            if (this.config.verboseLogging) {
                console.log(`   📜 Scroll result: ${scrollResult.initialCount} → ${scrollResult.finalCount} tweets`);
            }
        }

        // Determine stop reason if not already set
        if (!results.stopReason) {
            if (results.scrollAttempts >= this.config.maxScrollAttempts) {
                results.stopReason = `Reached maximum scroll attempts (${this.config.maxScrollAttempts})`;
            } else {
                results.stopReason = 'Scraping stopped manually';
            }
        }

        this.isRunning = false;
        console.log(`🏁 Scraping completed: ${results.totalSaved} tweets saved, ${results.totalDiscovered} discovered`);
        console.log(`📋 Stop reason: ${results.stopReason}`);

        return results;
    }

    /**
     * Stop the current scraping operation
     */
    stop() {
        console.log('🛑 Stopping scraper...');
        this.isRunning = false;
    }

    /**
     * Close browser and cleanup
     * @returns {Promise<void>}
     */
    async close() {
        if (this.context) {
            await this.context.close();
            console.log('🔒 Browser closed and profile saved');
        }
    }

    /**
     * Get current scraper status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isInitialized: !!this.page,
            config: this.config
        };
    }

    /**
     * Run a complete scraping session
     * @param {Database} database - Database instance
     * @param {string} searchKeyword - Search keyword
     * @returns {Promise<Object>} Complete session results
     */
    async runScrapingSession(database, searchKeyword) {
        const sessionStart = Date.now();
        
        try {
            // Initialize if needed
            if (!this.page) {
                await this.initialize();
            }

            // Navigate and check login
            const isLoggedIn = await this.navigateAndCheckLogin();
            if (!isLoggedIn) {
                console.log('⚠️ Login may be required, but continuing...');
            }

            // Start database run tracking
            const runId = await database.startBotRun(searchKeyword);

            // Search for tweets
            await this.searchTweets(searchKeyword);

            // Scrape tweets
            const scrapingResults = await this.scrapeTweets(database, searchKeyword);

            // Complete database run tracking
            const sessionEnd = Date.now();
            const durationMs = sessionEnd - sessionStart;
            const summary = {
                ...scrapingResults,
                duration: durationMs,
                durationFormatted: `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
            };

            await database.completeBotRun(runId, {
                tweetsFound: scrapingResults.totalDiscovered,
                tweetsSaved: scrapingResults.totalSaved,
                scrollAttempts: scrapingResults.scrollAttempts,
                ...summary
            });

            return {
                success: true,
                runId,
                summary
            };

        } catch (error) {
            console.error('❌ Scraping session failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default TwitterScraper; 
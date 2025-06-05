/**
 * Extract tweet data from the current page
 * @param {Page} page - Playwright page object
 * @returns {Object} - Extracted tweet data
 */
export async function extractTweetData(page) {
    try {
        const tweetData = await page.evaluate(() => {
            // Get user info from User-Name element
            const usernameElement = document.querySelector('[data-testid="User-Name"]');
            const userText = usernameElement ? usernameElement.textContent : '';

            // Extract username from text like "nardis555@nardis555·1h"
            const usernameMatch = userText.match(/@(\w+)/);
            const displayNameMatch = userText.match(/^([^@]+)@/);

            // Get actual tweet text (not including user info)
            const tweetTextElement = document.querySelector('[data-testid="tweetText"]');
            const actualText = tweetTextElement ? tweetTextElement.textContent : '';

            // Get datetime from time element
            const timeElement = document.querySelector('time[datetime]');
            const datetime = timeElement ? timeElement.getAttribute('datetime') : null;

            // Extract user ID from various sources
            let extractedUserId = null;

            // Method 1: Look for user_id in URLs (like connect_people links)
            const userIdLinks = document.querySelectorAll('a[href*="user_id="]');
            if (userIdLinks.length > 0) {
                const href = userIdLinks[0].getAttribute('href');
                const userIdMatch = href.match(/user_id=(\d+)/);
                if (userIdMatch) {
                    extractedUserId = userIdMatch[1];
                }
            }

            // Method 2: Look for data-focusable user ID patterns
            if (!extractedUserId) {
                const focusableElements = document.querySelectorAll('[data-focusable="true"]');
                for (const element of focusableElements) {
                    const dataTestId = element.getAttribute('data-testid');
                    if (dataTestId && dataTestId.includes('UserAvatar')) {
                        // Sometimes user ID is in data attributes or nearby elements
                        const userLink = element.closest('a[href*="/"]');
                        if (userLink) {
                            const href = userLink.getAttribute('href');
                            // Look for patterns like /user/1234567890
                            const userMatch = href.match(/\/(\d{10,})/);
                            if (userMatch) {
                                extractedUserId = userMatch[1];
                                break;
                            }
                        }
                    }
                }
            }

            // Method 3: Look in the page's JSON data or script tags
            if (!extractedUserId) {
                const scripts = document.getElementsByTagName('script');
                for (const script of scripts) {
                    if (script.textContent && script.textContent.includes('"id_str"')) {
                        try {
                            // Try to find user ID in JSON data
                            const text = script.textContent;
                            const userIdMatch = text.match(/"id_str":"(\d+)"/);
                            if (userIdMatch) {
                                extractedUserId = userIdMatch[1];
                                break;
                            }
                        } catch (e) {
                            // Continue if JSON parsing fails
                        }
                    }
                }
            }

            return {
                username: usernameMatch ? usernameMatch[1] : 'Unknown',
                displayName: displayNameMatch ? displayNameMatch[1] : 'Unknown',
                tweetText: actualText,
                datetime: datetime,
                userId: extractedUserId
            };
        });

        return tweetData;
    } catch (error) {
        console.log('Could not extract tweet data:', error.message);
        return {
            username: 'Unknown',
            displayName: 'Unknown',
            tweetText: 'Unknown',
            datetime: null,
            userId: 'Unknown'
        };
    }
}

/**
 * Extract tweet ID from URL
 * @param {string} url - Current page URL
 * @returns {string} - Tweet ID or 'Unknown'
 */
export function extractTweetId(url) {
    const tweetIdMatch = url.match(/\/status\/(\d+)/);
    return tweetIdMatch ? tweetIdMatch[1] : 'Unknown';
}

/**
 * Check if tweet exists in database
 * @param {Database} db - SQLite database instance
 * @param {string} tweetId - Tweet ID to check
 * @returns {Promise<boolean>} - True if tweet exists
 */
export function checkTweetExists(db, tweetId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM tweets WHERE tweet_id = ?", [tweetId], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
    });
}

/**
 * Save tweet to database
 * @param {Database} db - SQLite database instance
 * @param {Object} tweetData - Tweet data to save
 * @returns {Promise<number>} - Database row ID
 */
export function saveTweet(db, tweetData) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO tweets (tweet_id, user_id, username, tweet_text, search_keyword, posted_at, video) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tweetData.tweetId, tweetData.userId, tweetData.username, tweetData.tweetText, tweetData.searchKeyword, tweetData.postedAt, tweetData.hasVideo ? 1 : 0],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
    });
}

/**
 * Update tweet with reply information
 * @param {Database} db - SQLite database instance
 * @param {string} tweetId - Tweet ID to update
 * @param {string} replyText - Reply text
 * @returns {Promise<number>} - Number of changes
 */
export function updateTweetReply(db, tweetId, replyText) {
    return new Promise((resolve, reject) => {
        db.run("UPDATE tweets SET replied = 1, reply_text = ? WHERE tweet_id = ?",
            [replyText, tweetId],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
    });
}

/**
 * Extract and log ALL tweets from timeline (for debugging/logging purposes)
 * @param {Page} page - Playwright page object
 * @returns {Array} - Array of all tweet data objects
 */
export async function extractAndLogAllTweets(page) {
    try {
        const allTweetsData = await page.evaluate(() => {
            const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
            const tweets = [];

            tweetElements.forEach((tweetElement, index) => {
                try {
                    // Check if this tweet contains a video player
                    const hasVideo = tweetElement.querySelector('[data-testid="videoPlayer"]');

                    // Get user info from User-Name element within this tweet
                    const usernameElement = tweetElement.querySelector('[data-testid="User-Name"]');
                    const userText = usernameElement ? usernameElement.textContent : '';

                    // Extract username from text like "nardis555@nardis555·11m"
                    const usernameMatch = userText.match(/@(\w+)/);
                    const displayNameMatch = userText.match(/^([^@]+)@/);
                    const timeMatch = userText.match(/·(\d+[smh])/);

                    // Get tweet text from this specific tweet
                    const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
                    const tweetText = tweetTextElement ? tweetTextElement.textContent : '';

                    // Try to extract tweet ID from any links in this tweet
                    let tweetId = null;
                    const statusLinks = tweetElement.querySelectorAll('a[href*="/status/"]');
                    if (statusLinks.length > 0) {
                        const href = statusLinks[0].getAttribute('href');
                        const tweetIdMatch = href.match(/\/status\/(\d+)/);
                        if (tweetIdMatch) {
                            tweetId = tweetIdMatch[1];
                        }
                    }

                    // Get datetime if available
                    const timeElement = tweetElement.querySelector('time[datetime]');
                    const datetime = timeElement ? timeElement.getAttribute('datetime') : null;

                    if (usernameMatch) {
                        tweets.push({
                            index: index + 1,
                            tweetId: tweetId,
                            username: usernameMatch[1],
                            displayName: displayNameMatch ? displayNameMatch[1] : usernameMatch[1],
                            tweetText: tweetText || 'No text content',
                            timeAgo: timeMatch ? timeMatch[1] : 'unknown',
                            datetime: datetime,
                            hasVideo: !!hasVideo,
                            userId: null
                        });
                    }
                } catch (e) {
                    console.log('Error processing individual tweet:', e.message);
                }
            });

            return tweets;
        });

        return allTweetsData;
    } catch (error) {
        console.log('Could not extract all tweets:', error.message);
        return [];
    }
}

/**
 * Extract basic tweet data from all tweets in timeline/search results
 * @param {Page} page - Playwright page object
 * @returns {Array} - Array of tweet data objects
 */
export async function extractTimelineTweets(page) {
    try {
        const tweetsData = await page.evaluate(() => {
            const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
            const tweets = [];

            tweetElements.forEach((tweetElement) => {
                try {
                    // Check if this tweet contains a video player
                    const hasVideo = tweetElement.querySelector('[data-testid="videoPlayer"]');
                    if (!hasVideo) {
                        return; // Skip tweets without videos
                    }

                    // Get user info from User-Name element within this tweet
                    const usernameElement = tweetElement.querySelector('[data-testid="User-Name"]');
                    const userText = usernameElement ? usernameElement.textContent : '';

                    // Extract username from text like "nardis555@nardis555·11m"
                    const usernameMatch = userText.match(/@(\w+)/);
                    const displayNameMatch = userText.match(/^([^@]+)@/);
                    const timeMatch = userText.match(/·(\d+[smh])/);

                    // Get tweet text from this specific tweet
                    const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
                    const tweetText = tweetTextElement ? tweetTextElement.textContent : '';

                    // Try to extract tweet ID from any links in this tweet
                    let tweetId = null;
                    const statusLinks = tweetElement.querySelectorAll('a[href*="/status/"]');
                    if (statusLinks.length > 0) {
                        const href = statusLinks[0].getAttribute('href');
                        const tweetIdMatch = href.match(/\/status\/(\d+)/);
                        if (tweetIdMatch) {
                            tweetId = tweetIdMatch[1];
                        }
                    }

                    // Get datetime if available
                    const timeElement = tweetElement.querySelector('time[datetime]');
                    const datetime = timeElement ? timeElement.getAttribute('datetime') : null;

                    if (usernameMatch && tweetText) {
                        tweets.push({
                            tweetId: tweetId,
                            username: usernameMatch[1],
                            displayName: displayNameMatch ? displayNameMatch[1] : usernameMatch[1],
                            tweetText: tweetText,
                            timeAgo: timeMatch ? timeMatch[1] : 'unknown',
                            datetime: datetime,
                            userId: null, // Will be filled when we click on the tweet
                            hasVideo: true // Flag to indicate this tweet has a video
                        });
                    }
                } catch (e) {
                    console.log('Error processing individual tweet:', e.message);
                }
            });

            return tweets;
        });

        return tweetsData;
    } catch (error) {
        console.log('Could not extract timeline tweets:', error.message);
        return [];
    }
}

/**
 * Save multiple tweets to database (bulk insert)
 * @param {Database} db - SQLite database instance
 * @param {Array} tweetsData - Array of tweet data objects
 * @param {string} searchKeyword - Search keyword used
 * @returns {Promise<Array>} - Array of database row IDs
 */
export function saveTimelineTweets(db, tweetsData, searchKeyword) {
    return new Promise((resolve, reject) => {
        const insertedIds = [];
        let completed = 0;

        if (tweetsData.length === 0) {
            resolve([]);
            return;
        }

        tweetsData.forEach((tweet, index) => {
            db.run(`INSERT OR IGNORE INTO tweets (tweet_id, user_id, username, tweet_text, search_keyword, posted_at) 
              VALUES (?, ?, ?, ?, ?, ?)`,
                [tweet.tweetId, tweet.userId, tweet.username, tweet.tweetText, searchKeyword, tweet.datetime],
                function (err) {
                    completed++;
                    if (err) {
                        console.log(`Error inserting tweet ${index}:`, err.message);
                    } else if (this.lastID) {
                        insertedIds.push(this.lastID);
                    }

                    if (completed === tweetsData.length) {
                        resolve(insertedIds);
                    }
                });
        });
    });
}

/**
 * Get unprocessed tweets from database
 * @param {Database} db - SQLite database instance
 * @returns {Promise<Array>} - Array of unprocessed tweets
 */
export function getUnprocessedTweets(db) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM tweets WHERE replied = 0 AND tweet_id IS NOT NULL ORDER BY created_at DESC",
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
    });
}

/**
 * Tweet Extraction Module
 * Handles all tweet data extraction from Twitter/X pages using Playwright
 */

/**
 * Extract detailed tweet data from the current page (individual tweet view)
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
 * Extract ALL tweets from timeline/search results (for comprehensive logging)
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
 * Extract only tweets with videos from timeline/search results
 * @param {Page} page - Playwright page object
 * @returns {Array} - Array of video tweet data objects
 */
export async function extractVideoTweets(page) {
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
        console.log('Could not extract video tweets:', error.message);
        return [];
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
 * Check if a tweet element has video content
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} - True if current tweet has video
 */
export async function checkTweetHasVideo(page) {
    try {
        const hasVideo = await page.evaluate(() => {
            const videoPlayer = document.querySelector('[data-testid="videoPlayer"]');
            return !!videoPlayer;
        });
        
        return hasVideo;
    } catch (error) {
        console.log('Could not check for video:', error.message);
        return false;
    }
}

/**
 * Count total tweets visible on current page
 * @param {Page} page - Playwright page object
 * @returns {Promise<number>} - Number of tweet elements found
 */
export async function countVisibleTweets(page) {
    try {
        const count = await page.evaluate(() => {
            return document.querySelectorAll('[data-testid="tweet"]').length;
        });
        
        return count;
    } catch (error) {
        console.log('Could not count tweets:', error.message);
        return 0;
    }
}

/**
 * Scroll page and wait for new content to load
 * @param {Page} page - Playwright page object
 * @param {Object} options - Scroll options
 * @returns {Promise<number>} - New tweet count after scroll
 */
export async function scrollAndWaitForTweets(page, options = {}) {
    const {
        scrollSteps = 3,
        waitTime = 3000,
        scrollMethod = 'PageDown'
    } = options;

    try {
        const initialCount = await countVisibleTweets(page);
        
        // Perform scrolling
        for (let i = 0; i < scrollSteps; i++) {
            await page.keyboard.press(scrollMethod);
            await page.waitForTimeout(500); // Small delay between scrolls
        }
        
        // Wait for content to load
        await page.waitForTimeout(waitTime);
        
        const finalCount = await countVisibleTweets(page);
        
        return {
            initialCount,
            finalCount,
            newTweets: Math.max(0, finalCount - initialCount)
        };
        
    } catch (error) {
        console.log('Error during scroll operation:', error.message);
        return {
            initialCount: 0,
            finalCount: 0,
            newTweets: 0
        };
    }
}

export default {
    extractTweetData,
    extractAndLogAllTweets,
    extractVideoTweets,
    extractTweetId,
    checkTweetHasVideo,
    countVisibleTweets,
    scrollAndWaitForTweets
}; 
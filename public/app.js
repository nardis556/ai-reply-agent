/**
 * Frontend JavaScript for the Manual Review Interface
 */

// Global state management
const state = {
    selectedTweets: new Set(),
    currentTab: 'review',
    pendingTweets: [],
    pendingReplies: [],
    historyTweets: [],
    skippedTweets: [],
    failedTweets: [],
    stats: {},
    filters: {
        type: 'all',
        username: ''
    },
    sortOrder: 'newest'
};

// API base URL
const API_BASE = '/api';

/**
 * Initialize the application
 */
async function initApp() {
    console.log('🚀 Initializing Twitter Bot Interface...');
    
    // Load initial data
    await Promise.all([
        loadStats(),
        loadPendingTweets(),
        loadPendingReplies(),
        loadHistory(),
        loadSkipped(),
        loadFailed(),
        loadScraperStatus(),
        loadConfig()
    ]);
    
    // Set up periodic status updates
    setInterval(loadScraperStatus, 5000); // Update every 5 seconds for real-time countdown
    
    // Set up automatic refresh for all tabs
    setupAutoRefresh();
    
    console.log('✅ App initialized successfully');
}

/**
 * Set up automatic refresh for all tabs
 */
function setupAutoRefresh() {
    // Auto-refresh pending tweets every 30 seconds
    setInterval(async () => {
        if (state.currentTab === 'review') {
            await loadStats();
            await loadPendingTweets();
        }
    }, 5000);
    
    // Auto-refresh pending replies every 5 seconds
    setInterval(async () => {
        if (state.currentTab === 'pending') {
            await loadPendingReplies();
        }
    }, 5000);
    
    // Auto-refresh history every 60 seconds
    setInterval(async () => {
        if (state.currentTab === 'history') {
            await loadHistory();
        }
    }, 5000);
    
    // Auto-refresh skipped tweets every 60 seconds
    setInterval(async () => {
        if (state.currentTab === 'skipped') {
            await loadSkipped();
        }
    }, 5000);
    
    // Auto-refresh failed tweets every 60 seconds
    setInterval(async () => {
        if (state.currentTab === 'failed') {
            await loadFailed();
        }
    }, 5000);
    
    // Refresh stats more frequently (every 15 seconds) regardless of tab
    setInterval(loadStats, 15000);
    
    console.log('✅ Auto-refresh intervals set up successfully');
}

/**
 * API request helper with error handling
 */
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        showError(`Failed to ${options.method || 'fetch'} data: ${error.message}`);
        throw error;
    }
}

/**
 * Load and display stats
 */
async function loadStats() {
    try {
        const response = await apiRequest('/tweets/stats');
        state.stats = response.data;
        updateStatsDisplay(response.data);
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

/**
 * Update stats display
 */
function updateStatsDisplay(stats) {
    document.getElementById('stat-pending').textContent = stats.pending || 0;
    document.getElementById('stat-replied').textContent = stats.replied || 0;
    document.getElementById('stat-failed').textContent = stats.failed || 0;
    document.getElementById('stat-videos').textContent = stats.videos || 0;
    document.getElementById('stat-total').textContent = stats.total || 0;
}

/**
 * Load pending tweets for review
 */
async function loadPendingTweets() {
    try {
        const response = await apiRequest('/tweets/pending');
        const newTweets = response.data?.tweets || [];
        
        // If this is the first load, do a full render
        if (state.pendingTweets.length === 0) {
            state.pendingTweets = newTweets;
            renderPendingTweets();
            return;
        }
        
        // Otherwise, update existing data smartly
        updatePendingTweetsData(newTweets);
    } catch (error) {
        document.getElementById('pending-tweets-container').innerHTML = 
            '<div class="error">Failed to load pending tweets</div>';
    }
}

/**
 * Load reply history
 */
async function loadHistory() {
    try {
        const response = await apiRequest('/tweets/history');
        state.historyTweets = response.data?.tweets || [];
        renderHistoryTweets();
    } catch (error) {
        document.getElementById('history-tweets-container').innerHTML = 
            '<div class="error">Failed to load reply history</div>';
    }
}

/**
 * Load pending replies (selected tweets)
 */
async function loadPendingReplies() {
    try {
        const response = await apiRequest('/tweets/selected');
        const newReplies = response.data?.tweets || [];
        
        // If this is the first load, do a full render
        if (state.pendingReplies.length === 0) {
            state.pendingReplies = newReplies;
            renderPendingReplies();
            return;
        }
        
        // Otherwise, update existing data smartly
        updatePendingRepliesData(newReplies);
    } catch (error) {
        document.getElementById('pending-replies-container').innerHTML = 
            '<div class="error">Failed to load pending replies</div>';
    }
}

/**
 * Load skipped tweets
 */
async function loadSkipped() {
    try {
        const response = await apiRequest('/tweets/skipped');
        state.skippedTweets = response.data?.tweets || [];
        renderSkippedTweets();
    } catch (error) {
        document.getElementById('skipped-tweets-container').innerHTML = 
            '<div class="error">Failed to load skipped tweets</div>';
    }
}

/**
 * Load failed tweets
 */
async function loadFailed() {
    try {
        const response = await apiRequest('/tweets/failed');
        state.failedTweets = response.data?.tweets || [];
        renderFailedTweets();
    } catch (error) {
        document.getElementById('failed-tweets-container').innerHTML = 
            '<div class="error">Failed to load failed tweets</div>';
    }
}

/**
 * Smart update of pending tweets data without full re-render
 */
function updatePendingTweetsData(newTweets) {
    const container = document.getElementById('pending-tweets-container');
    const existingTweetIds = new Set(state.pendingTweets.map(t => t.id));
    const newTweetIds = new Set(newTweets.map(t => t.id));
    
    // Find tweets that were removed
    const removedTweetIds = [...existingTweetIds].filter(id => !newTweetIds.has(id));
    
    // Find tweets that are new
    const addedTweets = newTweets.filter(t => !existingTweetIds.has(t.id));
    
    // Remove tweets that are no longer in the data
    removedTweetIds.forEach(tweetId => {
        const tweetElement = container.querySelector(`[data-tweet-id="${tweetId}"]`);
        if (tweetElement) {
            tweetElement.remove();
        }
        
        // Also remove the associated preview and manual reply rows
        const previewRow = document.getElementById(`preview-row-${tweetId}`);
        if (previewRow) {
            previewRow.remove();
        }
        
        const manualReplyRow = document.getElementById(`manual-reply-row-${tweetId}`);
        if (manualReplyRow) {
            manualReplyRow.remove();
        }
    });
    
    // Add new tweets to the container
    if (addedTweets.length > 0) {
        const filteredNewTweets = getFilteredTweets(addedTweets);
        const newTweetElements = filteredNewTweets.map(tweet => createTweetElement(tweet)).join('');
        
        // Check if we have a table structure
        const tableBody = container.querySelector('tbody');
        if (tableBody) {
            // Insert new tweets at the beginning of the table body
            tableBody.insertAdjacentHTML('afterbegin', newTweetElements);
        } else if (container.firstChild && !container.firstChild.classList?.contains('empty-state')) {
            // Fallback: insert at container level
            container.insertAdjacentHTML('afterbegin', newTweetElements);
        } else {
            // If container was empty, replace the empty state with a full table
            renderPendingTweets();
        }
    }
    
    // Update the state data
    state.pendingTweets = newTweets;
    
    // Handle empty state
    const filteredTweets = getFilteredTweets(newTweets);
    if (filteredTweets.length === 0 && !container.querySelector('.empty-state')) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>🎉 No pending tweets!</h3>
                <p>All caught up! Check back later or run the scraper to find new tweets.</p>
            </div>
        `;
    }
}

/**
 * Smart update of pending replies data without full re-render
 */
function updatePendingRepliesData(newReplies) {
    const container = document.getElementById('pending-replies-container');
    const existingReplyIds = new Set(state.pendingReplies.map(t => t.id));
    const newReplyIds = new Set(newReplies.map(t => t.id));
    
    // Find tweets that were removed (likely got replied to and moved to history)
    const removedReplyIds = [...existingReplyIds].filter(id => !newReplyIds.has(id));
    
    // Find tweets that are new (newly selected for reply)
    const addedReplies = newReplies.filter(t => !existingReplyIds.has(t.id));
    
    // Remove tweets that are no longer pending
    removedReplyIds.forEach(tweetId => {
        const tweetElement = container.querySelector(`[data-tweet-id="${tweetId}"]`);
        if (tweetElement) {
            tweetElement.remove();
        }
        
        // Also clean up any orphaned elements from the pending replies container
        const previewRow = document.getElementById(`preview-row-${tweetId}`);
        if (previewRow) {
            previewRow.remove();
        }
        
        const manualReplyRow = document.getElementById(`manual-reply-row-${tweetId}`);
        if (manualReplyRow) {
            manualReplyRow.remove();
        }
    });
    
    // Update existing tweets' reply data (in case manual_reply or generated_preview changed)
    newReplies.forEach(newTweet => {
        if (existingReplyIds.has(newTweet.id)) {
            const existingTweet = state.pendingReplies.find(t => t.id === newTweet.id);
            if (existingTweet && (existingTweet.manual_reply !== newTweet.manual_reply || 
                                  existingTweet.generated_preview !== newTweet.generated_preview)) {
                updatePendingReplyElement(newTweet);
            }
        }
    });
    
    // Add new tweets to the container
    if (addedReplies.length > 0) {
        const newReplyElements = addedReplies.map(tweet => createPendingReplyElement(tweet)).join('');
        
        // Check if we have a table structure
        const tableBody = container.querySelector('tbody');
        if (tableBody) {
            // Insert new tweets at the beginning of the table body
            tableBody.insertAdjacentHTML('afterbegin', newReplyElements);
        } else if (container.firstChild && !container.firstChild.classList?.contains('empty-state')) {
            // Fallback: insert at container level
            container.insertAdjacentHTML('afterbegin', newReplyElements);
        } else {
            // If container was empty, replace the empty state with a full table
            renderPendingReplies();
        }
    }
    
    // Update the state data
    state.pendingReplies = newReplies;
    
    // Handle empty state
    if (newReplies.length === 0 && !container.querySelector('.empty-state')) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>⏳ No pending replies</h3>
                <p>Tweets selected for reply will appear here. Use the Review Queue to select tweets first.</p>
            </div>
        `;
    }
}

/**
 * Update a single pending reply element with new data
 */
function updatePendingReplyElement(tweet) {
    const tweetElement = document.querySelector(`[data-tweet-id="${tweet.id}"]`);
    if (!tweetElement) return;
    
    // Determine what reply will be used
    let replyText = '';
    let replySource = '';
    
    if (tweet.manual_reply) {
        replyText = tweet.manual_reply;
        replySource = '📝 Manual Reply';
    } else if (tweet.generated_preview) {
        replyText = tweet.generated_preview;
        replySource = '🤖 AI Generated';
    } else {
        replyText = 'Reply will be generated when processing starts';
        replySource = '🤖 Will Generate';
    }
    
    // Update just the reply text section
    const replyTextElement = tweetElement.querySelector('.tweet-text:last-of-type');
    if (replyTextElement) {
        replyTextElement.innerHTML = `
            <strong>${replySource}:</strong> 
            <span style="${replyText.includes('will be generated') ? 'color: #666; font-style: italic;' : 'color: #1da1f2;'}">${escapeHtml(replyText)}</span>
        `;
    }
}

/**
 * Create HTML element for a single tweet (used for dynamic insertion)
 */
function createTweetElement(tweet) {
    return `
        <tr class="${state.selectedTweets.has(tweet.id) ? 'selected' : ''}" data-tweet-id="${tweet.id}">
            <td>
                <input type="checkbox" class="tweet-checkbox" 
                       ${state.selectedTweets.has(tweet.id) ? 'checked' : ''}
                       onchange="toggleTweetSelection(${tweet.id})">
            </td>
            <td>@${tweet.username}</td>
            <td>${formatDate(tweet.posted_at)}</td>
            <td>
                ${tweet.video ? '<span class="badge badge-video">📹VID</span>' : '<span class="badge badge-text">📝 TEXT</span>'}
            </td>
            <td class="tweet-text-cell">${escapeHtml(tweet.tweet_text)}</td>
            <td class="tweet-actions-cell">
                <a href="${tweet.tweet_url}" target="_blank" class="btn btn-primary">🔗 View</a>
                <button class="btn btn-primary" onclick="generatePreview(${tweet.id})">🤖 AI Preview</button>
                <button class="btn btn-success" onclick="toggleManualReply(${tweet.id})">✏️ Manual</button>
            </td>
        </tr>
        <tr id="preview-row-${tweet.id}" style="display: none;">
            <td colspan="6">
                <div id="preview-${tweet.id}"></div>
            </td>
        </tr>
        <tr id="manual-reply-row-${tweet.id}" style="display: none;">
            <td colspan="6">
                <div id="manual-reply-${tweet.id}" style="display: none;">
                    <div class="manual-reply-section">
                        <div class="manual-reply-header">✏️ Manual Reply:</div>
                        <textarea id="manual-reply-text-${tweet.id}" class="manual-reply-textarea" placeholder="Write your custom reply here..." maxlength="280"></textarea>
                        <div class="manual-reply-controls">
                            <span id="char-count-${tweet.id}" class="char-count">0/280</span>
                            <button class="btn btn-success btn-small" onclick="saveManualReply(${tweet.id})">💾 Save Reply</button>
                            <button class="btn btn-warning btn-small" onclick="clearManualReply(${tweet.id})">🗑️ Clear Text</button>
                            <button class="btn btn-danger btn-small" onclick="deleteManualReply(${tweet.id})">❌ Delete Saved Reply</button>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

/**
 * Create HTML element for a single pending reply
 */
function createPendingReplyElement(tweet) {
    // Determine what reply will be used
    let replyText = '';
    let replySource = '';
    
    if (tweet.manual_reply) {
        replyText = tweet.manual_reply;
        replySource = '📝 Manual Reply';
    } else if (tweet.generated_preview) {
        replyText = tweet.generated_preview;
        replySource = '🤖 AI Generated';
    } else {
        replyText = 'Reply will be generated when processing starts';
        replySource = '🤖 Will Generate';
    }

    return `
        <tr data-tweet-id="${tweet.id}">
            <td>@${tweet.username}</td>
            <td>${formatDate(tweet.reviewed_at || tweet.posted_at)}</td>
            <td>
                ${tweet.video ? '<span class="badge badge-video">📹 VIDEO</span>' : '<span class="badge badge-text">📝TXT</span>'}
            </td>
            <td class="tweet-text-cell">
                ${escapeHtml(tweet.tweet_text)}
                <br><br>
                <strong>Reply: ${replySource}</strong><br>
                <span style="${replyText.includes('will be generated') ? 'color: #666; font-style: italic;' : 'color: #1da1f2;'}">${escapeHtml(replyText)}</span>
                ${tweet.manual_reply ? ` <button onclick="deleteManualReply(${tweet.id})" class="btn-tiny btn-danger" style="margin-left: 10px;">🗑️ Clear Manual</button>` : ''}
                ${tweet.generated_preview ? ` <button onclick="clearGeneratedPreview(${tweet.id})" class="btn-tiny btn-warning" style="margin-left: 10px;">🗑️ Clear AI</button>` : ''}
            </td>
            <td class="tweet-actions-cell">
                <a href="${tweet.tweet_url}" target="_blank" class="btn btn-primary">🔗 View</a>
                ${tweet.manual_reply ? '' : `<button class="btn btn-primary" onclick="generatePreviewForPending(${tweet.id})">🤖 Generate</button>`}
                <button class="btn btn-warning" onclick="moveTweetBackToQueue(${tweet.id})">↩️ Back to Queue</button>
            </td>
        </tr>
    `;
}



/**
 * Render pending tweets (full render - only used on first load)
 */
function renderPendingTweets() {
    const container = document.getElementById('pending-tweets-container');
    const tweets = getFilteredTweets(state.pendingTweets);

    if (tweets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>🎉 No pending tweets!</h3>
                <p>All caught up! Check back later or run the scraper to find new tweets.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="tweets-table">
            <thead>
                <tr>
                    <th width="50">Select</th>
                    <th width="120">Username</th>
                    <th width="120">Posted</th>
                    <th width="80">Type</th>
                    <th>Tweet Text</th>
                    <th width="200">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tweets.map(tweet => createTweetElement(tweet)).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Render history tweets
 */
function renderHistoryTweets() {
    const container = document.getElementById('history-tweets-container');
    const tweets = state.historyTweets;

    if (tweets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>📭 No reply history yet</h3>
                <p>Replied tweets will appear here once you start sending replies.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="tweets-table">
            <thead>
                <tr>
                    <th width="120">Username</th>
                    <th width="120">Replied</th>
                    <th width="120">Type</th>
                    <th>Original Tweet / Reply</th>
                    <th width="150">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tweets.map(tweet => `
                    <tr>
                        <td>@${tweet.username}</td>
                        <td>${formatDate(tweet.reviewed_at || tweet.posted_at)}</td>
                        <td>
                            ${tweet.video ? '<span class="badge badge-video">📹 VIDEO</span>' : '<span class="badge badge-text">📝 TEXT</span>'}
                        </td>
                        <td class="tweet-text-cell">
                            ${escapeHtml(tweet.tweet_text)}
                            <br><br>
                            <strong>Reply:</strong><br>
                            <span >${escapeHtml(tweet.reply_text)}</span>
                        </td>
                        <td class="tweet-actions-cell">
                            <a href="${tweet.tweet_url}" target="_blank" class="btn btn-primary">🔗 Original</a>
                            ${tweet.reply_url ? `<a href="${tweet.reply_url}" target="_blank" class="btn btn-success">🔗 Reply</a>` : ''}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Render pending replies
 */
function renderPendingReplies() {
    const container = document.getElementById('pending-replies-container');
    const tweets = state.pendingReplies;

    if (tweets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>⏳ No pending replies</h3>
                <p>Tweets selected for reply will appear here. Use the Review Queue to select tweets first.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="tweets-table">
            <thead>
                <tr>
                    <th width="120">Username</th>
                    <th width="120">Posted</th>
                    <th width="120">Type</th>
                    <th>Original Tweet / Reply</th>
                    <th width="200">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tweets.map(tweet => createPendingReplyElement(tweet)).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Render skipped tweets
 */
function renderSkippedTweets() {
    const container = document.getElementById('skipped-tweets-container');
    const tweets = state.skippedTweets;

    if (tweets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>🗑️ No skipped tweets</h3>
                <p>Tweets you choose to skip will appear here.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="tweets-table">
            <thead>
                <tr>
                    <th width="120">Username</th>
                    <th width="120">Skipped</th>
                    <th width="80">Type</th>
                    <th>Tweet Text</th>
                    <th width="100">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tweets.map(tweet => `
                    <tr>
                        <td>@${tweet.username}</td>
                        <td>${formatDate(tweet.skipped_at)}</td>
                        <td>
                            ${tweet.video ? '<span class="badge badge-video">📹 VIDEO</span>' : '<span class="badge badge-text">📝 TEXT</span>'}
                        </td>
                        <td class="tweet-text-cell">${escapeHtml(tweet.tweet_text)}</td>
                        <td class="tweet-actions-cell">
                            <a href="${tweet.tweet_url}" target="_blank" class="btn btn-primary">🔗 View</a>
                            <button onclick="moveSkippedBackToQueue('${tweet.id}')" class="btn-small" style="background: #28a745; color: white; margin-left: 5px;">↩️ Back to Queue</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Render failed tweets
 */
function renderFailedTweets() {
    const container = document.getElementById('failed-tweets-container');
    const tweets = state.failedTweets;

    if (tweets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>❌ No failed tweets</h3>
                <p>Tweets that failed to get replies will appear here.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="tweets-table">
            <thead>
                <tr>
                    <th width="120">Username</th>
                    <th width="120">Failed</th>
                    <th width="80">Type</th>
                    <th>Tweet Text</th>
                    <th width="100">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${tweets.map(tweet => `
                    <tr>
                        <td>@${tweet.username}</td>
                        <td>${formatDate(tweet.reviewed_at)}</td>
                        <td>
                            ${tweet.video ? '<span class="badge badge-video">📹 VIDEO</span>' : '<span class="badge badge-text">📝 TEXT</span>'}
                        </td>
                        <td class="tweet-text-cell">${escapeHtml(tweet.tweet_text)}</td>
                        <td class="tweet-actions-cell">
                            <a href="${tweet.tweet_url}" target="_blank" class="btn btn-primary">🔗 View</a>
                            <button onclick="moveFailedBackToQueue('${tweet.id}')" class="btn-small" style="background: #28a745; color: white; margin-left: 5px;">↩️ Back to Queue</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Get filtered and sorted tweets based on current filters and sort order
 */
function getFilteredTweets(tweets) {
    let filtered = tweets.filter(tweet => {
        // Type filter
        if (state.filters.type === 'video' && !tweet.video) return false;
        if (state.filters.type === 'text' && tweet.video) return false;
        
        // Username filter
        if (state.filters.username && !tweet.username.toLowerCase().includes(state.filters.username.toLowerCase())) {
            return false;
        }
        
        return true;
    });
    
    // Apply sorting using posted_at timestamp
    filtered.sort((a, b) => {
        const timeA = new Date(a.posted_at || a.created_at).getTime();
        const timeB = new Date(b.posted_at || b.created_at).getTime();
        
        if (state.sortOrder === 'newest') {
            return timeB - timeA; // Newest first
        } else {
            return timeA - timeB; // Oldest first
        }
    });
    
    return filtered;
}

/**
 * Toggle tweet selection
 */
function toggleTweetSelection(tweetId) {
    if (state.selectedTweets.has(tweetId)) {
        state.selectedTweets.delete(tweetId);
    } else {
        state.selectedTweets.add(tweetId);
    }
    
    // Update visual state
    const tweetItem = document.querySelector(`[data-tweet-id="${tweetId}"]`);
    if (tweetItem) {
        tweetItem.classList.toggle('selected', state.selectedTweets.has(tweetId));
    }
}

/**
 * Select all visible tweets
 */
function selectAll() {
    const filteredTweets = getFilteredTweets(state.pendingTweets);
    filteredTweets.forEach(tweet => state.selectedTweets.add(tweet.id));
    renderPendingTweets();
}

/**
 * Clear all selections
 */
function clearSelection() {
    state.selectedTweets.clear();
    renderPendingTweets();
}

/**
 * Generate AI preview for a single tweet
 */
async function generatePreview(tweetId, forceRegenerate = false) {
    const previewContainer = document.getElementById(`preview-${tweetId}`);
    const previewRow = document.getElementById(`preview-row-${tweetId}`);
    
    previewContainer.innerHTML = '<div class="ai-preview">🤖 Generating AI preview...</div>';
    if (previewRow) previewRow.style.display = 'table-row';

    try {
        const requestBody = forceRegenerate ? { force_regenerate: true } : {};
        const response = await apiRequest(`/tweets/${tweetId}/preview`, { 
            method: 'POST',
            body: JSON.stringify(requestBody)
        });
        
        const isCached = response.data.cached;
        const cacheIcon = isCached ? '💾' : '✨';
        const cacheText = isCached ? '(Cached)' : '(Newly Generated)';
        const regenerateButton = isCached ? 
            `<button onclick="generatePreview('${tweetId}', true)" class="btn-small" style="margin-left: 10px;">🔄 Regenerate</button>` : '';
        
        previewContainer.innerHTML = `
            <div class="ai-preview">
                <div class="ai-preview-header">
                    ${cacheIcon} AI Reply Options: <span style="font-size: 0.8em; color: #666;">${cacheText}</span>
                    ${regenerateButton}
                    <button onclick="clearGeneratedPreview('${tweetId}')" class="btn-small" style="margin-left: 10px; background: #dc3545; color: white;">🗑️ Clear</button>
                </div>
                ${response.data.replies.map((reply, index) => `
                    <div class="ai-preview-text" style="margin-bottom: 10px;">
                        <strong>Option ${index + 1}:</strong> ${escapeHtml(reply.reply)}
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        previewContainer.innerHTML = '<div class="ai-preview error">❌ Failed to generate preview</div>';
    }
}

/**
 * Generate AI preview for a tweet in the pending tab
 */
async function generatePreviewForPending(tweetId) {
    try {
        showSuccess('🤖 Generating AI preview...');
        
        const response = await apiRequest(`/tweets/${tweetId}/preview`, { 
            method: 'POST',
            body: JSON.stringify({})
        });
        
        showSuccess('✅ AI preview generated! Refreshing pending tweets...');
        
        // Refresh the pending tab to show the new preview
        await loadPendingReplies();
        
    } catch (error) {
        showError('Failed to generate AI preview. Please try again.');
    }
}

/**
 * Toggle manual reply section visibility
 */
async function toggleManualReply(tweetId) {
    const manualReplyDiv = document.getElementById(`manual-reply-${tweetId}`);
    const manualReplyRow = document.getElementById(`manual-reply-row-${tweetId}`);
    const isVisible = manualReplyDiv.style.display !== 'none';
    
    if (isVisible) {
        manualReplyDiv.style.display = 'none';
        if (manualReplyRow) manualReplyRow.style.display = 'none';
    } else {
        manualReplyDiv.style.display = 'block';
        if (manualReplyRow) manualReplyRow.style.display = 'table-row';
        
        // Load existing manual reply if it exists
        await loadManualReply(tweetId);
        
        // Set up character counter
        const textarea = document.getElementById(`manual-reply-text-${tweetId}`);
        const charCount = document.getElementById(`char-count-${tweetId}`);
        
        const updateCharCount = () => {
            const count = textarea.value.length;
            charCount.textContent = `${count}/280`;
            charCount.style.color = count > 280 ? '#dc3545' : count > 240 ? '#ffc107' : '#666';
        };
        
        textarea.addEventListener('input', updateCharCount);
        updateCharCount();
    }
}

/**
 * Load existing manual reply for a tweet
 */
async function loadManualReply(tweetId) {
    try {
        const response = await apiRequest(`/tweets/${tweetId}/manual-reply`);
        
        if (response.success && response.data.manual_reply) {
            const textarea = document.getElementById(`manual-reply-text-${tweetId}`);
            textarea.value = response.data.manual_reply;
            
            // Update character count
            const charCount = document.getElementById(`char-count-${tweetId}`);
            const count = textarea.value.length;
            charCount.textContent = `${count}/280`;
            charCount.style.color = count > 280 ? '#dc3545' : count > 240 ? '#ffc107' : '#666';
        }
    } catch (error) {
        console.error('Failed to load manual reply:', error);
    }
}

/**
 * Save manual reply for a tweet
 */
async function saveManualReply(tweetId) {
    const textarea = document.getElementById(`manual-reply-text-${tweetId}`);
    const manualReply = textarea.value.trim();
    
    if (!manualReply) {
        showError('Please enter a reply before saving');
        return;
    }
    
    if (manualReply.length > 280) {
        showError('Reply exceeds 280 character limit');
        return;
    }
    
    try {
        const response = await apiRequest(`/tweets/${tweetId}/manual-reply`, {
            method: 'PUT',
            body: JSON.stringify({ manual_reply: manualReply })
        });
        
        if (response.success) {
            showSuccess('Manual reply saved successfully!');
            
            // Update button to show it has a saved reply
            const button = document.querySelector(`button[onclick="toggleManualReply(${tweetId})"]`);
            if (button) {
                button.textContent = '✏️ Edit Manual Reply';
                button.classList.add('has-manual-reply');
            }
            

        } else {
            showError(response.error || 'Failed to save manual reply');
        }
    } catch (error) {
        showError('Failed to save manual reply');
    }
}

/**
 * Clear manual reply text (just the textarea, doesn't delete from database)
 */
async function clearManualReply(tweetId) {
    const textarea = document.getElementById(`manual-reply-text-${tweetId}`);
    textarea.value = '';
    
    // Update character count
    const charCount = document.getElementById(`char-count-${tweetId}`);
    charCount.textContent = '0/280';
    charCount.style.color = '#666';
}

/**
 * Delete saved manual reply from database
 */
async function deleteManualReply(tweetId) {
    if (!confirm('Are you sure you want to delete the saved manual reply?')) {
        return;
    }

    try {
        const response = await apiRequest(`/tweets/${tweetId}/manual-reply`, {
            method: 'DELETE'
        });

        if (response.success) {
            showSuccess('✅ Manual reply deleted successfully!');
            
            // Clear the textarea as well
            const textarea = document.getElementById(`manual-reply-text-${tweetId}`);
            if (textarea) {
                textarea.value = '';
            }
            
            // Update character count
            const charCount = document.getElementById(`char-count-${tweetId}`);
            if (charCount) {
                charCount.textContent = '0/280';
                charCount.style.color = '#666';
            }
            
            // Reset button text
            const button = document.querySelector(`button[onclick="toggleManualReply(${tweetId})"]`);
            if (button) {
                button.textContent = '✏️ Write Manual Reply';
                button.classList.remove('has-manual-reply');
            }
            
            // Refresh data to show updated state
            await Promise.all([loadPendingTweets(), loadPendingReplies()]);
        } else {
            showError('Failed to delete manual reply');
        }
    } catch (error) {
        showError('Failed to delete manual reply. Please try again.');
    }
}

/**
 * Clear generated AI preview
 */
async function clearGeneratedPreview(tweetId) {
    if (!confirm('Are you sure you want to clear the generated AI preview?')) {
        return;
    }

    try {
        const response = await apiRequest(`/tweets/${tweetId}/preview`, {
            method: 'DELETE'
        });

        if (response.success) {
            showSuccess('✅ AI preview cleared successfully!');
            
            // Clear the preview container
            const previewContainer = document.getElementById(`preview-${tweetId}`);
            if (previewContainer) {
                previewContainer.innerHTML = '';
            }
            
            // Refresh data to show updated state
            await Promise.all([loadPendingTweets(), loadPendingReplies()]);
        } else {
            showError('Failed to clear AI preview');
        }
    } catch (error) {
        showError('Failed to clear AI preview. Please try again.');
    }
}

/**
 * Move tweet back from pending to review queue
 */
async function moveTweetBackToQueue(tweetId) {
    if (!confirm('Move this tweet back to the review queue? This will remove it from pending replies.')) {
        return;
    }

    try {
        const response = await apiRequest(`/tweets/${tweetId}/reset`, {
            method: 'PUT'
        });

        if (response.success) {
            showSuccess('✅ Tweet moved back to review queue!');
            
            // Refresh all tabs to show updated state
            await Promise.all([loadStats(), loadPendingTweets(), loadPendingReplies()]);
        } else {
            showError('Failed to move tweet back to queue');
        }
    } catch (error) {
        showError('Failed to move tweet back to queue. Please try again.');
    }
}

/**
 * Move skipped tweet back to pending queue
 */
async function moveSkippedBackToQueue(tweetId) {
    if (!confirm('Move this tweet back to the review queue? It will be available for selection again.')) {
        return;
    }

    try {
        const response = await apiRequest(`/tweets/${tweetId}/reset`, {
            method: 'PUT'
        });

        if (response.success) {
            showSuccess('✅ Tweet moved back to review queue!');
            
            // Refresh relevant tabs to show updated state
            await Promise.all([loadStats(), loadPendingTweets(), loadSkipped()]);
        } else {
            showError('Failed to move tweet back to queue');
        }
    } catch (error) {
        showError('Failed to move tweet back to queue. Please try again.');
    }
}

/**
 * Move a failed tweet back to the pending queue
 */
async function moveFailedBackToQueue(tweetId) {
    if (!confirm('Move this failed tweet back to the review queue? It will be available for selection again.')) {
        return;
    }

    try {
        const response = await apiRequest(`/tweets/${tweetId}/reset`, {
            method: 'PUT'
        });

        if (response.success) {
            showSuccess('✅ Failed tweet moved back to review queue!');
            
            // Refresh relevant tabs to show updated state
            await Promise.all([loadStats(), loadPendingTweets(), loadFailed()]);
        } else {
            showError('Failed to move tweet back to queue');
        }
    } catch (error) {
        showError('Failed to move tweet back to queue. Please try again.');
    }
}

/**
 * Generate previews for all selected tweets
 */
async function generatePreviewsForSelected() {
    if (state.selectedTweets.size === 0) {
        showError('Please select tweets first');
        return;
    }

    const promises = [...state.selectedTweets].map(tweetId => generatePreview(tweetId));
    await Promise.all(promises);
}

/**
 * Reply to selected tweets
 */
async function replyToSelected() {
    if (state.selectedTweets.size === 0) {
        showError('Please select tweets to reply to');
        return;
    }

    const selectedIds = [...state.selectedTweets];
    
    try {
        showSuccess(`Selecting ${selectedIds.length} tweets for reply...`);
        
        const response = await apiRequest('/tweets/reply', {
            method: 'POST',
            body: JSON.stringify({ tweet_ids: selectedIds })
        });

        // Show success message
        const data = response.data;
        showSuccess(`✅ ${data.tweet_count} tweets selected for reply! ${data.action_required ? '💡 ' + data.action_required : ''}`);

        // No need to load reply status anymore since we removed that feature
        
        // Clear selection and refresh data
        state.selectedTweets.clear();
        await Promise.all([loadStats(), loadPendingTweets(), loadPendingReplies(), loadHistory()]);
        
    } catch (error) {
        showError('Failed to select tweets for reply. Please try again.');
    }
}

/**
 * Skip selected tweets
 */
async function skipSelected() {
    if (state.selectedTweets.size === 0) {
        showError('Please select tweets to skip');
        return;
    }

    const selectedIds = [...state.selectedTweets];
    
    try {
        const response = await apiRequest('/tweets/skip', {
            method: 'PUT',
            body: JSON.stringify({ tweet_ids: selectedIds })
        });

        showSuccess(`Skipped ${response.data.updated_count} tweets`);
        
        // Clear selection and refresh data
        state.selectedTweets.clear();
        await Promise.all([loadStats(), loadPendingTweets(), loadSkipped()]);
        
    } catch (error) {
        showError('Failed to skip tweets. Please try again.');
    }
}

/**
 * Show/hide tabs
 */
function showTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    
    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    state.currentTab = tabName;
    state.selectedTweets.clear(); // Clear selection when switching tabs
    
    // Trigger immediate refresh for the active tab
    switch(tabName) {
        case 'review':
            refreshTweets();
            break;
        case 'pending':
            refreshPending();
            break;
        case 'history':
            refreshHistory();
            break;
        case 'skipped':
            refreshSkipped();
            break;
        case 'failed':
            refreshFailed();
            break;
    }
}

/**
 * Apply filters
 */
function applyFilters() {
    state.filters.type = document.getElementById('filter-type').value;
    state.filters.username = document.getElementById('filter-username').value;
    
    if (state.currentTab === 'review') {
        renderPendingTweets();
    }
}

/**
 * Apply sorting
 */
function applySorting() {
    state.sortOrder = document.getElementById('sort-order').value;
    
    // Re-render the current tab with new sorting
    switch(state.currentTab) {
        case 'review':
            renderPendingTweets();
            break;
        case 'pending':
            renderPendingReplies();
            break;
        case 'history':
            renderHistoryTweets();
            break;
        case 'skipped':
            renderSkippedTweets();
            break;
        case 'failed':
            renderFailedTweets();
            break;
    }
}

/**
 * Load scraper status with enhanced timing info
 */
async function loadScraperStatus() {
    try {
        const response = await apiRequest('/scraper/status');
        updateScraperDisplay(response.data);
    } catch (error) {
        console.error('Failed to load scraper status:', error);
        updateScraperDisplay({
            isRunning: false,
            status: 'error',
            message: 'Status unavailable'
        });
    }
}

/**
 * Trigger replies for selected tweets
 */
async function triggerReplies() {
    const btn = document.getElementById('send-replies-btn');
    
    // Disable button (grey it out)
    btn.disabled = true;
    btn.innerHTML = 'Sending Replies...';
    
    try {
        const response = await apiRequest('/reply/refresh', { method: 'POST' });
        
        if (response.success) {
            showSuccess('Reply processing triggered! Selected tweets will be processed.');
            
            // Update button to show success briefly
            btn.innerHTML = '✅ Replies Sent!';
            
            // Refresh data after a delay
            setTimeout(async () => {
                await Promise.all([loadStats(), loadPendingTweets(), loadHistory()]);
            }, 3000);
        } else {
            throw new Error(response.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Failed to trigger replies:', error);
        showError('Failed to trigger reply processing. Please try again.');
        
        // Reset button immediately on error
        btn.disabled = false;
        btn.innerHTML = '📤 Send Replies';
        return;
    }
    
    // Start countdown timer
    let remainingSeconds = 15;
    const countdownInterval = setInterval(() => {
        remainingSeconds--;
        
        if (remainingSeconds <= 0) {
            // Re-enable button after countdown
            clearInterval(countdownInterval);
            btn.disabled = false;
            btn.innerHTML = '📤 Send Replies';
        } else {
            // Show countdown
            btn.innerHTML = `Wait ${remainingSeconds}s`;
        }
    }, 1000);
}

/**
 * Update scraper status display with countdown
 */
function updateScraperDisplay(status) {
    const iconElement = document.getElementById('scraper-status-icon');
    const textElement = document.getElementById('scraper-status-text');
    const countdownElement = document.getElementById('countdown-display');
    
    // Remove all status classes
    iconElement.className = iconElement.className.replace(/status-\w+/g, '');
    
    let icon, text, countdown = '';
    
    switch (status.status) {
        case 'running':
            icon = '🔄';
            text = 'Running...';
            iconElement.classList.add('status-running');
            if (status.currentRun) {
                countdown = `Run #${status.currentRun}`;
            }
            break;
            
        case 'sleeping':
            icon = '😴';
            text = 'Sleeping';
            iconElement.classList.add('status-sleeping');
            if (status.remainingSeconds > 0) {
                countdown = formatCountdown(status.remainingSeconds);
                // Update countdown every second
                startCountdownTimer(status.remainingSeconds);
            }
            break;
            
        case 'ready':
            icon = '⚡';
            text = 'Ready to run';
            iconElement.classList.add('status-ready');
            countdown = 'Starting soon...';
            break;
            
        case 'completed':
            icon = '✅';
            text = 'Completed';
            iconElement.classList.add('status-sleeping');
            if (status.lastRunResult) {
                countdown = `${status.lastRunResult.totalSaved || 0} tweets saved`;
            }
            break;
            
        case 'error':
        case 'failed':
            icon = '❌';
            text = 'Error';
            iconElement.classList.add('status-error');
            countdown = 'Click to retry';
            break;
            
        default:
            icon = '❓';
            text = 'Unknown';
            iconElement.classList.add('status-unknown');
            countdown = 'Click to refresh';
    }
    
    iconElement.textContent = icon;
    textElement.textContent = text;
    countdownElement.textContent = countdown;
    
    // Update tooltip with detailed info
    const statusCard = iconElement.closest('.stat-card');
    const tooltipLines = [
        `Status: ${text}`,
        `Total runs: ${status.totalRuns || 0}`,
        `Successful: ${status.successfulRuns || 0}`
    ];
    
    if (status.lastRunTime) {
        tooltipLines.push(`Last run: ${formatDate(status.lastRunTime)}`);
    }
    
    if (status.config?.runInterval) {
        tooltipLines.push(`Interval: ${status.config.runInterval}min`);
    }
    
    statusCard.title = tooltipLines.join('\n');
}

/**
 * Format countdown seconds into human readable format
 */
function formatCountdown(seconds) {
    if (seconds <= 0) return 'Starting...';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `Next run in: ${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `Next run in: ${minutes}m ${secs}s`;
    } else {
        return `Next run in: ${secs}s`;
    }
}

/**
 * Start countdown timer that updates every second
 */
function startCountdownTimer(initialSeconds) {
    // Clear any existing timer
    if (window.countdownInterval) {
        clearInterval(window.countdownInterval);
    }
    
    let remainingSeconds = initialSeconds;
    
    window.countdownInterval = setInterval(() => {
        remainingSeconds--;
        
        if (remainingSeconds <= 0) {
            clearInterval(window.countdownInterval);
            document.getElementById('countdown-display').textContent = 'Starting...';
            // Refresh status to check if it's actually running
            setTimeout(loadScraperStatus, 2000);
            return;
        }
        
        document.getElementById('countdown-display').textContent = formatCountdown(remainingSeconds);
    }, 1000);
}



/**
 * Trigger manual refresh of scraper
 */
async function triggerManualRefresh() {
    try {
        // Update UI to show refreshing state
        const iconElement = document.getElementById('scraper-status-icon');
        const textElement = document.getElementById('scraper-status-text');
        const countdownElement = document.getElementById('countdown-display');
        
        if (iconElement) iconElement.textContent = '⏳';
        if (textElement) textElement.textContent = 'Triggering...';
        if (countdownElement) countdownElement.textContent = 'Refreshing...';
        
        const response = await apiRequest('/scraper/refresh', { method: 'POST' });
        
        if (response.success) {
            showSuccess('Manual refresh triggered! New tweets should appear soon.');
            
            // Update UI to show triggered state
            if (iconElement) iconElement.textContent = '🔄';
            if (textElement) textElement.textContent = 'Running...';
            if (countdownElement) countdownElement.textContent = 'Manual run in progress';
            
            // Refresh tweet data after a delay
            setTimeout(async () => {
                await Promise.all([loadStats(), loadPendingTweets()]);
                await loadScraperStatus();
            }, 5000);
        } else {
            throw new Error(response.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Failed to trigger manual refresh:', error);
        showError('Failed to trigger manual refresh. Please try again.');
        
        // Reset UI state
        setTimeout(loadScraperStatus, 1000);
    }
}



/**
 * Refresh functions
 */
async function refreshTweets() {
    await Promise.all([loadStats(), loadPendingTweets()]);
    showSuccess('Pending tweets refreshed');
}

async function refreshPending() {
    await loadPendingReplies();
    showSuccess('Pending replies refreshed');
}

async function refreshHistory() {
    await loadHistory();
    showSuccess('Reply history refreshed');
}

async function refreshSkipped() {
    await loadSkipped();
    showSuccess('Skipped tweets refreshed');
}

async function refreshFailed() {
    await loadFailed();
    showSuccess('Failed tweets refreshed');
}

/**
 * Utility functions
 */
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    
    // Format as: "Dec 19, 2024 3:45 PM"
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    console.error(message);
    // You could add a toast notification system here
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    console.log(message);
    // You could add a toast notification system here
    // For now, just log to console
}

/**
 * Load bot configuration
 */
async function loadConfig() {
    try {
        const response = await apiRequest('/config');
        
        if (response.success) {
            const config = response.data;
            document.getElementById('search-keyword').value = config.search_keyword || '';
            document.getElementById('reply-instructions').value = config.reply_instructions || '';
            showSuccess('Configuration loaded successfully!');
        } else {
            showError('Failed to load configuration');
        }
    } catch (error) {
        console.error('Error loading configuration:', error);
        showError('Failed to load configuration. Please try again.');
    }
}

/**
 * Save bot configuration
 */
async function saveConfig() {
    const searchKeyword = document.getElementById('search-keyword').value.trim();
    const replyInstructions = document.getElementById('reply-instructions').value.trim();
    
    if (!searchKeyword) {
        showError('Search keyword is required');
        return;
    }
    
    if (!replyInstructions) {
        showError('Reply instructions are required');
        return;
    }
    
    if (replyInstructions.length < 10) {
        showError('Reply instructions must be at least 10 characters long');
        return;
    }
    
    try {
        const response = await apiRequest('/config', {
            method: 'PUT',
            body: JSON.stringify({
                search_keyword: searchKeyword,
                reply_instructions: replyInstructions
            })
        });
        
        if (response.success) {
            showSuccess('Configuration saved successfully! The bot will use these settings for future scraping and replies.');
        } else {
            showError(response.error || 'Failed to save configuration');
        }
    } catch (error) {
        console.error('Error saving configuration:', error);
        showError('Failed to save configuration. Please try again.');
    }
}



// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp); 
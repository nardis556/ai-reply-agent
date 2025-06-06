/**
 * Prompt Building Module
 * Handles construction of prompts for AI reply generation
 */

/**
 * Build a structured prompt for AI reply generation
 * @param {Object} tweetData - Tweet data object
 * @param {string} instructions - AI instructions
 * @param {Object} options - Additional options for prompt building
 * @returns {string} Formatted prompt for AI
 */
export function buildReplyPrompt(tweetData, instructions, options = {}) {
    const {
        includeContext = true,
        includeMetadata = true,
        characterLimit = 280
    } = options;

    const tweetInfo = {
        username: tweetData.username || 'Unknown',
        text: tweetData.tweet_text || '',
        hasVideo: tweetData.video || false,
        keyword: tweetData.search_keyword || '',
        tweetUrl: tweetData.tweet_url || ''
    };

    let prompt = `Please generate a reply to this tweet:\n\n`;
    
    // Core tweet information
    prompt += `Username: @${tweetInfo.username}\n`;
    prompt += `Tweet: "${tweetInfo.text}"\n`;

    // Optional metadata
    if (includeMetadata) {
        if (tweetInfo.hasVideo) {
            prompt += `📹 This tweet contains a video.\n`;
        }
        
        if (tweetInfo.keyword) {
            prompt += `🔍 Found via search: ${tweetInfo.keyword}\n`;
        }
    }

    // Context instructions
    if (includeContext) {
        prompt += `\nGenerate a thoughtful, engaging reply that adds value to the conversation.\n`;
    }

    // Critical constraints
    prompt += `\nIMPORTANT: Your reply must be under ${characterLimit} characters. Write a complete, natural sentence that fits within this limit.`;

    return prompt.trim();
}

/**
 * Build a system message for the AI chat completion
 * @param {string} instructions - Base instructions
 * @param {Object} customizations - Custom modifications to instructions
 * @returns {string} System message
 */
export function buildSystemMessage(instructions, customizations = {}) {
    let systemMessage = instructions;

    // Apply any customizations
    if (customizations.tone) {
        systemMessage += `\n\nTone: ${customizations.tone}`;
    }

    if (customizations.style) {
        systemMessage += `\nStyle: ${customizations.style}`;
    }

    if (customizations.additionalGuidelines) {
        systemMessage += `\n\nAdditional Guidelines:\n${customizations.additionalGuidelines}`;
    }

    return systemMessage;
}

/**
 * Create prompt variations for multiple reply generation
 * @param {Object} tweetData - Tweet data
 * @param {string} baseInstructions - Base AI instructions
 * @param {number} variations - Number of variations to create
 * @returns {Array} Array of different prompts
 */
export function createPromptVariations(tweetData, baseInstructions, variations = 3) {
    const prompts = [];
    
    const toneVariations = [
        { tone: 'friendly and casual', style: 'conversational' },
        { tone: 'thoughtful and insightful', style: 'analytical' },
        { tone: 'supportive and encouraging', style: 'positive' }
    ];

    for (let i = 0; i < Math.min(variations, toneVariations.length); i++) {
        const customization = toneVariations[i];
        const systemMessage = buildSystemMessage(baseInstructions, customization);
        const userPrompt = buildReplyPrompt(tweetData, baseInstructions, {
            includeContext: true,
            includeMetadata: true
        });

        prompts.push({
            system: systemMessage,
            user: userPrompt,
            variation: customization
        });
    }

    return prompts;
}

/**
 * Build a preview prompt for UI display
 * @param {Object} tweetData - Tweet data
 * @returns {string} Short preview prompt for UI
 */
export function buildPreviewPrompt(tweetData) {
    const preview = `@${tweetData.username || 'Unknown'}: "${(tweetData.tweet_text || '').substring(0, 100)}..."`;
    return preview;
}

export default {
    buildReplyPrompt,
    buildSystemMessage,
    createPromptVariations,
    buildPreviewPrompt
}; 
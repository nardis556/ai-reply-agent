import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

class ReplyAgent {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
        this.maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS) || 100;
        this.temperature = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;

        // Default personality and instructions
        this.defaultInstructions = process.env.REPLY_INSTRUCTIONS || `
You are a helpful and engaging Twitter user. Generate a thoughtful, relevant reply to the given tweet.

Guidelines:
- Keep responses under 280 characters
- Be conversational and friendly
- Add value to the conversation
- Avoid controversial topics
- Use appropriate emojis sparingly
- Don't be overly promotional
- Be authentic and human-like
        `.trim();
    }

    /**
     * Generate an AI-powered reply to a tweet
     * @param {Object} tweetData - The tweet data object
     * @param {string} customInstructions - Optional custom instructions for this reply
     * @returns {Promise<string>} Generated reply text
     */
    async generateReply(tweetData, customInstructions = null) {
        try {
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY not found in environment variables');
            }

            const instructions = customInstructions || this.defaultInstructions;
            const prompt = this.buildPrompt(tweetData, instructions);

            if (process.env.VERBOSE_LOGGING === 'true') {
                console.log('🤖 Generating AI reply for tweet:', tweetData.tweet_id);
                console.log('📝 Prompt:', prompt);
            }

            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: instructions
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                presence_penalty: 0.6, // Encourage diverse responses
                frequency_penalty: 0.3  // Reduce repetition
            });

            const generatedReply = response.choices[0].message.content.trim();

            // Clean up the response (remove quotes if wrapped)
            const cleanReply = this.cleanReply(generatedReply);

            if (process.env.VERBOSE_LOGGING === 'true') {
                console.log('✅ Generated reply:', cleanReply);
                console.log('📊 Token usage:', response.usage);
            }

            return cleanReply;

        } catch (error) {
            console.error('❌ Error generating AI reply:', error.message);

            // Fallback to a generic reply if AI fails
            const fallbackReply = process.env.FALLBACK_REPLY || 'Interesting perspective! 🤔';
            console.log('🔄 Using fallback reply:', fallbackReply);

            return fallbackReply;
        }
    }

    /**
     * Build the prompt for the AI based on tweet data
     * @param {Object} tweetData - The tweet data
     * @param {string} instructions - The instructions for the AI
     * @returns {string} Formatted prompt
     */
    buildPrompt(tweetData, instructions) {
        const tweetInfo = {
            username: tweetData.username || 'Unknown',
            text: tweetData.tweet_text || '',
            hasVideo: tweetData.video || false,
            keyword: tweetData.search_keyword || ''
        };

        return `
Please generate a reply to this tweet:

Username: @${tweetInfo.username}
Tweet: "${tweetInfo.text}"
${tweetInfo.hasVideo ? 'This tweet contains a video.' : ''}
${tweetInfo.keyword ? `Found via search: ${tweetInfo.keyword}` : ''}

Generate a thoughtful, engaging reply that adds value to the conversation.
        `.trim();
    }

    /**
     * Clean up the generated reply text
     * @param {string} reply - Raw reply from AI
     * @returns {string} Cleaned reply
     */
    cleanReply(reply) {
        // Remove surrounding quotes if present
        let cleaned = reply.replace(/^["']|["']$/g, '');

        // Ensure it's under Twitter's character limit
        if (cleaned.length > 280) {
            cleaned = cleaned.substring(0, 277) + '...';
        }

        return cleaned;
    }

    /**
     * Validate that the reply meets Twitter's requirements
     * @param {string} reply - Reply text to validate
     * @returns {boolean} Whether the reply is valid
     */
    isValidReply(reply) {
        if (!reply || typeof reply !== 'string') {
            return false;
        }

        // Check length
        if (reply.length === 0 || reply.length > 280) {
            return false;
        }

        // Check for potentially problematic content
        const problematicPatterns = [
            /^(RT|rt)/,  // Starts with retweet
            /^@\w+\s*$/  // Only mentions someone
        ];

        return !problematicPatterns.some(pattern => pattern.test(reply));
    }

    /**
     * Generate multiple reply options and return the best one
     * @param {Object} tweetData - The tweet data
     * @param {number} count - Number of options to generate (default: 3)
     * @returns {Promise<string>} Best generated reply
     */
    async generateBestReply(tweetData, count = 3) {
        try {
            const replyPromises = Array(count).fill().map(() =>
                this.generateReply(tweetData)
            );

            const replies = await Promise.all(replyPromises);
            const validReplies = replies.filter(reply => this.isValidReply(reply));

            if (validReplies.length === 0) {
                throw new Error('No valid replies generated');
            }

            // For now, return the first valid reply
            // Could implement more sophisticated selection logic here
            return validReplies[0];

        } catch (error) {
            console.error('❌ Error generating best reply:', error.message);
            return this.generateReply(tweetData); // Fallback to single generation
        }
    }
}

export default ReplyAgent;

import OpenAI from 'openai';
import { loadConfiguration } from './api/routes/config.js';
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
        this.aiReplyCharacterLimit = parseInt(process.env.AI_REPLY_CHARACTER_LIMIT) || 280;

        // Default personality and instructions (fallback only)
        this.fallbackInstructions = `
You are a helpful and engaging Twitter user. Reply in human like terms. Write your response in full string. Generate a thoughtful, relevant reply to the given tweet.

CRITICAL: Your response must be EXACTLY under ${this.aiReplyCharacterLimit} characters. Count characters carefully!

Guidelines:
- MUST be under ${this.aiReplyCharacterLimit} characters (this is CRITICAL)
- Be conversational and friendly like a real person
- Add value to the conversation with genuine thoughts
- Avoid controversial topics
- Use appropriate emojis sparingly
- Don't be overly promotional or robotic
- Be authentic and human-like in your tone
- Write complete sentences, not truncated ones
- Sound natural, not like an AI bot
        `.trim();
    }

    /**
     * Load fresh instructions from JSON configuration
     * @returns {Promise<string>} Current reply instructions
     */
    async loadInstructions() {
        try {
            console.log('🔧 [ReplyAgent] Loading instructions from JSON config...');
            const config = await loadConfiguration();
            console.log('🔧 [ReplyAgent] Loaded config:', {
                has_reply_instructions: !!config.reply_instructions,
                reply_instructions_length: config.reply_instructions ? config.reply_instructions.length : 0,
                reply_instructions_preview: config.reply_instructions ? config.reply_instructions.substring(0, 50) + '...' : 'N/A'
            });
            
            if (config.reply_instructions) {
                const finalInstructions = `
${config.reply_instructions}

CRITICAL: Your response must be EXACTLY under ${this.aiReplyCharacterLimit} characters. Count characters carefully!

Guidelines:
- MUST be under ${this.aiReplyCharacterLimit} characters (this is CRITICAL)
- Write complete sentences, not truncated ones
- Sound natural and human-like
                `.trim();
                
                console.log('✅ [ReplyAgent] Using JSON config instructions');
                return finalInstructions;
            }
        } catch (error) {
            console.error('⚠️ [ReplyAgent] Failed to load JSON config for reply instructions:', error.message);
        }
        
        // Fallback to default instructions
        console.log('🔄 [ReplyAgent] Using fallback instructions');
        return this.fallbackInstructions;
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

            const instructions = customInstructions || await this.loadInstructions();
            console.log('📝 [ReplyAgent] Final instructions being used for OpenAI:');
            console.log('📝 [ReplyAgent] Instructions preview:', instructions.substring(0, 100) + '...');
            console.log('📝 [ReplyAgent] Instructions length:', instructions.length);
            
            let attempt = 0;
            const maxAttempts = 3;

            while (attempt < maxAttempts) {
                attempt++;
                
                const prompt = this.buildPrompt(tweetData, instructions);

                if (process.env.VERBOSE_LOGGING === 'true') {
                    console.log(`🤖 Generating AI reply for tweet: ${tweetData.tweet_id} (attempt ${attempt}/${maxAttempts})`);
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
                    max_tokens: Math.min(this.maxTokens, 80), // Conservative token limit
                    temperature: this.temperature,
                    presence_penalty: 0.6, // Encourage diverse responses
                    frequency_penalty: 0.3  // Reduce repetition
                });

                const generatedReply = response.choices[0].message.content.trim();
                const cleanReply = this.cleanReply(generatedReply);

                // Check if reply is good (not truncated and valid length)
                if (cleanReply.length > 0 && cleanReply.length <= this.aiReplyCharacterLimit && !cleanReply.endsWith('...')) {
                    if (process.env.VERBOSE_LOGGING === 'true') {
                        console.log('✅ Generated reply:', cleanReply);
                        console.log(`📏 Length: ${cleanReply.length}/${this.aiReplyCharacterLimit} characters`);
                        console.log('📊 Token usage:', response.usage);
                    }
                    return cleanReply;
                }

                if (process.env.VERBOSE_LOGGING === 'true') {
                    console.log(`⚠️ Reply too long or truncated (${cleanReply.length} chars), retrying...`);
                }
            }

            // If all attempts failed, use fallback
            throw new Error('All attempts produced replies that were too long');

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

IMPORTANT: Your reply must be under ${this.aiReplyCharacterLimit} characters. Write a complete, natural sentence that fits within this limit.
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
        
        // Remove any leading/trailing whitespace
        cleaned = cleaned.trim();

        // If it's over the limit, don't truncate with "..." - let the retry logic handle it
        // This method should only do basic cleaning, not truncation
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
        if (reply.length === 0 || reply.length > this.aiReplyCharacterLimit) {
            return false;
        }

        // Check if it ends with truncation indicator
        if (reply.endsWith('...') || reply.endsWith('…')) {
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

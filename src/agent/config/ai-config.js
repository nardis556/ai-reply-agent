/**
 * AI Configuration for Reply Generation
 */
import { loadConfiguration } from '../../api/routes/config.js';

export const AI_CONFIG = {
    // OpenAI Settings
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 100,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,

    // Reply Constraints
    characterLimit: parseInt(process.env.AI_REPLY_CHARACTER_LIMIT) || 280,
    maxAttempts: 3,

    // Generation Settings
    presencePenalty: 0.6,  // Encourage diverse responses
    frequencyPenalty: 0.3, // Reduce repetition



    // Default Instructions Template
    async getDefaultInstructions(characterLimit) {
        try {
            console.log('🔧 [AI_CONFIG] Loading instructions from JSON config...');
            // Use custom instructions from JSON config if available
            const jsonConfig = await loadConfiguration();
            const customInstructions = jsonConfig.reply_instructions;
            console.log('🔧 [AI_CONFIG] Loaded config:', {
                has_reply_instructions: !!customInstructions,
                reply_instructions_length: customInstructions ? customInstructions.length : 0,
                reply_instructions_preview: customInstructions ? customInstructions.substring(0, 50) + '...' : 'N/A'
            });

            if (customInstructions) {
                const finalInstructions = `
${customInstructions}

CRITICAL: Your response must be EXACTLY under ${characterLimit} characters. Count characters carefully!

Guidelines:
- MUST be under ${characterLimit} characters (this is CRITICAL)
- Write complete sentences, not truncated ones
- Sound natural and human-like
                `.trim();

                console.log('✅ [AI_CONFIG] Using JSON config instructions');
                return finalInstructions;
            }
        } catch (error) {
            console.error('⚠️ [AI_CONFIG] Failed to load JSON config for reply instructions:', error.message);
        }

        // Fallback to default instructions
        console.log('🔄 [AI_CONFIG] Using fallback instructions');
        return `
You are a helpful and engaging Twitter user. Reply in human like terms. Write your response in full string. Generate a thoughtful, relevant reply to the given tweet.

CRITICAL: Your response must be EXACTLY under ${characterLimit} characters. Count characters carefully!

Guidelines:
- MUST be under ${characterLimit} characters (this is CRITICAL)
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
};

export default AI_CONFIG; 
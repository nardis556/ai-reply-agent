/**
 * AI Configuration for Reply Generation
 */
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
    getDefaultInstructions(characterLimit) {
        // Use custom instructions from environment if available
        const customInstructions = process.env.REPLY_INSTRUCTIONS;
        
        if (customInstructions) {
            return `
${customInstructions}

CRITICAL: Your response must be EXACTLY under ${characterLimit} characters. Count characters carefully!

Guidelines:
- MUST be under ${characterLimit} characters (this is CRITICAL)
- Write complete sentences, not truncated ones
- Sound natural and human-like
            `.trim();
        }
        
        // Fallback to default instructions
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
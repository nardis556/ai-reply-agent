/**
 * Reply Generator Module
 * Main orchestrator for AI reply generation with validation and retry logic
 */
import { OpenAIService } from '../services/openai-service.js';
import { buildReplyPrompt, buildSystemMessage } from '../prompt/prompt-builder.js';
import { validateReply, cleanReply, checkContentWarnings } from '../validation/reply-validator.js';
import { AI_CONFIG } from '../config/ai-config.js';

export class ReplyGenerator {
    constructor(config = {}) {
        // Initialize OpenAI service with configuration
        this.openaiService = new OpenAIService({
            model: config.model || AI_CONFIG.model,
            maxTokens: config.maxTokens || AI_CONFIG.maxTokens,
            temperature: config.temperature || AI_CONFIG.temperature,
            presencePenalty: config.presencePenalty || AI_CONFIG.presencePenalty,
            frequencyPenalty: config.frequencyPenalty || AI_CONFIG.frequencyPenalty
        });

        this.config = {
            characterLimit: config.characterLimit || AI_CONFIG.characterLimit,
            maxAttempts: config.maxAttempts || AI_CONFIG.maxAttempts,
            ...config
        };

        this.verbose = process.env.VERBOSE_LOGGING === 'true';
    }

    /**
     * Generate a single reply with validation and retry logic
     * @param {Object} tweetData - Tweet data object
     * @param {string} customInstructions - Optional custom instructions
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generation result with reply and metadata
     */
    async generateReply(tweetData, customInstructions = null, options = {}) {
        const instructions = customInstructions || AI_CONFIG.getDefaultInstructions(this.config.characterLimit);
        const maxAttempts = options.maxAttempts || this.config.maxAttempts;
        
        if (this.verbose) {
            console.log(`🤖 Generating reply for tweet: ${tweetData.tweet_id || 'Unknown'}`);
        }

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (this.verbose) {
                    console.log(`   Attempt ${attempt}/${maxAttempts}`);
                }

                // Build the prompt
                const systemMessage = buildSystemMessage(instructions);
                const userPrompt = buildReplyPrompt(tweetData, instructions, {
                    characterLimit: this.config.characterLimit
                });

                // Generate reply using OpenAI
                const generation = await this.openaiService.generateReply(systemMessage, userPrompt, options);

                if (!generation.success) {
                    throw new Error(generation.error);
                }

                // Clean and validate the reply
                const cleanedReply = cleanReply(generation.text);
                const validation = validateReply(cleanedReply, this.config.characterLimit);

                if (validation.isValid) {
                    const warnings = checkContentWarnings(cleanedReply);
                    
                    if (this.verbose) {
                        console.log(`✅ Generated valid reply: "${cleanedReply}"`);
                        console.log(`📏 Length: ${cleanedReply.length}/${this.config.characterLimit} characters`);
                        if (warnings.length > 0) {
                            console.log(`⚠️ Warnings: ${warnings.join(', ')}`);
                        }
                    }

                    return {
                        success: true,
                        reply: cleanedReply,
                        attempts: attempt,
                        warnings,
                        usage: generation.usage,
                        model: generation.model
                    };
                }

                if (this.verbose) {
                    console.log(`❌ Validation failed: ${validation.errors.join(', ')}`);
                }

            } catch (error) {
                if (this.verbose) {
                    console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
                }
                
                if (attempt === maxAttempts) {
                    console.error(`❌ All ${maxAttempts} attempts failed for tweet ${tweetData.tweet_id}`);
                }
            }
        }

        // All attempts failed, throw error instead of using fallback
        const errorMessage = `Failed to generate valid reply after ${maxAttempts} attempts`;
        
        if (this.verbose) {
            console.log(`❌ ${errorMessage}`);
        }

        throw new Error(errorMessage);
    }

    /**
     * Generate multiple reply options for manual selection
     * @param {Object} tweetData - Tweet data object
     * @param {number} count - Number of options to generate
     * @param {string} customInstructions - Optional custom instructions
     * @returns {Promise<Object>} Multiple reply options
     */
    async generateReplyOptions(tweetData, count = 3, customInstructions = null) {
        const instructions = customInstructions || AI_CONFIG.getDefaultInstructions(this.config.characterLimit);
        
        if (this.verbose) {
            console.log(`🤖 Generating ${count} reply options for tweet: ${tweetData.tweet_id || 'Unknown'}`);
        }

        const systemMessage = buildSystemMessage(instructions);
        const userPrompt = buildReplyPrompt(tweetData, instructions, {
            characterLimit: this.config.characterLimit
        });

        // Generate multiple options in parallel
        const multipleResults = await this.openaiService.generateMultipleReplies(
            systemMessage, 
            userPrompt, 
            count
        );

        const validOptions = [];
        const invalidOptions = [];

        // Process each successful generation
        for (const generation of multipleResults.successful) {
            const cleanedReply = cleanReply(generation.text);
            const validation = validateReply(cleanedReply, this.config.characterLimit);
            const warnings = checkContentWarnings(cleanedReply);

            const option = {
                reply: cleanedReply,
                isValid: validation.isValid,
                errors: validation.errors,
                warnings,
                usage: generation.usage
            };

            if (validation.isValid) {
                validOptions.push(option);
            } else {
                invalidOptions.push(option);
            }
        }

        // If we don't have enough valid options, return error
        if (validOptions.length === 0) {
            throw new Error('Failed to generate any valid reply options');
        }

        if (this.verbose) {
            console.log(`✅ Generated ${validOptions.length} valid options out of ${count} requested`);
        }

        return {
            success: validOptions.length > 0,
            validOptions,
            invalidOptions,
            totalRequested: count,
            totalGenerated: multipleResults.successful.length,
            successRate: multipleResults.successRate
        };
    }

    /**
     * Test the reply generation system
     * @returns {Promise<Object>} Test result
     */
    async testGeneration() {
        const testTweet = {
            tweet_id: 'test123',
            username: 'testuser',
            tweet_text: 'This is a test tweet for validation',
            video: false,
            search_keyword: 'test'
        };

        try {
            const result = await this.generateReply(testTweet);
            
            return {
                success: result.success,
                message: result.success ? 'Reply generation test passed' : 'Reply generation test failed',
                testReply: result.reply,
                details: result
            };

        } catch (error) {
            return {
                success: false,
                message: 'Reply generation test failed with error',
                error: error.message
            };
        }
    }

    /**
     * Get generator statistics and configuration
     * @returns {Object} Current configuration and stats
     */
    getStats() {
        return {
            config: this.config,
            openaiStats: this.openaiService.getUsageStats(),
            characterLimit: this.config.characterLimit,
            maxAttempts: this.config.maxAttempts
        };
    }
}

export default ReplyGenerator; 
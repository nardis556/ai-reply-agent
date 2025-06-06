/**
 * OpenAI Service Module
 * Handles all interactions with OpenAI API
 */
import OpenAI from 'openai';

export class OpenAIService {
    constructor(config = {}) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not found in environment variables');
        }

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.config = {
            model: config.model || 'gpt-3.5-turbo',
            maxTokens: config.maxTokens || 100,
            temperature: config.temperature || 0.7,
            presencePenalty: config.presencePenalty || 0.6,
            frequencyPenalty: config.frequencyPenalty || 0.3,
            ...config
        };

        this.verbose = process.env.VERBOSE_LOGGING === 'true';
    }

    /**
     * Generate a single reply using OpenAI
     * @param {string} systemMessage - System instructions
     * @param {string} userPrompt - User prompt
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Generation result
     */
    async generateReply(systemMessage, userPrompt, options = {}) {
        try {
            const requestConfig = {
                model: options.model || this.config.model,
                messages: [
                    {
                        role: 'system',
                        content: systemMessage
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ],
                max_tokens: Math.min(options.maxTokens || this.config.maxTokens, 80),
                temperature: options.temperature || this.config.temperature,
                presence_penalty: options.presencePenalty || this.config.presencePenalty,
                frequency_penalty: options.frequencyPenalty || this.config.frequencyPenalty
            };

            if (this.verbose) {
                console.log('🤖 Making OpenAI API request...');
            }

            const response = await this.openai.chat.completions.create(requestConfig);
            
            const generatedText = response.choices[0].message.content.trim();
            
            if (this.verbose) {
                console.log('✅ OpenAI response received');
                console.log('📊 Token usage:', response.usage);
            }

            return {
                success: true,
                text: generatedText,
                usage: response.usage,
                model: response.model
            };

        } catch (error) {
            console.error('❌ OpenAI API error:', error.message);
            
            return {
                success: false,
                error: error.message,
                text: null
            };
        }
    }

    /**
     * Generate multiple reply options
     * @param {string} systemMessage - System instructions  
     * @param {string} userPrompt - User prompt
     * @param {number} count - Number of replies to generate
     * @param {Object} options - Generation options
     * @returns {Promise<Array>} Array of generation results
     */
    async generateMultipleReplies(systemMessage, userPrompt, count = 3, options = {}) {
        try {
            if (this.verbose) {
                console.log(`🤖 Generating ${count} reply options...`);
            }

            const requests = Array(count).fill().map(() => 
                this.generateReply(systemMessage, userPrompt, options)
            );

            const results = await Promise.all(requests);
            
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);

            if (this.verbose) {
                console.log(`✅ Generated ${successful.length}/${count} replies successfully`);
                if (failed.length > 0) {
                    console.log(`⚠️ ${failed.length} requests failed`);
                }
            }

            return {
                successful,
                failed,
                total: count,
                successRate: successful.length / count
            };

        } catch (error) {
            console.error('❌ Error generating multiple replies:', error.message);
            return {
                successful: [],
                failed: [],
                total: count,
                successRate: 0,
                error: error.message
            };
        }
    }

    /**
     * Test the OpenAI connection and configuration
     * @returns {Promise<Object>} Test result
     */
    async testConnection() {
        try {
            const testResponse = await this.generateReply(
                'You are a helpful assistant.',
                'Say "Connection test successful" in exactly those words.',
                { maxTokens: 20 }
            );

            return {
                success: testResponse.success,
                message: testResponse.success ? 'OpenAI connection working' : 'OpenAI connection failed',
                details: testResponse
            };

        } catch (error) {
            return {
                success: false,
                message: 'OpenAI connection test failed',
                error: error.message
            };
        }
    }

    /**
     * Get current usage statistics (if available)
     * @returns {Object} Usage statistics
     */
    getUsageStats() {
        // This could be enhanced to track usage over time
        return {
            model: this.config.model,
            maxTokens: this.config.maxTokens,
            temperature: this.config.temperature,
            // Could add request counting, token usage tracking, etc.
        };
    }
}

export default OpenAIService; 
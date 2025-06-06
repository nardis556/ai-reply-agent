/**
 * Agent Module Main Entry Point
 * Exports all key components for the AI Reply Agent
 */

// Import modules for default export
import { ReplyGenerator } from './processing/reply-generator.js';
import { OpenAIService } from './services/openai-service.js';
import { AI_CONFIG } from './config/ai-config.js';
import {
    buildReplyPrompt,
    buildSystemMessage,
    createPromptVariations,
    buildPreviewPrompt
} from './prompt/prompt-builder.js';
import {
    validateReply,
    cleanReply,
    checkContentWarnings
} from './validation/reply-validator.js';

// Re-export modules
export { ReplyGenerator, OpenAIService, AI_CONFIG };
export { buildReplyPrompt, buildSystemMessage, createPromptVariations, buildPreviewPrompt };
export { validateReply, cleanReply, checkContentWarnings };

// Convenience exports for backward compatibility
export { ReplyGenerator as ReplyAgent };

/**
 * Create a new ReplyGenerator instance with default configuration
 * @param {Object} config - Optional configuration overrides
 * @returns {ReplyGenerator} Configured reply generator
 */
export function createReplyAgent(config = {}) {
    return new ReplyGenerator(config);
}

/**
 * Quick test function to verify the agent is working
 * @returns {Promise<Object>} Test results
 */
export async function testAgent(config = {}) {
    try {
        const generator = new ReplyGenerator(config);
        const testResult = await generator.testGeneration();
        
        return {
            success: testResult.success,
            message: 'Agent test completed',
            details: testResult
        };
    } catch (error) {
        return {
            success: false,
            message: 'Agent test failed',
            error: error.message
        };
    }
}

export default {
    ReplyGenerator,
    OpenAIService,
    AI_CONFIG,
    createReplyAgent,
    testAgent,
    // Utilities
    buildReplyPrompt,
    buildSystemMessage,
    validateReply,
    cleanReply
}; 
/**
 * Reply Validation Module
 * Handles validation of AI-generated replies before sending
 */

/**
 * Validate that a reply meets Twitter's requirements and our quality standards
 * @param {string} reply - Reply text to validate
 * @param {number} characterLimit - Maximum character limit
 * @returns {Object} Validation result with isValid flag and errors
 */
export function validateReply(reply, characterLimit = 280) {
    const errors = [];

    // Basic checks
    if (!reply || typeof reply !== 'string') {
        errors.push('Reply must be a non-empty string');
        return { isValid: false, errors };
    }

    const trimmedReply = reply.trim();

    // Length checks
    if (trimmedReply.length === 0) {
        errors.push('Reply cannot be empty');
    }

    if (trimmedReply.length > characterLimit) {
        errors.push(`Reply exceeds character limit (${trimmedReply.length}/${characterLimit})`);
    }

    // Quality checks
    if (trimmedReply.endsWith('...') || trimmedReply.endsWith('…')) {
        errors.push('Reply appears to be truncated');
    }

    // Content pattern checks
    const problematicPatterns = [
        { pattern: /^(RT|rt)\s/, message: 'Reply starts with retweet format' },
        { pattern: /^@\w+\s*$/, message: 'Reply contains only a mention' },
        { pattern: /^\s*$/, message: 'Reply is only whitespace' }
    ];

    problematicPatterns.forEach(({ pattern, message }) => {
        if (pattern.test(trimmedReply)) {
            errors.push(message);
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
        cleanReply: trimmedReply
    };
}

/**
 * Clean and normalize reply text
 * @param {string} reply - Raw reply from AI
 * @returns {string} Cleaned reply text
 */
export function cleanReply(reply) {
    if (!reply || typeof reply !== 'string') {
        return '';
    }

    // Remove surrounding quotes if present
    let cleaned = reply.replace(/^["']|["']$/g, '');
    
    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
}

/**
 * Check if reply contains potentially problematic content
 * @param {string} reply - Reply to check
 * @returns {Array} Array of warnings about content
 */
export function checkContentWarnings(reply) {
    const warnings = [];
    
    if (!reply) return warnings;

    // Check for excessive punctuation
    if ((reply.match(/[!?]{2,}/g) || []).length > 0) {
        warnings.push('Contains excessive punctuation');
    }

    // Check for all caps
    if (reply === reply.toUpperCase() && reply.length > 10) {
        warnings.push('Contains excessive capitalization');
    }

    // Check for very short replies
    if (reply.length < 10) {
        warnings.push('Reply might be too short to be meaningful');
    }

    return warnings;
}

export default {
    validateReply,
    cleanReply,
    checkContentWarnings
}; 
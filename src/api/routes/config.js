import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// Path to store configuration
const CONFIG_FILE = path.join(process.cwd(), 'bot-config.json');

// Default configuration
const DEFAULT_CONFIG = {
    search_keyword: '#test_test_test_12345',
    reply_instructions: 'You are a friendly Twitter user who loves sharing interesting connections between unexpected topics. When you see someone posting about technology, science, or current events, you help them discover fascinating parallels in nature, history, or other fields. Your replies are concise (under 280 characters), engaging, and include relevant hashtags. You maintain a curious, optimistic tone and often pose thought-provoking questions to encourage further discussion.'
};

/**
 * Load configuration from file
 */
async function loadConfiguration() {
    try {
        console.log('🔧 [CONFIG] Loading configuration from:', CONFIG_FILE);
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        const config = JSON.parse(data);
        console.log('🔧 [CONFIG] Successfully loaded config:', {
            has_search_keyword: !!config.search_keyword,
            search_keyword: config.search_keyword,
            has_reply_instructions: !!config.reply_instructions,
            reply_instructions_length: config.reply_instructions ? config.reply_instructions.length : 0,
            reply_instructions_preview: config.reply_instructions ? config.reply_instructions.substring(0, 50) + '...' : 'N/A',
            updated_at: config.updated_at
        });
        return config;
    } catch (error) {
        console.log('⚠️ [CONFIG] Failed to load config file, using default:', error.message);
        // If file doesn't exist or can't be read, return default config
        return DEFAULT_CONFIG;
    }
}

/**
 * Save configuration to file
 */
async function saveConfiguration(config) {
    try {
        console.log('💾 [CONFIG] Saving configuration to:', CONFIG_FILE);
        console.log('💾 [CONFIG] Config to save:', {
            search_keyword: config.search_keyword,
            reply_instructions_length: config.reply_instructions ? config.reply_instructions.length : 0,
            reply_instructions_preview: config.reply_instructions ? config.reply_instructions.substring(0, 50) + '...' : 'N/A',
            updated_at: config.updated_at
        });
        
        const configJson = JSON.stringify(config, null, 2);
        await fs.writeFile(CONFIG_FILE, configJson, 'utf8');
        console.log('✅ [CONFIG] Configuration saved successfully!');
        return true;
    } catch (error) {
        console.error('❌ [CONFIG] Failed to save configuration:', error);
        return false;
    }
}

/**
 * GET /api/config
 * Get current bot configuration
 */
router.get('/', async (req, res) => {
    try {
        const config = await loadConfiguration();
        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('Error loading configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load configuration'
        });
    }
});

/**
 * PUT /api/config
 * Update bot configuration
 */
router.put('/', async (req, res) => {
    try {
        console.log('📥 [CONFIG] Received PUT request to update config');
        console.log('📥 [CONFIG] Request body:', {
            has_search_keyword: !!req.body.search_keyword,
            search_keyword: req.body.search_keyword,
            has_reply_instructions: !!req.body.reply_instructions,
            reply_instructions_length: req.body.reply_instructions ? req.body.reply_instructions.length : 0,
            reply_instructions_preview: req.body.reply_instructions ? req.body.reply_instructions.substring(0, 50) + '...' : 'N/A'
        });
        
        const { search_keyword, reply_instructions } = req.body;

        // Validate required fields
        if (!search_keyword || !reply_instructions) {
            return res.status(400).json({
                success: false,
                error: 'Both search_keyword and reply_instructions are required'
            });
        }

        // Validate search keyword format (should include # if it's a hashtag)
        if (search_keyword.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Search keyword cannot be empty'
            });
        }

        // Validate reply instructions length
        if (reply_instructions.trim().length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Reply instructions must be at least 10 characters long'
            });
        }

        const config = {
            search_keyword: search_keyword.trim(),
            reply_instructions: reply_instructions.trim(),
            updated_at: new Date().toISOString()
        };

        const saved = await saveConfiguration(config);
        
        if (!saved) {
            return res.status(500).json({
                success: false,
                error: 'Failed to save configuration'
            });
        }

        res.json({
            success: true,
            data: {
                message: 'Configuration updated successfully',
                config
            }
        });

    } catch (error) {
        console.error('Error updating configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration'
        });
    }
});

// Export both router and helper functions for use in other parts of the application
export default router;
export { loadConfiguration, saveConfiguration, DEFAULT_CONFIG }; 
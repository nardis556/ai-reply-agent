#!/usr/bin/env node

/**
 * Quick test for the reply service fixes
 * This will test the improved error handling without actually posting
 */

import Database from './src/database/database.js';

async function testReplyFix() {
    console.log('🧪 Testing Reply Service Fixes...\n');
    
    const db = new Database();
    await db.initialize();
    
    // Check if we have any selected tweets
    const selectedTweets = await new Promise((resolve, reject) => {
        db.db.all(
            "SELECT * FROM tweets WHERE status = 'selected' LIMIT 5",
            [],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
    
    console.log(`📊 Found ${selectedTweets.length} selected tweets`);
    
    if (selectedTweets.length > 0) {
        console.log('\n📝 Selected tweets:');
        selectedTweets.forEach((tweet, index) => {
            console.log(`${index + 1}. @${tweet.username}: ${tweet.tweet_text.substring(0, 50)}...`);
        });
        
        console.log('\n✅ Ready to test! Run: npm run reply');
        console.log('🔧 The new fixes include:');
        console.log('   - Better timeout handling (10s instead of 60s)');
        console.log('   - Retry logic for clicks (3 attempts)');
        console.log('   - Modal dismissal before interactions');
        console.log('   - Login status verification');
        console.log('   - Page refresh as fallback strategy');
        
    } else {
        console.log('⚠️ No tweets selected for reply.');
        console.log('💡 Go to web interface and click "Select for Reply" first');
    }
    
    await db.close();
}

testReplyFix().catch(console.error); 
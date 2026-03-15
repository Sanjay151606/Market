import axios from 'axios';
import { supabaseAdmin } from '../config/supabase.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const port = process.env.PORT || 8000;
const BASE_URL = `http://localhost:${port}/api`;

const testGroqIntegration = async () => {
    try {
        console.log('Fetching a test user...');
        const { data: users, error: userError } = await supabaseAdmin.from('users').select('*').limit(1);

        if (userError || !users || users.length === 0) {
            console.error('No users found in database to test with.');
            return;
        }

        const user = users[0];
        console.log(`Testing with user: ${user.id}`);

        // 1. Get products for this user
        console.log('\\nFetching user products...');
        const { data: products } = await supabaseAdmin.from('products').select('*').eq('seller_id', user.id).limit(3);
        const productIds = products.map(p => p.id);

        console.log(`Found ${productIds.length} products to analyze.`);

        // 2. We need a token to hit our own API
        // For testing, just call the groq client directly to see the LLM output
        console.log('\\n--- Direct Groq Client Test ---');
        console.log('Sending data to Groq LLM...');

        const { generateInsightsFromGroq } = await import('../utils/groqClient.js');
        const insights = await generateInsightsFromGroq(products, 'inventory & sales');

        console.log('\\n--- GROQ AI RESPONSE ---');
        console.log(JSON.stringify(insights, null, 2));
        console.log('------------------------');

    } catch (error) {
        console.error('Test failed:', error);
    }
};

testGroqIntegration();

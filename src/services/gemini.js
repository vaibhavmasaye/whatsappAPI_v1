const axios = require('axios');
const logger = require('../logger');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT;

 const testPrompt = "Convert the following user request into a safe SQL query:  मला आजचे सर्व ऑर्डर दाखवा";

async function generateSQL(prompt) {
   console.log('Generating SQL for prompt:', prompt);

    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key is not configured');
    }

     // Optimized prompt for clean SQL output only
    const optimizedPrompt = `
IMPORTANT INSTRUCTIONS:
1. You are an expert SQL query generator for Shopify database
2. Generate ONLY the SQL query, no explanations, no comments, no markdown
3. Return ONLY the pure SQL statement, nothing else
4. Use safe SELECT queries only - NO DROP, DELETE, UPDATE, INSERT, ALTER
5. Assume the database has tables: orders, products, customers, order_items
6. Use proper SQL syntax with correct column names

User request: "${prompt}"

Generate the SQL query:
`.trim();


    
    // Use the correct endpoint for gemini-2.5-flash
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log("Using Gemini endpoint:", endpoint.replace(GEMINI_API_KEY, 'KEY_REDACTED'));

    try {
        const response = await axios.post(
            endpoint,
            {
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: optimizedPrompt }
                        ]
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        // Correct parsing for the new response format
        const sql = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        logger.info('Generated SQL:', sql);

        if (!sql) {
            throw new Error('Empty response from Gemini API');
        }

        return sql.trim();

    } catch (err) {
        // Enhanced error logging
        const errorDetails = {
            message: err.message,
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            url: err.config?.url ? err.config.url.replace(GEMINI_API_KEY, 'KEY_REDACTED') : null
        };
        
        logger.error('Gemini API Error Details:', JSON.stringify(errorDetails, null, 2));
        throw new Error(`Failed to generate SQL with Gemini AI: ${err.message}`);
    }
}

module.exports = { generateSQL };

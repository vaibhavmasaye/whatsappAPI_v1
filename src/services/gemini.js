const axios = require('axios');
const { detectLanguage } = require('../utils/language');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Create axios instance with connection pooling
const axiosInstance = axios.create({
  timeout: 8000,
  httpsAgent: new (require('https').Agent)({ 
    keepAlive: true,
    maxSockets: 50,
  })
});

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    MAX_REQUESTS_PER_MINUTE: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 20,
    MAX_REQUESTS_PER_HOUR: parseInt(process.env.MAX_REQUESTS_PER_HOUR) || 200,
};

// Caches
const promptCache = new Map();
const userPromptHistory = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// Cache cleanup
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of promptCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            promptCache.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Format SQL to remove unnecessary whitespace and newlines for clean JSON response
 */
function formatSQLForResponse(sql) {
    if (!sql) return '';
    
    // Remove extra whitespace and newlines, but keep it readable
    return sql
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n/g, ' ')   // Replace newlines with spaces
        .trim();
}

/**
 * Enhanced pattern detection for sales queries
 */
function detectSalesPattern(prompt, userId) {
    const lowerPrompt = prompt.toLowerCase();
    
    // Check for monthly AND weekly sales pattern
    const hasMonth = lowerPrompt.includes('month') || lowerPrompt.includes('महिन्यातील');
    const hasWeek = lowerPrompt.includes('week') || lowerPrompt.includes('आठवड्यातील') || lowerPrompt.includes('weekly');
    const hasSales = lowerPrompt.includes('sales') || lowerPrompt.includes('विक्री') || lowerPrompt.includes('total');
    
    // Specific pattern for "month & week" or "month and week"
    const hasMonthAndWeek = (lowerPrompt.includes('month') && lowerPrompt.includes('week')) || 
                           (lowerPrompt.includes('month') && lowerPrompt.includes('&')) ||
                           (lowerPrompt.includes('महिन्यातील') && lowerPrompt.includes('आठवड्यातील'));

    if (hasMonthAndWeek && hasSales) {
        return `SELECT SUM(CASE WHEN DATE_TRUNC('month', order_date) = DATE_TRUNC('month', CURRENT_DATE) THEN total_amount ELSE 0 END) AS monthly_sales, SUM(CASE WHEN DATE_TRUNC('week', order_date) = DATE_TRUNC('week', CURRENT_DATE) THEN total_amount ELSE 0 END) AS weekly_sales FROM orders WHERE customer_id = ${userId}`;
    }

    if (hasMonth && hasSales && !hasWeek) {
        return `SELECT SUM(total_amount) AS monthly_sales FROM orders WHERE customer_id = ${userId} AND DATE_TRUNC('month', order_date) = DATE_TRUNC('month', CURRENT_DATE)`;
    }

    if (hasWeek && hasSales && !hasMonth) {
        return `SELECT SUM(total_amount) AS weekly_sales FROM orders WHERE customer_id = ${userId} AND DATE_TRUNC('week', order_date) = DATE_TRUNC('week', CURRENT_DATE)`;
    }

    if (hasSales && !hasMonth && !hasWeek) {
        return `SELECT SUM(total_amount) AS total_sales FROM orders WHERE customer_id = ${userId}`;
    }

    return null;
}

/**
 * Generate SQL for common patterns without API call
 */
function generateSQLFromPattern(prompt, userId) {
    const lowerPrompt = prompt.toLowerCase();

    // 1. First check for sales patterns
    const salesSQL = detectSalesPattern(prompt, userId);
    if (salesSQL) {
        return salesSQL;
    }

    // 2. Check for order patterns
    if ((lowerPrompt.includes('today') && lowerPrompt.includes('order')) || 
        (lowerPrompt.includes('आजचे') && lowerPrompt.includes('ऑर्डर'))) {
        return `SELECT * FROM orders WHERE customer_id = ${userId} AND DATE(order_date) = CURRENT_DATE ORDER BY order_date DESC`;
    }

    if ((lowerPrompt.includes('my') && lowerPrompt.includes('order')) || 
        (lowerPrompt.includes('माझ्या') && lowerPrompt.includes('ऑर्डर'))) {
        return `SELECT * FROM orders WHERE customer_id = ${userId} ORDER BY order_date DESC LIMIT 50`;
    }

    if (lowerPrompt.includes('product') || lowerPrompt.includes('उत्पादन')) {
        return `SELECT * FROM products WHERE active = true ORDER BY name LIMIT 50`;
    }

    return null;
}

/**
 * Check rate limits
 */
function checkRateLimit(userId) {
    const now = Date.now();
    const userHistory = userPromptHistory.get(userId) || { requests: [] };
    
    const recentRequests = userHistory.requests.filter(time => now - time < 3600000);
    userHistory.requests = recentRequests;
    userPromptHistory.set(userId, userHistory);
    
    const minuteRequests = recentRequests.filter(time => now - time < 60000);
    
    if (minuteRequests.length >= RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_MINUTE) {
        return {
            limited: true,
            retryAfter: Math.ceil((60000 - (now - minuteRequests[0])) / 1000),
            message: `Rate limit exceeded. Please try again in a few seconds.`
        };
    }
    
    return { limited: false };
}

/**
 * Clean SQL response from Gemini (remove markdown, etc.)
 */
function cleanSQLResponse(sql) {
    if (!sql) return '';
    
    let cleanedSQL = sql.replace(/```sql\s*/gi, '')
                       .replace(/```\s*/gi, '')
                       .replace(/`/g, '')
                       .trim();
    
    const sqlMatch = cleanedSQL.match(/(SELECT|WITH).*?(;|$)/is);
    return sqlMatch ? formatSQLForResponse(sqlMatch[0].trim()) : formatSQLForResponse(cleanedSQL);
}

/**
 * Generate cache key
 */
function generateCacheKey(userId, prompt) {
    const normalizedPrompt = prompt.toLowerCase().replace(/\s+/g, ' ');
    return `${userId}:${normalizedPrompt}`;
}

async function generateSQL(prompt, userId = 'anonymous') {
    const startTime = Date.now();
    
    if (!prompt || typeof prompt !== 'string') {
        throw new Error('Valid prompt is required');
    }

    // Check rate limits
    const rateLimitCheck = checkRateLimit(userId);
    if (rateLimitCheck.limited) {
        throw new Error(rateLimitCheck.message);
    }
    
    // Track user request
    const now = Date.now();
    const userHistory = userPromptHistory.get(userId) || { requests: [] };
    userHistory.requests.push(now);
    userPromptHistory.set(userId, userHistory);
    
    // Generate cache key
    const cacheKey = generateCacheKey(userId, prompt);
    
    // Check cache first
    const cachedResponse = promptCache.get(cacheKey);
    if (cachedResponse && (now - cachedResponse.timestamp < CACHE_TTL)) {
        console.log(`Cache hit for user ${userId}`);
        return formatSQLForResponse(cachedResponse.sql);
    }

    // Try to generate SQL from pattern (fastest path)
    const patternSQL = generateSQLFromPattern(prompt, userId);
    if (patternSQL) {
        promptCache.set(cacheKey, { sql: patternSQL, timestamp: now });
        console.log(`Pattern-based SQL generated in ${Date.now() - startTime}ms`);
        return formatSQLForResponse(patternSQL);
    }

    // If no Gemini API key, use fallback
    if (!GEMINI_API_KEY) {
        const fallbackSQL = `SELECT * FROM orders WHERE customer_id = ${userId} ORDER BY order_date DESC LIMIT 20`;
        promptCache.set(cacheKey, { sql: fallbackSQL, timestamp: now });
        return formatSQLForResponse(fallbackSQL);
    }

    // Prepare optimized prompt for Gemini
    const optimizedPrompt = `
Generate a precise SQL SELECT query for Shopify database.
Database schema: orders(order_id, customer_id, order_date, total_amount, status), products, customers, order_items
User ID: ${userId}
User request: "${prompt}"

Generate ONLY the SQL query without any explanations, comments, or formatting.
Use proper date functions for current month/week calculations.
Focus on sales data (total_amount field) when requested.
Return only the pure SQL statement in a single line.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await axiosInstance.post(
            endpoint,
            {
                contents: [{ 
                    role: "user", 
                    parts: [{ text: optimizedPrompt }] 
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 300,
                    topP: 0.9,
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            }
        );

        let rawSQL = '';
        const candidates = response.data?.candidates || [];
        
        if (candidates.length > 0) {
            const content = candidates[0].content;
            if (content && content.parts && content.parts.length > 0) {
                rawSQL = content.parts[0].text || '';
            }
        }
        
        if (!rawSQL || rawSQL.trim().length < 10) {
            throw new Error('Empty response from Gemini API');
        }

        const sql = cleanSQLResponse(rawSQL);
        
        // Validate it's a proper SQL query
        if (!sql || !sql.toUpperCase().includes('SELECT')) {
            throw new Error('Invalid SQL response from Gemini');
        }

        // Cache successful response
        promptCache.set(cacheKey, { sql, timestamp: now });
        
        const responseTime = Date.now() - startTime;
        console.log(`Gemini SQL generated in ${responseTime}ms`);

        return formatSQLForResponse(sql);

    } catch (err) {
        console.warn(`Gemini API failed: ${err.message}, using pattern-based fallback`);
        
        // Remove failed request from rate limit count
        const userHistory = userPromptHistory.get(userId);
        if (userHistory && userHistory.requests.length > 0) {
            userHistory.requests.pop();
        }
        
        // Use enhanced pattern-based fallback
        const fallbackSQL = generateSQLFromPattern(prompt, userId) || 
                          `SELECT SUM(CASE WHEN DATE_TRUNC('month', order_date) = DATE_TRUNC('month', CURRENT_DATE) THEN total_amount ELSE 0 END) AS monthly_sales, SUM(CASE WHEN DATE_TRUNC('week', order_date) = DATE_TRUNC('week', CURRENT_DATE) THEN total_amount ELSE 0 END) AS weekly_sales FROM orders WHERE customer_id = ${userId}`;
        
        promptCache.set(cacheKey, { sql: fallbackSQL, timestamp: now });
        
        return formatSQLForResponse(fallbackSQL);
    }
}

// Pre-warm function
async function prewarmGeminiConnection() {
    if (!GEMINI_API_KEY) return;
    
    try {
        await axiosInstance.get(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${GEMINI_API_KEY}`,
            { timeout: 2000 }
        );
        console.log('Gemini connection ready');
    } catch (error) {
        console.log('Gemini pre-warm completed');
    }
}

// Start pre-warm
setTimeout(prewarmGeminiConnection, 1000);

module.exports = { 
    generateSQL, 
    prewarmGeminiConnection,
    getCacheStats: () => ({
        cacheSize: promptCache.size,
        userCount: userPromptHistory.size
    }),
    clearUserCache: (userId) => {
        let count = 0;
        for (const [key] of promptCache.entries()) {
            if (key.startsWith(`${userId}:`)) {
                promptCache.delete(key);
                count++;
            }
        }
        userPromptHistory.delete(userId);
        return count;
    }
};
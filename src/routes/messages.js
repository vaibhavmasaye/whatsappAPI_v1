const express = require('express');
const router = express.Router();
const geminiService = require('../services/gemini');
const whatsappService = require('../services/whatsapp');
const shopifyService = require('../services/shopify');
const { detectLanguage } = require('../utils/language');
const { validateSQL } = require('../utils/sqlValidator');
const logger = require('../logger');

router.post('/', async (req, res, next) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ error: 'Phone and message are required' });
        }

        // 1. Detect Language
        const lang = detectLanguage(message);

        // 2. Generate SQL query from Gemini AI
        const prompt = `User message in ${lang}: "${message}". Generate a safe SQL query to fetch relevant data from Shopify mirror DB. Only return SQL.`;
        const sqlQuery = await geminiService.generateSQL(prompt);

        // Validate query
        if (!validateSQL(sqlQuery)) {
            throw new Error('Generated SQL is invalid or unsafe');
        }

        // 3. Fetch data from Postgres (Shopify mirror)
        const data = await shopifyService.runQuery(sqlQuery);

        // 4. Prepare response
        let replyMessage = 'No data found.';
        if (data && data.length > 0) {
            replyMessage = JSON.stringify(data, null, 2);
        }

        // 5. Send response via WhatsApp
        await whatsappService.sendMessage(phone, replyMessage);

        res.json({ success: true, message: 'Response sent via WhatsApp' });

    } catch (error) {
        logger.error(error.message, error);
        next(error);
    }
});

// In messages.js - update the test-gemini route
router.post('/test-gemini', async (req, res, next) => {
    try {
        console.log('Raw request body:', req.body); // Add this for debugging
        console.log('Received test-gemini request:', JSON.stringify(req.body));

        // ✅ Correct destructuring
        const { message , userId} = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const prompt = `Convert the following user request into a safe SQL query: "${message}"`;

        const sqlQuery = await geminiService.generateSQL(prompt ,userId);

        res.json({ success: true, sql: sqlQuery });
    } catch (error) {
        next(error);
    }
});


module.exports = router;

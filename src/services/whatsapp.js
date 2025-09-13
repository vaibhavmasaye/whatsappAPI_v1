const axios = require('axios');
const logger = require('../logger');

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function sendMessage(to, message) {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                text: { body: message }
            },
            {
                headers: {
                    'Authorization': `Bearer ${TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        logger.info(`Message sent to ${to}`);
    } catch (err) {
        logger.error('WhatsApp API Error:', err.message);
        throw new Error('Failed to send WhatsApp message');
    }
}

module.exports = { sendMessage };

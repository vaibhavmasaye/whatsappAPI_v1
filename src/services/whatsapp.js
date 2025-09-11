const axios = require('axios');
const logger = require('../logger');

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!TOKEN || !PHONE_NUMBER_ID) {
  logger.warn('WhatsApp credentials missing: set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
}

const WHATSAPP_API_BASE = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}`;

async function sendText(toPhone, text) {
  // toPhone must be E.164
  const url = `${WHATSAPP_API_BASE}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "text",
    text: { body: text }
  };
  try {
    const resp = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    logger.info('WhatsApp message sent', { resp: resp.data });
    return resp.data;
  } catch (err) {
    logger.error('WhatsApp send error: ' + (err.response?.data || err.message));
    throw err;
  }
}

module.exports = { sendText };

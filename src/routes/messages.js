const express = require('express');
const router = express.Router();
const geminiService = require('../services/gemini');
const whatsappService = require('../services/whatsapp');
const db = require('../services/db');
const { detectLanguage, normalizeLangCode } = require('../utils/language');
const { validateGeneratedSQL } = require('../utils/sqlValidator');
const logger = require('../logger');

/**
 * POST /api/messages
 * Body: { phone: string (E.164), text: string }
 */
router.post('/', async (req, res, next) => {
  const { phone, text } = req.body;
  if (!phone || !text) {
    return res.status(400).json({ error: 'phone and text are required' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  logger.info(`[${requestId}] Received message from ${phone}`);

  try {
    // 1) language detection
    let lang = detectLanguage(text); // returns e.g. 'en', 'hi', 'mr', 'gu'
    lang = normalizeLangCode(lang); // ensure supported codes

    logger.info(`[${requestId}] Detected language: ${lang}`);

    // 2) call Gemini to generate structured SQL (JSON)
    const prompt = geminiService.buildPromptForSQL(text, lang);
    const geminiResp = await geminiService.generateStructuredSQL(prompt);

    logger.info(`[${requestId}] Gemini response: ${JSON.stringify(geminiResp)}`);

    if (!geminiResp || !geminiResp.sql) {
      throw new Error('Gemini did not return SQL');
    }

    // 3) validate SQL against whitelist
    const isValid = validateGeneratedSQL(geminiResp.sql);
    if (!isValid.valid) {
      logger.warn(`[${requestId}] SQL validation failed: ${isValid.reason}`);
      // Optionally notify user
      await whatsappService.sendText(phone, geminiService.getFailureMessage(lang));
      return res.status(400).json({ error: 'Generated SQL not allowed' });
    }

    // 4) execute query (parameterized)
    const rows = await db.query(geminiResp.sql, geminiResp.params || []);
    logger.info(`[${requestId}] DB returned ${rows.length} rows`);

    // 5) format result in user's language
    const formatted = geminiService.formatResult(rows, lang);

    // 6) send via WhatsApp
    await whatsappService.sendText(phone, formatted);

    logger.info(`[${requestId}] Response sent to ${phone}`);
    return res.json({ success: true });
  } catch (err) {
    logger.error(`[${requestId}] Error: ${err.message}`, { stack: err.stack });
    // notify user of error in their language (optional)
    try {
      const lang = detectLanguage(req.body.text) || 'en';
      await whatsappService.sendText(req.body.phone, geminiService.getErrorMessage(normalizeLangCode(lang)));
    } catch (sendErr) {
      logger.error(`Failed to notify user via WhatsApp: ${sendErr.message}`);
    }
    next(err);
  }
});

module.exports = router;

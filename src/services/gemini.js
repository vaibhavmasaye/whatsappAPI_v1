const axios = require('axios');
const logger = require('../logger');

const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY || !GEMINI_ENDPOINT) {
  logger.warn('Gemini API key or endpoint not set. Set GEMINI_API_KEY and GEMINI_ENDPOINT in .env');
}

/**
 * Build a prompt that asks Gemini to generate a structured JSON containing SQL +
 * parameters. It also includes a whitelist of allowed tables/columns to guide the model.
 */
function buildPromptForSQL(userText, lang) {
  const whitelist = {
    tables: {
      orders: ['id','order_number','total_price','created_at','customer_id','line_items'],
      customers: ['id','first_name','last_name','email','phone'],
      products: ['id','title','sku','price','inventory_quantity']
    }
  };

  // Prompt: instruct the model to produce ONLY valid JSON with fields: sql (string), params (array)
  // Force language context so Gemini understands user language
  return `You are an assistant that translates user questions (in ${lang}) into a parameterized SQL SELECT statement.
Output must be valid JSON with keys: "sql" and "params".
- Only use SELECT queries (no inserts/updates/deletes).
- Only query the following tables and columns: ${JSON.stringify(whitelist)}.
- Use parameter placeholders $1, $2 for Postgres parameterized queries and put values into "params" array.
- Keep results concise.
User question: """${userText}"""
Example output:
{"sql":"SELECT id, order_number, total_price FROM orders WHERE customer_id = $1 AND created_at >= $2","params":["123","2024-01-01"]}
Return nothing else, only JSON.`;
}

/**
 * Call Gemini REST endpoint to generate content.
 * We request JSON-only output and parse it.
 */
async function generateStructuredSQL(prompt) {
  try {
    const payload = {
      // REST shape per docs: contents.parts[].text
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    const resp = await axios.post(GEMINI_ENDPOINT, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      timeout: 20000
    });

    // The model output format depends on the API used. Many Gemini/GenAI REST responses include
    // a JSON text field in resp.data. We'll be defensive:
    const textOut = extractTextFromGeminiResponse(resp.data);
    // Parse JSON (model is instructed to return JSON only)
    let parsed = null;
    try {
      parsed = JSON.parse(textOut);
    } catch (err) {
      // Sometimes model returns code block lines; try to extract JSON object substring
      const matched = textOut.match(/{[\s\S]*}/);
      if (matched) parsed = JSON.parse(matched[0]);
      else throw new Error('Could not parse Gemini JSON output');
    }
    return parsed;
  } catch (err) {
    logger.error('Gemini call failed: ' + (err.response?.data || err.message));
    throw err;
  }
}

/**
 * Helper: extract textual answer from Gemini REST response shape
 */
function extractTextFromGeminiResponse(data) {
  // Several shapes possible. Try common ones.
  if (!data) throw new Error('Empty response from Gemini');

  // shape from google genai quickstart: data.candidates[0].content/resp.text
  try {
    if (data.candidates && data.candidates[0]) {
      if (typeof data.candidates[0].content === 'string') return data.candidates[0].content;
      if (Array.isArray(data.candidates[0].content)) {
        // join parts
        return data.candidates[0].content.map(p => p.text || p).join('\n');
      }
    }
    if (data.output && data.output[0] && data.output[0].content) {
      return data.output[0].content[0].text || JSON.stringify(data.output);
    }
    // fallback to stringify
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify(data);
  }
}

/**
 * Format DB rows to a user-facing text (in same language if needed).
 * For brevity we use simple templates. For more advanced UX, ask Gemini to produce
 * a localized textual summary of rows.
 */
function formatResult(rows, lang) {
  if (!rows || rows.length === 0) {
    // localized message
    return getNoDataMessage(lang);
  }
  // Simple formatting: join rows; if many rows, return a short summary.
  if (rows.length > 10) {
    return translate(`Found ${rows.length} records. Showing first 10:\n` + JSON.stringify(rows.slice(0, 10)), lang);
  }
  return translate(JSON.stringify(rows, null, 2), lang);
}

// small localized helpers (could be replaced with Gemini translations)
function getNoDataMessage(lang) {
  switch (lang) {
    case 'hi': return 'कोई परिणाम नहीं मिला।';
    case 'mr': return 'कोणताही निकाल सापडला नाही.';
    case 'gu': return 'કોઈ પરિણામ મળ્યું નથી.';
    default: return 'No results found.';
  }
}
function getErrorMessage(lang) {
  switch (lang) {
    case 'hi': return 'कुछ त्रुटि हुई। बाद में पुनः प्रयास करें।';
    case 'mr': return 'काही चूक झाली. कृपया नंतर प्रयत्न करा.';
    case 'gu': return 'કંઈક ત્રુટિ થઈ છે. કૃપા કરી પછી પ્રયાસ કરો.';
    default: return 'An error occurred. Please try again later.';
  }
}
function getFailureMessage(lang) {
  switch (lang) {
    case 'hi': return 'आपका प्रश्न समझ में नहीं आया या अनुमति नहीं है।';
    case 'mr': return 'तुमचा प्रश्न समजला नाही किंवा परवानगी नाही.';
    case 'gu': return 'તમારો પ્રશ્ન સમજાયો નથી અથવા પરવાનગી નથી.';
    default: return 'Could not process your request.';
  }
}
function translate(text, lang) {
  // Keep simple. For production, call Gemini or a translation service to localize.
  return text;
}

module.exports = {
  buildPromptForSQL,
  generateStructuredSQL,
  formatResult,
  getErrorMessage,
  getFailureMessage
};

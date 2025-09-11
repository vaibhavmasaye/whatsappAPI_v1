const detect = require('language-detect');

/**
 * detectLanguage(text) -> returns simple code: 'en', 'hi', 'mr', 'gu'
 * language-detect returns long names like 'english' so we normalize.
 */
function detectLanguage(text) {
  try {
    const lang = detect(text); // may return 'english', 'hindi', 'marathi', 'gujarati'
    if (!lang) return 'en';
    const l = lang.toLowerCase();
    if (l.includes('hindi')) return 'hi';
    if (l.includes('marathi')) return 'mr';
    if (l.includes('gujarati')) return 'gu';
    if (l.includes('english')) return 'en';
    return 'en';
  } catch (err) {
    return 'en';
  }
}

/** Normalize codes to supported languages */
function normalizeLangCode(code) {
  const c = (code || 'en').toLowerCase();
  if (['hi','hin','hindi'].includes(c)) return 'hi';
  if (['mr','mar','marathi'].includes(c)) return 'mr';
  if (['gu','guj','gujarati'].includes(c)) return 'gu';
  return 'en';
}

module.exports = { detectLanguage, normalizeLangCode };

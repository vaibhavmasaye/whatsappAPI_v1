// language.js - Fixed version
const franc = require('franc-min'); // Lightweight language detection

function detectLanguage(text) {
    try {
        // franc-min returns a function, so we need to call it
        const langCode = franc(text);
        switch (langCode) {
            case 'mar': return 'Marathi';
            case 'guj': return 'Gujarati';
            case 'hin': return 'Hindi';
            case 'eng': return 'English';
            default: return 'English';
        }
    } catch (error) {
        console.error('Language detection error:', error);
        return 'English'; // Fallback to English
    }
}

module.exports = { detectLanguage };
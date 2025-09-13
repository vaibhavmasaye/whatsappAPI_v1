const franc = require('franc-min'); // Lightweight language detection

function detectLanguage(text) {
    const langCode = franc(text);
    switch (langCode) {
        case 'mar': return 'Marathi';
        case 'guj': return 'Gujarati';
        case 'hin': return 'Hindi';
        case 'eng': return 'English';
        default: return 'English';
    }
}

module.exports = { detectLanguage };

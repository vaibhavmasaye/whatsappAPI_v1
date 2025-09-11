const franc = require("franc");

// Detect language code (mar, guj, hin, eng, etc.)
function detectLanguage(text) {
  const langCode = franc(text || "");

  switch (langCode) {
    case "mar": // Marathi
      return "marathi";
    case "guj": // Gujarati
      return "gujarati";
    case "hin": // Hindi
      return "hindi";
    case "eng": // English
      return "english";
    default:
      return "unknown";
  }
}

// (Optional) Normalizer if you want consistent codes
function normalizeLangCode(code) {
  const map = {
    mar: "marathi",
    guj: "gujarati",
    hin: "hindi",
    eng: "english",
  };
  return map[code] || "unknown";
}

module.exports = { detectLanguage, normalizeLangCode };

const logger = require('../logger');

function errorHandler(err, req, res, next) {
    logger.error(err.message, err);
    res.status(500).json({ error: err.message });
}

module.exports = errorHandler;

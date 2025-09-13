const { pool } = require('./db');
const logger = require('../logger');

async function runQuery(sql) {
    try {
        const result = await pool.query(sql);
        return result.rows;
    } catch (err) {
        logger.error('Database Query Error:', err.message);
        throw new Error('Failed to fetch data from DB');
    }
}

module.exports = { runQuery };

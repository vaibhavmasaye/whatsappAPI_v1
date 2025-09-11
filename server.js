require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const messagesRouter = require('./src/routes/messages');
const errorHandler = require('./src/middleware/errorHandler');
const logger = require('./src/logger');

const app = express();
app.use(bodyParser.json());

app.get('/', (req, res) => res.send('Shopify-Gemini-WhatsApp Backend up'));

app.use('/api/messages', messagesRouter);

// Central error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});

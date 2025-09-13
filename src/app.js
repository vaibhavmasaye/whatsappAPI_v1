const express = require("express");
const bodyParser = require('body-parser');
const messagesRouter = require('./routes/messages');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(bodyParser.json());
app.use('/api/messages', messagesRouter);
app.use(errorHandler);

app.get("/", (req, res) => {
  res.json({ message: "Hello, World!" });
});

module.exports = app;

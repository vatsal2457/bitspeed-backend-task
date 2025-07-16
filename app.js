require('dotenv').config();
const express = require('express');
const sequelize = require('./db');
const Contact = require('./models/contact');
const identifyRoute = require('./routes/identify');

const app = express();
app.use(express.json());

app.use('/identify', identifyRoute);

const PORT = process.env.PORT || 3000;

sequelize.sync().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
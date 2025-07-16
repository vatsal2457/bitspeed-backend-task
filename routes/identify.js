const express = require('express');
const router = express.Router();

router.post('/', async (req, res) => {
  // Placeholder for now
  res.json({ message: 'Identify endpoint works!' });
});

module.exports = router;

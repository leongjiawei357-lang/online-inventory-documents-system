const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const dbPath = path.join(__dirname, '..', 'db');
const FILE = path.join(dbPath, 'logs.json');

function read(){ try { return JSON.parse(fs.readFileSync(FILE)); } catch(e){ return []; } }
function write(data){ fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }

router.get('/', (req, res) => {
  const logs = read();
  res.json(logs);
});

router.post('/', (req, res) => {
  const { action } = req.body;
  if (!action) return res.status(400).json({ message: 'No action' });
  const logs = read();
  logs.unshift({ action, time: new Date().toLocaleString() });
  write(logs);
  res.json({ message: 'Logged' });
});

module.exports = router;

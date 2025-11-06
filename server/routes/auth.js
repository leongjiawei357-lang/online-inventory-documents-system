const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'db');
const USERS = path.join(dbPath, 'users.json');

const COMPANY_CODE = "SECURE-360";

// helper
function readUsers(){ try { return JSON.parse(fs.readFileSync(USERS)); } catch(e){ return []; } }
function writeUsers(u){ fs.writeFileSync(USERS, JSON.stringify(u, null, 2)); }

// POST /api/register
router.post('/register', (req, res) => {
  const { username, password, securityCode } = req.body;
  if (!username || !password || !securityCode) return res.status(400).json({ message: 'Missing fields' });
  if (securityCode !== COMPANY_CODE) return res.status(403).json({ message: 'Invalid security code' });

  const users = readUsers();
  if (users.find(u=>u.username === username)) return res.status(409).json({ message: 'Username already exists' });

  const newUser = { id: Date.now().toString(), username, password };
  users.push(newUser);
  writeUsers(users);
  return res.json({ message: 'Registered', username });
});

// POST /api/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  // default admin
  if (username === 'admin' && password === '1234') return res.json({ username: 'admin' });
  const found = users.find(u=>u.username === username && u.password === password);
  if (!found) return res.status(401).json({ message: 'Invalid credentials' });
  return res.json({ username: found.username });
});

module.exports = router;

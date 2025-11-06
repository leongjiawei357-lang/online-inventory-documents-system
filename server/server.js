// server/server.js
// CommonJS version to avoid "Cannot use import outside a module" errors.

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const SECURITY_CODE = process.env.SECURITY_CODE || "L&B2025";

// Ensure folders
const rootDir = __dirname;
const uploadsDir = path.join(rootDir, "uploads");
const dbDir = path.join(rootDir, "db");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// small JSON DB helper (for logs/doc tracking)
function dbFile(name) {
  return path.join(dbDir, name);
}
function readJson(name) {
  const p = dbFile(name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, "[]", "utf8");
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { return []; }
}
function writeJson(name, data) {
  fs.writeFileSync(dbFile(name), JSON.stringify(data, null, 2), "utf8");
}

// Add a log entry (keeps last entries in front)
function addLog(action, user = "System") {
  try {
    const logs = readJson("logs.json");
    logs.unshift({ id: Date.now()+"-"+crypto.randomBytes(3).toString("hex"), time: new Date().toISOString(), user, action });
    writeJson("logs.json", logs);
  } catch (e) {
    console.error("addLog error", e);
  }
}

// Helmet CSP: allow external scripts/styles and disallow inline script execution
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],             // we use external script file (script.js)
      styleSrc: ["'self'", "'unsafe-inline'"], // allow inline styles (your CSS uses style tags)
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ---------- MongoDB (Users) ----------
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/inventory_system";

// Connect with latest options (no deprecated opts)
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    addLog("MongoDB connected");
  })
  .catch(err => {
    console.warn("❌ MongoDB connection warning:", err && err.message ? err.message : err);
  });

// User model (simple)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true }, // NOTE: plaintext for demo — consider hashing (bcrypt) for production
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

// ---------- AUTH ROUTES ----------
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, securityCode } = req.body;
    if (!username || !password || !securityCode) {
      return res.status(400).json({ message: "Missing fields" });
    }
    if (securityCode !== SECURITY_CODE) {
      return res.status(400).json({ message: "Invalid security code." });
    }

    // check existing
    const existing = await User.findOne({ username }).lean().exec();
    if (existing) return res.status(400).json({ message: "Username already exists." });

    const user = new User({ username, password });
    await user.save();
    addLog(`Registered new user: ${username}`, username);
    return res.json({ message: "Registered successfully", username });
  } catch (err) {
    console.error("register error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Missing credentials" });

    const user = await User.findOne({ username, password }).lean().exec();
    if (!user) return res.status(401).json({ message: "Invalid username or password." });

    addLog(`User logged in: ${username}`, username);
    return res.json({ username: user.username });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- LOGS ----------
app.get("/api/logs", (req, res) => {
  try {
    const logs = readJson("logs.json");
    res.json(logs);
  } catch (e) {
    res.status(500).json([]);
  }
});

// ---------- Simple inventory/doc routes (if you already have other endpoints, keep using them) ----------
// NOTE: you can extend to use Mongo or file DB; for now we keep only logs + auth to fix your immediate 404s

// ---------- Serve client ----------
const clientDir = path.join(__dirname, "../client");
app.use(express.static(clientDir));

// fallback for SPA — serve login if route not found (keeps client routing simple)
app.get("*", (req, res) => {
  const loginPath = path.join(clientDir, "login.html");
  if (fs.existsSync(loginPath)) return res.sendFile(loginPath);
  // fallback to index.html
  const indexPath = path.join(clientDir, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send("Not Found");
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

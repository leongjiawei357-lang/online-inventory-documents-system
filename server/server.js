// server/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const ExcelJS = require("exceljs");
const helmet = require("helmet");
const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const SECURITY_CODE = process.env.SECURITY_CODE || "SECURE-360";

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helmet CSP - strict; no inline event handlers allowed
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // allow inline styles for convenience
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  })
);

// Ensure storage directories
const uploadsDir = path.join(__dirname, "uploads");
const reportsDir = path.join(__dirname, "reports");
const fileDB = path.join(__dirname, "filedb");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(fileDB)) fs.mkdirSync(fileDB, { recursive: true });

function readJSON(name) {
  const file = path.join(fileDB, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]", "utf8");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
  } catch (e) {
    return [];
  }
}
function writeJSON(name, data) {
  fs.writeFileSync(path.join(fileDB, name), JSON.stringify(data, null, 2), "utf8");
}

// Try connect to Mongo (optional). If missing or fails, use file DB fallback.
const MONGO_URI = process.env.MONGO_URI || "";
let useMongo = false;
if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log("✅ MongoDB connected");
      useMongo = true;
    })
    .catch((err) => {
      console.warn("⚠️ Mongo connect failed — falling back to file DB:", err.message);
      useMongo = false;
    });
}

// Mongoose schemas (in case Mongo is used)
const userSchema = new mongoose.Schema({ username: String, password: String, securityCode: String });
const inventorySchema = new mongoose.Schema({
  sku: String, name: String, category: String, quantity: Number, unitCost: Number, unitPrice: Number,
  reorderPoint: Number, targetStockLevel: Number, createdAt: Date, updatedAt: Date
});
const docSchema = new mongoose.Schema({ name: String, path: String, size: Number, date: String });
const logSchema = new mongoose.Schema({ user: String, action: String, time: String });

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Inventory = mongoose.models.Inventory || mongoose.model("Inventory", inventorySchema);
const DocumentModel = mongoose.models.Document || mongoose.model("Document", docSchema);
const LogModel = mongoose.models.Log || mongoose.model("Log", logSchema);

function addLog(action, user = "System") {
  const entry = { user, action, time: new Date().toISOString() };
  if (useMongo) {
    new LogModel(entry).save().catch(()=>{});
  } else {
    const logs = readJSON("logs.json");
    logs.unshift(entry);
    writeJSON("logs.json", logs);
  }
}

// File upload (multer)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + crypto.randomBytes(4).toString("hex");
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_() ]/g, "_");
    cb(null, `${unique}-${safe}`);
  }
});
const upload = multer({ storage });

// --- AUTH ---
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, securityCode } = req.body;
    if (!username || !password || !securityCode) return res.status(400).json({ message: "Missing fields" });
    if (securityCode !== SECURITY_CODE) return res.status(400).json({ message: "Invalid security code." });

    if (useMongo) {
      const exists = await User.findOne({ username }).lean();
      if (exists) return res.status(400).json({ message: "Username already exists" });
      await new User({ username, password, securityCode }).save();
      addLog(`Registered user ${username}`, username);
      return res.json({ message: "Registered" });
    } else {
      const users = readJSON("users.json");
      if (users.find(u => u.username === username)) return res.status(400).json({ message: "Username already exists" });
      users.push({ id: Date.now()+"-"+Math.floor(Math.random()*1e6), username, password, securityCode });
      writeJSON("users.json", users);
      addLog(`Registered user ${username}`, username);
      return res.json({ message: "Registered" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Missing fields" });

    if (useMongo) {
      const user = await User.findOne({ username, password }).lean();
      if (!user) return res.status(401).json({ message: "Invalid username or password." });
      addLog(`User logged in: ${username}`, username);
      return res.json({ username: user.username });
    } else {
      const users = readJSON("users.json");
      const user = users.find(u => u.username === username && u.password === password);
      if (!user) return res.status(401).json({ message: "Invalid username or password." });
      addLog(`User logged in: ${username}`, username);
      return res.json({ username: user.username });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- INVENTORY CRUD ---
app.get("/api/inventory", async (req, res) => {
  if (useMongo) {
    const items = await Inventory.find({}).lean();
    return res.json(items);
  } else {
    return res.json(readJSON("inventory.json"));
  }
});

app.post("/api/inventory", async (req, res) => {
  try {
    const body = req.body;
    const item = {
      sku: body.sku||"", name: body.name||"", category: body.category||"",
      quantity: Number(body.quantity||0), unitCost: Number(body.unitCost||0), unitPrice: Number(body.unitPrice||0),
      reorderPoint: body.reorderPoint !== undefined ? Number(body.reorderPoint) : null,
      targetStockLevel: body.targetStockLevel !== undefined ? Number(body.targetStockLevel) : null,
      createdAt: new Date()
    };
    if (useMongo) {
      const saved = await new Inventory(item).save();
      addLog(`Added inventory item: ${item.name}`);
      return res.json(saved);
    } else {
      const arr = readJSON("inventory.json");
      item.id = Date.now()+"-"+Math.floor(Math.random()*1e6);
      arr.push(item);
      writeJSON("inventory.json", arr);
      addLog(`Added inventory item: ${item.name}`);
      return res.json(item);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/inventory/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (useMongo) {
      const updated = await Inventory.findOneAndUpdate({ _id: id }, { ...req.body, updatedAt: new Date() }, { new: true }).lean();
      if (!updated) return res.status(404).json({ message: "Not found" });
      addLog(`Updated inventory: ${updated.name}`);
      return res.json(updated);
    } else {
      const arr = readJSON("inventory.json");
      const idx = arr.findIndex(i => String(i.id) === String(id));
      if (idx === -1) return res.status(404).json({ message: "Not found" });
      arr[idx] = { ...arr[idx], ...req.body, updatedAt: new Date() };
      writeJSON("inventory.json", arr);
      addLog(`Updated inventory: ${arr[idx].name}`);
      return res.json(arr[idx]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/inventory/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (useMongo) {
      const doc = await Inventory.findByIdAndDelete(id).lean();
      if (!doc) return res.status(404).json({ message: "Not found" });
      addLog(`Deleted inventory: ${doc.name}`);
      return res.json({ message: "Deleted" });
    } else {
      let arr = readJSON("inventory.json");
      const item = arr.find(i => String(i.id) === String(id));
      if (!item) return res.status(404).json({ message: "Not found" });
      arr = arr.filter(i => String(i.id) !== String(id));
      writeJSON("inventory.json", arr);
      addLog(`Deleted inventory: ${item.name}`);
      return res.json({ message: "Deleted" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- REPORT generation (XLSX) ---
app.get("/api/inventory/report", async (req, res) => {
  try {
    const items = useMongo ? await Inventory.find({}).lean() : readJSON("inventory.json");
    const filename = `Inventory_Report_${new Date().toISOString().slice(0,10)}.xlsx`;
    const full = path.join(reportsDir, filename);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory Report");
    sheet.addRow(["L&B Company - Inventory Report"]);
    sheet.addRow(["Report Generated:", new Date().toLocaleString()]);
    sheet.addRow([]);
    sheet.addRow(["Item ID / SKU","Item Name","Category","Quantity","Unit Cost","Unit Price","Total Inventory Value","Total Potential Revenue","Reorder Point","Target Stock Level"]);

    let totalValue = 0, totalRevenue = 0;
    items.forEach(it => {
      const qty = Number(it.quantity || 0);
      const uc = Number(it.unitCost || 0);
      const up = Number(it.unitPrice || 0);
      const invVal = qty * uc;
      const revVal = qty * up;
      totalValue += invVal;
      totalRevenue += revVal;
      sheet.addRow([it.sku || it._id || "", it.name || "", it.category || "", qty, uc, up, invVal, revVal, it.reorderPoint ?? "", it.targetStockLevel ?? ""]);
    });
    sheet.addRow([]);
    sheet.addRow(["","","","Totals","","", totalValue, totalRevenue]);

    await workbook.xlsx.writeFile(full);

    // add to documents store
    const docEntry = { id: Date.now()+"-"+Math.floor(Math.random()*1e6), name: filename, path: full, size: fs.statSync(full).size, date: new Date().toISOString() };
    if (useMongo) {
      await new DocumentModel(docEntry).save();
    } else {
      const docs = readJSON("documents.json");
      docs.unshift(docEntry);
      writeJSON("documents.json", docs);
    }
    addLog(`Generated report ${filename}`);
    res.download(full);
  } catch (err) {
    console.error("report error", err);
    res.status(500).json({ message: "Report generation failed" });
  }
});

// --- DOCUMENTS endpoints ---
app.get("/api/documents", async (req, res) => {
  if (useMongo) {
    const docs = await DocumentModel.find({}).lean();
    return res.json(docs);
  } else {
    return res.json(readJSON("documents.json"));
  }
});
app.post("/api/documents", upload.array("documents"), async (req, res) => {
  try {
    const files = req.files || [];
    const entries = files.map(f => ({ id: Date.now()+"-"+Math.floor(Math.random()*1e6), name: f.originalname, path: f.path, size: f.size, date: new Date().toISOString() }));
    if (useMongo) {
      await DocumentModel.insertMany(entries);
    } else {
      const docs = readJSON("documents.json");
      writeJSON("documents.json", entries.concat(docs));
    }
    addLog(`Uploaded ${files.length} document(s)`);
    res.json({ message: "Uploaded" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
});
app.delete("/api/documents/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (useMongo) {
      const doc = await DocumentModel.findByIdAndDelete(id).lean();
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.path && fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
      addLog(`Deleted doc ${doc.name}`);
      return res.json({ message: "Deleted" });
    } else {
      let docs = readJSON("documents.json");
      const doc = docs.find(d => String(d.id) === String(id));
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.path && fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
      docs = docs.filter(d => String(d.id) !== String(id));
      writeJSON("documents.json", docs);
      addLog(`Deleted doc ${doc.name}`);
      return res.json({ message: "Deleted" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
});
app.get("/api/documents/:id/download", async (req, res) => {
  try {
    const id = req.params.id;
    let doc;
    if (useMongo) doc = await DocumentModel.findById(id).lean();
    else doc = readJSON("documents.json").find(d => String(d.id) === String(id));
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (!fs.existsSync(doc.path)) return res.status(404).json({ message: "File missing" });
    res.download(doc.path, doc.name, (err) => { if (!err) addLog(`Downloaded ${doc.name}`); });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Download failed" });
  }
});

// --- LOGS ---
app.get("/api/logs", async (req, res) => {
  if (useMongo) {
    const logs = await LogModel.find({}).sort({ time: -1 }).lean();
    res.json(logs);
  } else {
    res.json(readJSON("logs.json"));
  }
});

// Serve client static files
const clientDir = path.join(__dirname, "../client");
app.use(express.static(clientDir));
app.get("*", (req, res) => {
  res.sendFile(path.join(clientDir, "login.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

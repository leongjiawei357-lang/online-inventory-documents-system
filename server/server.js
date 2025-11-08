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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

// directories
const uploadsDir = path.join(__dirname, "uploads");
const reportsDir = path.join(__dirname, "reports");
const dbDir = path.join(__dirname, "filedb");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

function readFile(name) {
  const p = path.join(dbDir, name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, "[]");
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch(e) { return []; }
}
function writeFile(name, data) { fs.writeFileSync(path.join(dbDir, name), JSON.stringify(data, null, 2)); }

// MONGO (optional)
const MONGO_URI = process.env.MONGO_URI || "";
let useMongo = false;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI).then(()=> {
    console.log("✅ MongoDB connected");
    useMongo = true;
  }).catch(err => {
    console.warn("⚠️ Mongo connect failed, falling back to file DB:", err.message);
    useMongo = false;
  });
}

// Schemas
const userSchema = new mongoose.Schema({ username:String, password:String, securityCode:String });
const inventorySchema = new mongoose.Schema({
  sku:String,name:String,category:String,quantity:Number,unitCost:Number,unitPrice:Number,
  reorderPoint:Number,targetStockLevel:Number,createdAt:Date,updatedAt:Date
});
const docSchema = new mongoose.Schema({ name:String, path:String, size:Number, date:String });
const logSchema = new mongoose.Schema({ user:String, action:String, time:String });

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Inventory = mongoose.models.Inventory || mongoose.model("Inventory", inventorySchema);
const DocumentModel = mongoose.models.Document || mongoose.model("Document", docSchema);
const LogModel = mongoose.models.Log || mongoose.model("Log", logSchema);

function addLog(action, user = "System") {
  const entry = { user, action, time: new Date().toISOString() };
  if (useMongo) {
    new LogModel(entry).save().catch(()=>{});
  } else {
    const logs = readFile("logs.json");
    logs.unshift(entry);
    writeFile("logs.json", logs);
  }
}

// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + crypto.randomBytes(4).toString("hex");
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_() ]/g, "_");
    cb(null, `${unique}-${safeName}`);
  }
});
const upload = multer({ storage });

// AUTH
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, securityCode } = req.body;
    if (!username || !password || !securityCode) return res.status(400).json({ message: "Missing fields" });
    if (securityCode !== SECURITY_CODE) return res.status(400).json({ message: "Invalid security code." });

    if (useMongo) {
      const exists = await User.findOne({ username }).lean();
      if (exists) return res.status(400).json({ message: "Username already exists" });
      const u = new User({ username, password, securityCode });
      await u.save();
      addLog(`Registered user ${username}`, username);
      return res.json({ message: "Registered" });
    } else {
      const users = readFile("users.json");
      if (users.find(u => u.username === username)) return res.status(400).json({ message: "Username already exists" });
      users.push({ id: Date.now(), username, password, securityCode });
      writeFile("users.json", users);
      addLog(`Registered user ${username}`, username);
      return res.json({ message: "Registered" });
    }
  } catch(err){ console.error(err); res.status(500).json({ message: "Server error" }); }
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
      const users = readFile("users.json");
      const user = users.find(u => u.username === username && u.password === password);
      if (!user) return res.status(401).json({ message: "Invalid username or password." });
      addLog(`User logged in: ${username}`, username);
      return res.json({ username: user.username });
    }
  } catch(e){ console.error(e); res.status(500).json({ message: "Server error" }); }
});

// INVENTORY CRUD
app.get("/api/inventory", async (req,res) => {
  if (useMongo) { const items = await Inventory.find({}).lean(); return res.json(items); }
  return res.json(readFile("inventory.json"));
});
app.post("/api/inventory", async (req,res) => {
  try {
    const body = req.body;
    const item = { sku: body.sku||"", name: body.name||"", category: body.category||"", quantity: Number(body.quantity||0), unitCost: Number(body.unitCost||0), unitPrice: Number(body.unitPrice||0), reorderPoint: body.reorderPoint !== undefined ? Number(body.reorderPoint) : null, targetStockLevel: body.targetStockLevel !== undefined ? Number(body.targetStockLevel) : null, createdAt: new Date() };
    if (useMongo) { const saved = await new Inventory(item).save(); addLog(`Added inventory item: ${item.name}`); return res.json(saved); }
    else { const arr = readFile("inventory.json"); item.id = Date.now() + "-" + Math.round(Math.random()*1e6); arr.push(item); writeFile("inventory.json", arr); addLog(`Added inventory item: ${item.name}`); return res.json(item); }
  } catch(e){ console.error(e); res.status(500).json({ message: "Server error" }); }
});
app.put("/api/inventory/:id", async (req,res) => {
  try {
    const id = req.params.id;
    if (useMongo) { const updated = await Inventory.findOneAndUpdate({_id:id}, {...req.body, updatedAt:new Date()}, { new:true }).lean(); if(!updated) return res.status(404).json({ message: "Not found" }); addLog(`Updated inventory: ${updated.name}`); return res.json(updated); }
    else { const arr = readFile("inventory.json"); const idx = arr.findIndex(i => String(i.id) === String(id)); if (idx===-1) return res.status(404).json({ message: "Not found" }); arr[idx] = { ...arr[idx], ...req.body, updatedAt: new Date() }; writeFile("inventory.json", arr); addLog(`Updated inventory: ${arr[idx].name}`); return res.json(arr[idx]); }
  } catch(e){ console.error(e); res.status(500).json({ message: "Server error" }); }
});
app.delete("/api/inventory/:id", async (req,res) => {
  try {
    const id = req.params.id;
    if (useMongo) { const doc = await Inventory.findByIdAndDelete(id).lean(); if(!doc) return res.status(404).json({ message: "Not found" }); addLog(`Deleted inventory: ${doc.name}`); return res.json({ message: "Deleted" }); }
    else { let arr = readFile("inventory.json"); const item = arr.find(i => String(i.id) === String(id)); if(!item) return res.status(404).json({ message: "Not found" }); arr = arr.filter(i => String(i.id) !== String(id)); writeFile("inventory.json", arr); addLog(`Deleted inventory: ${item.name}`); return res.json({ message: "Deleted" }); }
  } catch(e){ console.error(e); res.status(500).json({ message: "Server error" }); }
});

// REPORT XLSX -> saves file in reports and adds to documents
app.get("/api/inventory/report", async (req,res) => {
  try {
    const items = useMongo ? await Inventory.find({}).lean() : readFile("inventory.json");
    const nameBase = `Inventory_Report_${new Date().toISOString().slice(0,10)}`;
    const filename = `${nameBase}.xlsx`;
    const fullPath = path.join(reportsDir, filename);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory Report");
    sheet.addRow(["L&B Company - Inventory Report"]);
    sheet.addRow(["Report Generated:", new Date().toLocaleString()]);
    sheet.addRow([]);
    sheet.addRow(["Item ID / SKU","Item Name","Category","Quantity","Unit Cost","Unit Price","Total Inventory Value","Total Potential Revenue","Reorder Point","Target Stock Level"]);

    let totalValue=0, totalRevenue=0;
    (items||[]).forEach(it => {
      const qty = Number(it.quantity||0), uc=Number(it.unitCost||0), up=Number(it.unitPrice||0);
      const invVal = qty*uc, rev = qty*up;
      totalValue += invVal; totalRevenue += rev;
      sheet.addRow([it.sku||it._id||"", it.name||"", it.category||"", qty, uc, up, invVal, rev, it.reorderPoint||"", it.targetStockLevel||""]);
    });
    sheet.addRow([]); sheet.addRow(["","","","Totals","","", totalValue, totalRevenue]);

    await workbook.xlsx.writeFile(fullPath);

    const docEntry = { name: filename, path: fullPath, size: fs.statSync(fullPath).size, date: new Date().toISOString() };
    if (useMongo) await new DocumentModel(docEntry).save();
    else { const docs = readFile("documents.json"); docs.unshift({ id: Date.now(), ...docEntry }); writeFile("documents.json", docs); }

    addLog(`Generated report ${filename}`);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    fs.createReadStream(fullPath).pipe(res);
  } catch(e){ console.error("report err", e); res.status(500).json({ message: "Report generation failed" }); }
});

// DOCUMENTS endpoints
app.get("/api/documents", (req,res) => {
  if (useMongo) DocumentModel.find({}).lean().then(d => res.json(d)).catch(()=>res.json([]));
  else res.json(readFile("documents.json"));
});
app.post("/api/documents", upload.array("documents"), async (req,res) => {
  try {
    const files = req.files || [];
    const entries = files.map(f => ({ id: Date.now() + "-" + Math.round(Math.random()*1e6), name: f.originalname, path: f.path, size: f.size, date: new Date().toISOString() }));
    if (useMongo) await DocumentModel.insertMany(entries);
    else { const docs = readFile("documents.json"); const newDocs = entries.concat(docs); writeFile("documents.json", newDocs); }
    addLog(`Uploaded ${files.length} document(s)`);
    res.json({ message: "Uploaded" });
  } catch(e){ console.error(e); res.status(500).json({ message: "Upload failed" }); }
});
app.delete("/api/documents/:id", (req,res) => {
  try {
    const id = req.params.id;
    if (useMongo) {
      DocumentModel.findByIdAndDelete(id).lean().then(doc => {
        if (!doc) return res.status(404).json({ message: "Not found" });
        if (doc.path && fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
        addLog(`Deleted doc ${doc.name}`);
        res.json({ message: "Deleted" });
      }).catch(()=>res.status(500).json({ message: "Delete failed" }));
    } else {
      let docs = readFile("documents.json");
      const doc = docs.find(d => String(d.id) === String(id));
      if (!doc) return res.status(404).json({ message: "Not found" });
      if (doc.path && fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
      docs = docs.filter(d => String(d.id) !== String(id));
      writeFile("documents.json", docs);
      addLog(`Deleted doc ${doc.name}`);
      res.json({ message: "Deleted" });
    }
  } catch(e){ console.error(e); res.status(500).json({ message: "Delete failed" }); }
});
app.get("/api/documents/:id/download", (req,res) => {
  try {
    const id = req.params.id;
    if (useMongo) {
      DocumentModel.findById(id).lean().then(doc => {
        if (!doc) return res.status(404).json({ message: "Document not found" });
        if (!fs.existsSync(doc.path)) return res.status(404).json({ message: "File missing" });
        res.download(doc.path, doc.name, err => { if (!err) addLog(`Downloaded ${doc.name}`); });
      }).catch(()=>res.status(500).json({ message: "Download failed" }));
    } else {
      const docs = readFile("documents.json");
      const doc = docs.find(d => String(d.id) === String(id));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!fs.existsSync(doc.path)) return res.status(404).json({ message: "File missing" });
      res.download(doc.path, doc.name, err => { if (!err) addLog(`Downloaded ${doc.name}`); });
    }
  } catch(e){ console.error(e); res.status(500).json({ message: "Download failed" }); }
});

// LOGS
app.get("/api/logs", (req,res) => {
  if (useMongo) LogModel.find({}).sort({ time: -1 }).lean().then(l => res.json(l)).catch(()=>res.json([]));
  else res.json(readFile("logs.json"));
});

// Serve client static (client folder should be at project root /client)
const clientDir = path.join(__dirname, "../client");
app.use(express.static(clientDir));
app.get("*", (req,res) => res.sendFile(path.join(clientDir, "index.html")));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

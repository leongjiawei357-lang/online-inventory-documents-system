// server/server.js (ES module)
import express from "express";
import cors from "cors";
import helmet from "helmet";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import ExcelJS from "exceljs";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/inventory_sys";
const SECURITY_CODE = process.env.SECURITY_CODE || "L&B2025";

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Helmet CSP: restrict allowed sources (no inline event handlers)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  })
);

// create folders
const uploadsDir = path.join(__dirname, "uploads");
const reportsDir = path.join(__dirname, "reports");
const dbDir = path.join(__dirname, "db");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// simple file DB helper (fallback to JSON files)
const dbFile = (name) => path.join(dbDir, name);
function readDB(name) {
  const p = dbFile(name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, "[]");
  try {
    return JSON.parse(fs.readFileSync(p));
  } catch (e) {
    return [];
  }
}
function writeDB(name, data) {
  fs.writeFileSync(dbFile(name), JSON.stringify(data, null, 2));
}

// Multer storage safe filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + crypto.randomBytes(4).toString("hex");
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_() ]/g, "_");
    cb(null, `${unique}-${safe}`);
  },
});
const upload = multer({ storage });

// Logging utility
function addLog(action, user = "System") {
  const logs = readDB("logs.json");
  logs.unshift({ id: Date.now() + "-" + crypto.randomBytes(3).toString("hex"), time: new Date().toISOString(), user, action });
  writeDB("logs.json", logs);
}

// ----------------- MONGO (optional) - if you prefer file DB, we still keep file DB as main
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.warn("⚠️ MongoDB connection error - continuing with file DB (if intended):", err.message));

// ----------------- AUTH (file DB) -----------------
app.post("/api/register", (req, res) => {
  const { username, password, securityCode } = req.body;
  if (securityCode !== SECURITY_CODE) return res.status(400).json({ message: "Invalid security code." });

  const users = readDB("users.json");
  if (users.find((u) => u.username === username)) return res.status(400).json({ message: "Username already exists." });

  const user = { id: Date.now() + "-" + crypto.randomBytes(3).toString("hex"), username, password };
  users.push(user);
  writeDB("users.json", users);
  addLog(`Registered user: ${username}`, username);
  res.json({ message: "Registered" });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const users = readDB("users.json");
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ message: "Invalid username or password." });
  addLog(`User logged in: ${username}`, username);
  res.json({ username: user.username });
});

// ----------------- INVENTORY (file DB) -----------------
app.get("/api/inventory", (req, res) => {
  res.json(readDB("inventory.json"));
});

app.post("/api/inventory", (req, res) => {
  const items = readDB("inventory.json");
  const item = {
    id: Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
    sku: req.body.sku || "",
    name: req.body.name || "",
    category: req.body.category || "",
    quantity: Number(req.body.quantity || 0),
    unitCost: Number(req.body.unitCost || 0),
    unitPrice: Number(req.body.unitPrice || 0),
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  writeDB("inventory.json", items);
  addLog(`Added inventory item: ${item.name}`);
  res.json(item);
});

app.put("/api/inventory/:id", (req, res) => {
  const items = readDB("inventory.json");
  const idx = items.findIndex((i) => String(i.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "Item not found" });
  const safe = (({ sku, name, category, quantity, unitCost, unitPrice }) => ({ sku, name, category, quantity, unitCost, unitPrice }))(req.body);
  items[idx] = { ...items[idx], ...safe, updatedAt: new Date().toISOString() };
  writeDB("inventory.json", items);
  addLog(`Updated item: ${items[idx].name}`);
  res.json(items[idx]);
});

app.delete("/api/inventory/:id", (req, res) => {
  let items = readDB("inventory.json");
  const item = items.find((i) => String(i.id) === String(req.params.id));
  if (!item) return res.status(404).json({ message: "Item not found" });
  items = items.filter((i) => String(i.id) !== String(req.params.id));
  writeDB("inventory.json", items);
  addLog(`Deleted item: ${item.name}`);
  res.json({ message: "Deleted" });
});

// ----------------- REPORT (XLSX) -----------------
app.get("/api/inventory/report", async (req, res) => {
  try {
    const items = readDB("inventory.json");
    const filenameBase = `Inventory_Report_${new Date().toISOString().slice(0, 10)}`;
    const xlsxPath = path.join(reportsDir, `${filenameBase}.xlsx`);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory Report");
    sheet.addRow(["L&B Company - Inventory Report"]);
    sheet.addRow(["Date:", new Date().toISOString()]);
    sheet.addRow([]);
    sheet.addRow(["SKU", "Name", "Category", "Quantity", "Unit Cost", "Unit Price", "Total Inventory Value", "Total Potential Revenue"]);
    let totalValue = 0,
      totalRevenue = 0;
    items.forEach((it) => {
      const qty = Number(it.quantity || 0);
      const uc = Number(it.unitCost || 0);
      const up = Number(it.unitPrice || 0);
      const invVal = qty * uc;
      const rev = qty * up;
      totalValue += invVal;
      totalRevenue += rev;
      sheet.addRow([it.sku, it.name, it.category, qty, uc, up, invVal, rev]);
    });
    sheet.addRow([]);
    sheet.addRow(["", "", "", "Totals", "", "", totalValue, totalRevenue]);

    await workbook.xlsx.writeFile(xlsxPath);

    // add to documents DB (so client can show it)
    const docs = readDB("documents.json");
    docs.unshift({
      id: Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
      name: path.basename(xlsxPath),
      path: xlsxPath,
      size: fs.statSync(xlsxPath).size,
      date: new Date().toISOString(),
    });
    writeDB("documents.json", docs);

    addLog(`Generated Inventory Report: ${path.basename(xlsxPath)}`);

    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(xlsxPath)}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    fs.createReadStream(xlsxPath).pipe(res);
  } catch (err) {
    console.error("report generation failed:", err);
    res.status(500).json({ message: "Report generation failed" });
  }
});

// ----------------- DOCUMENTS -----------------
app.get("/api/documents", (req, res) => res.json(readDB("documents.json")));

app.post("/api/documents", upload.array("documents"), (req, res) => {
  const docs = readDB("documents.json");
  (req.files || []).forEach((f) =>
    docs.unshift({
      id: Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
      name: f.originalname,
      path: f.path,
      size: f.size,
      date: new Date().toISOString(),
    })
  );
  writeDB("documents.json", docs);
  addLog(`Uploaded ${req.files.length} document(s)`);
  res.json({ message: "Uploaded" });
});

app.delete("/api/documents/:id", (req, res) => {
  let docs = readDB("documents.json");
  const doc = docs.find((d) => String(d.id) === String(req.params.id));
  if (!doc) return res.status(404).json({ message: "Document not found" });
  try {
    if (fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
  } catch (e) {
    console.warn("unlink failed", e.message);
  }
  docs = docs.filter((d) => String(d.id) !== String(req.params.id));
  writeDB("documents.json", docs);
  addLog(`Deleted document: ${doc.name}`);
  res.json({ message: "Deleted" });
});

app.get("/api/documents/:id/download", (req, res) => {
  const docs = readDB("documents.json");
  const doc = docs.find((d) => String(d.id) === String(req.params.id));
  if (!doc) return res.status(404).json({ message: "Document not found" });
  if (!fs.existsSync(doc.path)) return res.status(404).json({ message: "File missing" });
  res.download(doc.path, doc.name, (err) => {
    if (err) {
      console.error("download error", err);
      if (!res.headersSent) res.status(500).json({ message: "Download failed" });
    } else {
      addLog(`Downloaded document: ${doc.name}`);
    }
  });
});

// ----------------- LOGS -----------------
app.get("/api/logs", (req, res) => res.json(readDB("logs.json")));

// ----------------- Serve client static -----------------
app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/login.html"));
});

// ----------------- Start -----------------
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

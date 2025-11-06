const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

// ===============================
// PATHS
// ===============================
const dbPath = path.join(__dirname, "..", "db");
const UP = path.join(__dirname, "..", "uploads");
const DOCS = path.join(dbPath, "documents.json");
const INVENTORY = path.join(dbPath, "inventory.json");
const LOGS = path.join(dbPath, "logs.json");

if (!fs.existsSync(UP)) fs.mkdirSync(UP);
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath);

// ===============================
// STORAGE
// ===============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage });

// ===============================
// HELPERS
// ===============================
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return [];
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function logAction(action) {
  const logs = readJSON(LOGS);
  logs.unshift({ action, time: new Date().toLocaleString() });
  writeJSON(LOGS, logs);
}

// ===============================
// ROUTES
// ===============================

// GET all documents
router.get("/", (req, res) => res.json(readJSON(DOCS)));

// POST upload documents manually
router.post("/", upload.array("documents", 10), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ message: "No files uploaded" });
  const docs = readJSON(DOCS);

  for (let f of files) {
    const entry = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      name: f.originalname,
      filename: f.filename,
      size: f.size,
      date: new Date().toLocaleString(),
      url: "/uploads/" + f.filename,
    };
    docs.push(entry);
    logAction(`Uploaded document: ${f.originalname}`);
  }
  writeJSON(DOCS, docs);
  res.json({ message: "✅ Documents uploaded successfully!", files: files.length });
});

// DELETE document
router.delete("/:id", (req, res) => {
  const id = req.params.id;
  const docs = readJSON(DOCS);
  const idx = docs.findIndex((d) => d.id === id);
  if (idx === -1) return res.status(404).json({ message: "Document not found" });

  const removed = docs.splice(idx, 1)[0];
  try {
    fs.unlinkSync(path.join(UP, removed.filename));
  } catch (e) {}
  writeJSON(DOCS, docs);
  logAction(`Deleted document: ${removed.name}`);
  res.json({ message: "🗑 Document deleted" });
});

// ===============================
// AUTO-UPLOAD MONTHLY INVENTORY REPORT
// ===============================
router.post("/auto-upload", async (req, res) => {
  try {
    const inventory = readJSON(INVENTORY);
    if (!inventory.length) return res.status(400).json({ message: "No inventory data found" });

    const now = new Date();
    const monthName = now.toLocaleString("default", { month: "long" });
    const reportName = `L&B_Inventory_Report_${monthName}_${now.getFullYear()}`;
    const pdfFile = path.join(UP, `${reportName}.pdf`);
    const excelFile = path.join(UP, `${reportName}.xlsx`);

    // Generate PDF
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(pdfFile));

    doc.fontSize(20).text("L&B Company", { align: "center" });
    doc.fontSize(16).text("Inventory Report", { align: "center" });
    doc.fontSize(12).text(`Date: ${now.toLocaleString()}\n\n`);

    inventory.forEach((item, i) => {
      const totalValue = item.quantity * item.unitCost;
      const potentialRevenue = item.quantity * item.unitPrice;
      doc.text(
        `${i + 1}. ${item.name} | SKU: ${item.sku} | Qty: ${item.quantity} | Category: ${
          item.category
        } | Value: RM${totalValue.toFixed(2)} | Revenue: RM${potentialRevenue.toFixed(2)}`
      );
    });

    doc.end();

    // Generate Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory Report");
    sheet.columns = [
      { header: "SKU", key: "sku", width: 15 },
      { header: "Item Name", key: "name", width: 25 },
      { header: "Category", key: "category", width: 15 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Unit Cost (RM)", key: "unitCost", width: 15 },
      { header: "Unit Price (RM)", key: "unitPrice", width: 15 },
      { header: "Total Value (RM)", key: "value", width: 18 },
      { header: "Potential Revenue (RM)", key: "revenue", width: 22 },
    ];

    inventory.forEach((item) => {
      sheet.addRow({
        sku: item.sku,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unitCost: item.unitCost,
        unitPrice: item.unitPrice,
        value: item.quantity * item.unitCost,
        revenue: item.quantity * item.unitPrice,
      });
    });

    await workbook.xlsx.writeFile(excelFile);

    // Save to documents DB
    const docs = readJSON(DOCS);
    const newEntries = [
      {
        id: Date.now().toString() + "pdf",
        name: `${reportName}.pdf`,
        filename: `${reportName}.pdf`,
        size: fs.statSync(pdfFile).size,
        date: now.toLocaleString(),
        url: "/uploads/" + `${reportName}.pdf`,
      },
      {
        id: Date.now().toString() + "xlsx",
        name: `${reportName}.xlsx`,
        filename: `${reportName}.xlsx`,
        size: fs.statSync(excelFile).size,
        date: now.toLocaleString(),
        url: "/uploads/" + `${reportName}.xlsx`,
      },
    ];

    docs.push(...newEntries);
    writeJSON(DOCS, docs);
    logAction(`Auto-uploaded monthly inventory report: ${reportName}`);

    res.json({ message: "✅ Monthly report generated and uploaded!", files: newEntries.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "⚠️ Failed to auto-upload report." });
  }
});

module.exports = router;

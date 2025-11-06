const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

const dbPath = path.join(__dirname, "..", "db");
const UP = path.join(__dirname, "..", "uploads");

const INVENTORY = path.join(dbPath, "inventory.json");
const LOGS = path.join(dbPath, "logs.json");

if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath);
if (!fs.existsSync(UP)) fs.mkdirSync(UP);

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
// GET INVENTORY
// ===============================
router.get("/", (req, res) => res.json(readJSON(INVENTORY)));

// ===============================
// ADD INVENTORY ITEM
// ===============================
router.post("/", (req, res) => {
  const data = readJSON(INVENTORY);
  const newItem = {
    id: Date.now(),
    sku: req.body.sku,
    name: req.body.name,
    category: req.body.category,
    quantity: parseInt(req.body.quantity || 0, 10),
    unitCost: parseFloat(req.body.unitCost || 0),
    unitPrice: parseFloat(req.body.unitPrice || 0),
  };
  data.push(newItem);
  writeJSON(INVENTORY, data);
  logAction(`Added new item: ${newItem.name}`);
  res.json(newItem);
});

// ===============================
// UPDATE ITEM
// ===============================
router.put("/:id", (req, res) => {
  const data = readJSON(INVENTORY);
  const idx = data.findIndex((i) => i.id == req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Item not found" });

  data[idx] = { ...data[idx], ...req.body };
  writeJSON(INVENTORY, data);
  logAction(`Updated item: ${data[idx].name}`);
  res.json(data[idx]);
});

// ===============================
// DELETE ITEM
// ===============================
router.delete("/:id", (req, res) => {
  const data = readJSON(INVENTORY);
  const idx = data.findIndex((i) => i.id == req.params.id);
  if (idx === -1) return res.status(404).json({ message: "Item not found" });

  const removed = data.splice(idx, 1)[0];
  writeJSON(INVENTORY, data);
  logAction(`Deleted item: ${removed.name}`);
  res.json({ message: "Deleted successfully" });
});

// ===============================
// GENERATE INVENTORY REPORT (PDF + Excel)
// ===============================
router.post("/report", async (req, res) => {
  try {
    const inventory = readJSON(INVENTORY);
    if (!inventory.length)
      return res.status(400).json({ message: "No inventory data found" });

    const now = new Date();
    const reportName = `Inventory_Report_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const pdfFile = path.join(UP, `${reportName}.pdf`);
    const excelFile = path.join(UP, `${reportName}.xlsx`);

    // --- PDF GENERATION ---
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(pdfFile));

    doc.fontSize(20).text("L&B Company", { align: "center" });
    doc.fontSize(16).text("Inventory Report", { align: "center" });
    doc.fontSize(12).text(`Report Date: ${now.toLocaleString()}\n\n`);

    let totalValue = 0;
    let totalRevenue = 0;
    let totalQty = 0;

    inventory.forEach((item, i) => {
      const itemValue = item.quantity * item.unitCost;
      const itemRevenue = item.quantity * item.unitPrice;
      totalValue += itemValue;
      totalRevenue += itemRevenue;
      totalQty += item.quantity;

      doc.text(
        `${i + 1}. ${item.name} | SKU: ${item.sku} | Category: ${item.category}\n` +
        `Qty: ${item.quantity} | Unit Cost: RM${item.unitCost.toFixed(2)} | ` +
        `Unit Price: RM${item.unitPrice.toFixed(2)} | ` +
        `Value: RM${itemValue.toFixed(2)} | Revenue: RM${itemRevenue.toFixed(2)}\n`
      );
      doc.moveDown(0.5);
    });

    doc.moveDown();
    doc.text(`Total Quantity: ${totalQty}`);
    doc.text(`Total Inventory Value: RM${totalValue.toFixed(2)}`);
    doc.text(`Total Potential Revenue: RM${totalRevenue.toFixed(2)}`);
    doc.end();

    // --- EXCEL GENERATION ---
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory Report");

    sheet.columns = [
      { header: "Item ID / SKU", key: "sku", width: 15 },
      { header: "Item Name", key: "name", width: 25 },
      { header: "Category", key: "category", width: 15 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Unit Cost (RM)", key: "unitCost", width: 15 },
      { header: "Unit Price (RM)", key: "unitPrice", width: 15 },
      { header: "Total Inventory Value (RM)", key: "value", width: 20 },
      { header: "Total Potential Revenue (RM)", key: "revenue", width: 22 },
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

    const summaryRow = sheet.addRow({
      sku: "",
      name: "TOTAL",
      category: "",
      quantity: totalQty,
      unitCost: "",
      unitPrice: "",
      value: totalValue,
      revenue: totalRevenue,
    });
    summaryRow.font = { bold: true };

    await workbook.xlsx.writeFile(excelFile);

    logAction(`Generated manual inventory report (${reportName})`);

    res.json({
      message: "✅ Inventory report generated successfully!",
      files: [
        { type: "PDF", path: `/uploads/${reportName}.pdf` },
        { type: "Excel", path: `/uploads/${reportName}.xlsx` },
      ],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "⚠️ Failed to generate report." });
  }
});

module.exports = router;

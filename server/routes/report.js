// server/routes/report.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const router = express.Router();
const dbPath = path.join(__dirname, "../db/inventory.json");
const reportFolder = path.join(__dirname, "../reports");
if (!fs.existsSync(reportFolder)) fs.mkdirSync(reportFolder);

function readInventory() {
  try {
    return JSON.parse(fs.readFileSync(dbPath));
  } catch {
    return [];
  }
}

// Generate report filename
function getReportName() {
  const date = new Date().toISOString().split("T")[0];
  return `Inventory_Report_${date}`;
}

// ---- Excel Report ----
router.get("/excel", async (req, res) => {
  const inventory = readInventory();
  const reportName = getReportName();
  const filePath = path.join(reportFolder, `${reportName}.xlsx`);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory Report");

  sheet.columns = [
    { header: "Item ID/SKU", key: "id", width: 15 },
    { header: "Item Name", key: "name", width: 25 },
    { header: "Category", key: "category", width: 15 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Unit Cost", key: "unitCost", width: 12 },
    { header: "Unit Price", key: "unitPrice", width: 12 },
    { header: "Total Inventory Value", key: "totalValue", width: 20 },
    { header: "Total Potential Revenue", key: "potentialRevenue", width: 22 },
  ];

  let totalValue = 0;
  let totalRevenue = 0;

  inventory.forEach((item) => {
    const total = item.quantity * item.unitCost;
    const revenue = item.quantity * item.unitPrice;
    totalValue += total;
    totalRevenue += revenue;
    sheet.addRow({
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unitCost: item.unitCost,
      unitPrice: item.unitPrice,
      totalValue: total,
      potentialRevenue: revenue,
    });
  });

  sheet.addRow([]);
  sheet.addRow(["", "", "", "", "", "Grand Totals", totalValue, totalRevenue]);

  await workbook.xlsx.writeFile(filePath);
  res.download(filePath);
});

// ---- PDF Report ----
router.get("/pdf", (req, res) => {
  const inventory = readInventory();
  const reportName = getReportName();
  const filePath = path.join(reportFolder, `${reportName}.pdf`);

  const doc = new PDFDocument();
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(20).text("Inventory Report - L&B Company", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`);
  doc.moveDown();

  let totalValue = 0;
  let totalRevenue = 0;

  inventory.forEach((item) => {
    const total = item.quantity * item.unitCost;
    const revenue = item.quantity * item.unitPrice;
    totalValue += total;
    totalRevenue += revenue;

    doc.text(
      `${item.id} | ${item.name} | Qty: ${item.quantity} | Cost: ${item.unitCost} | Price: ${item.unitPrice}`
    );
  });

  doc.moveDown();
  doc.text(`Total Inventory Value: ${totalValue}`);
  doc.text(`Total Potential Revenue: ${totalRevenue}`);

  doc.end();
  stream.on("finish", () => res.download(filePath));
});

module.exports = router;

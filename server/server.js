// server/server.js (CommonJS)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inventory_system';
const SECURITY_CODE = process.env.SECURITY_CODE || 'L&B2025';

app.use(cors());
app.use(express.json());
app.use(helmet());
app.use('/uploads', express.static(path.join(__dirname,'uploads')));
app.use('/reports', express.static(path.join(__dirname,'reports')));

// connect to mongo
mongoose.connect(MONGO_URI).then(()=>console.log('✅ MongoDB connected')).catch(err=>console.error('MongoDB error',err));

// === Schemas ===
const userSchema = new mongoose.Schema({ username:String, password:String, createdAt:Date });
const User = mongoose.model('User', userSchema);

const invSchema = new mongoose.Schema({
  sku:String, name:String, category:String, quantity:Number, unitCost:Number, unitPrice:Number, createdAt:Date, updatedAt:Date
});
const Inventory = mongoose.model('Inventory', invSchema);

const docSchema = new mongoose.Schema({ name:String, path:String, size:Number, date:String });
const Document = mongoose.model('Document', docSchema);

const logSchema = new mongoose.Schema({ user:String, action:String, time:Date });
const Log = mongoose.model('Log', logSchema);

// helper log
async function addLog(action, user='System'){
  await Log.create({ user, action, time:new Date() });
}

// === Auth ===
app.post('/api/register', async (req,res)=>{
  try {
    const { username, password, securityCode } = req.body; // matches client
    if (securityCode !== SECURITY_CODE) return res.status(400).json({ message: 'Invalid security code.' });
    if (!username || !password) return res.status(400).json({ message: 'Missing fields.' });
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: 'Username already exists.' });
    const u = new User({ username, password, createdAt: new Date() });
    await u.save();
    await addLog(`Registered user ${username}`, username);
    res.json({ message:'Registered', username });
  } catch(err) { console.error(err); res.status(500).json({ message:'Server error' }); }
});

app.post('/api/login', async (req,res)=>{
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ message:'Invalid username or password.' });
    await addLog(`User logged in: ${username}`, username);
    res.json({ username: user.username });
  } catch(err){ console.error(err); res.status(500).json({ message:'Server error' }); }
});

// === Inventory CRUD ===
app.get('/api/inventory', async (req,res)=>{
  const items = await Inventory.find({}).lean();
  res.json(items);
});
app.post('/api/inventory', async (req,res)=>{
  const body = req.body;
  const item = new Inventory({ ...body, createdAt: new Date() });
  await item.save();
  await addLog(`Added inventory: ${item.name}`);
  res.json(item);
});
app.put('/api/inventory/:id', async (req,res)=>{
  const id = req.params.id;
  const updated = await Inventory.findByIdAndUpdate(id, { ...req.body, updatedAt: new Date() }, { new:true });
  if(!updated) return res.status(404).json({ message:'Not found' });
  await addLog(`Updated inventory: ${updated.name}`);
  res.json(updated);
});
app.delete('/api/inventory/:id', async (req,res)=>{
  const id = req.params.id;
  const del = await Inventory.findByIdAndDelete(id);
  if(!del) return res.status(404).json({ message:'Not found' });
  await addLog(`Deleted inventory: ${del.name}`);
  res.json({ message:'Deleted' });
});

// === Reports (xlsx) ===
const reportsDir = path.join(__dirname,'reports'); if(!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);
app.get('/api/inventory/report', async (req,res)=>{
  try {
    const items = await Inventory.find({}).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventory Report');
    sheet.addRow(['L&B Company - Inventory Report']);
    sheet.addRow(['Report Date:', new Date().toLocaleString()]);
    sheet.addRow([]);
    sheet.addRow(['SKU','Name','Category','Quantity','Unit Cost','Unit Price','Total Inventory Value','Total Potential Revenue']);
    let totalValue=0,totalRevenue=0;
    items.forEach(it=>{
      const invVal = (it.quantity||0)*(it.unitCost||0);
      const rev = (it.quantity||0)*(it.unitPrice||0);
      totalValue += invVal; totalRevenue += rev;
      sheet.addRow([it.sku,it.name,it.category,it.quantity,it.unitCost,it.unitPrice,invVal,rev]);
    });
    sheet.addRow([]);
    sheet.addRow(['','','','Totals','','',totalValue,totalRevenue]);
    const filename = `Inventory_Report_${new Date().toISOString().slice(0,10)}.xlsx`;
    const outPath = path.join(reportsDir, filename);
    await workbook.xlsx.writeFile(outPath);
    // save as document record
    await Document.create({ name: filename, path: outPath, size: fs.statSync(outPath).size, date:new Date().toLocaleString() });
    await addLog(`Generated report ${filename}`);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    fs.createReadStream(outPath).pipe(res);
  } catch(err){ console.error(err); res.status(500).json({ message:'Report error' }); }
});

// === Documents ===
const upload = multer({ dest: path.join(__dirname,'uploads') });
app.get('/api/documents', async (req,res) => {
  const docs = await Document.find({}).lean();
  res.json(docs);
});
app.post('/api/documents', upload.array('documents'), async (req,res) => {
  try {
    const saved = [];
    for (const f of req.files || []) {
      const rec = await Document.create({ name: f.originalname, path: f.path, size: f.size, date: new Date().toLocaleString() });
      saved.push(rec);
    }
    await addLog(`Uploaded ${saved.length} document(s)`);
    res.json({ message: 'Uploaded', saved });
  } catch (err) { console.error(err); res.status(500).json({ message:'Upload failed' }); }
});
app.get('/api/documents/:id/download', async (req,res) => {
  try {
    const doc = await Document.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message:'Not found' });
    if (!fs.existsSync(doc.path)) return res.status(404).json({ message:'File missing' });
    res.download(doc.path, doc.name, err => { if (err) console.error(err); });
  } catch(err){ console.error(err); res.status(500).json({ message:'Download error' }); }
});
app.delete('/api/documents/:id', async (req,res)=>{
  try {
    const doc = await Document.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message:'Not found' });
    try { if (fs.existsSync(doc.path)) fs.unlinkSync(doc.path); } catch(e){ console.warn(e.message); }
    await addLog(`Deleted document: ${doc.name}`);
    res.json({ message:'Deleted' });
  } catch(err) { console.error(err); res.status(500).json({ message:'Delete failed' }); }
});

// === Logs ===
app.get('/api/logs', async (req,res) => {
  const logs = await Log.find({}).sort({ time: -1 }).limit(200).lean();
  res.json(logs);
});

// === Serve client ===
app.use(express.static(path.join(__dirname,'../client')));
app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname,'../client/index.html'));
});

app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));

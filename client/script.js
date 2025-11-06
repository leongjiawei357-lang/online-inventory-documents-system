// client/script.js
// API base: relative so same-origin works on Render
const API_BASE = "https://online-inventory-documents-system.onrender.com/api";

// ====== Utilities ======
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }
function eJSON(res){ return res.json().catch(()=>({})); }
function showMsg(el, text, color='red'){ if(!el) return; el.textContent = text; el.style.color = color; }

// Escape HTML simple
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// ====== Auth redirect (keep user on login) ======
if(!sessionStorage.getItem('isLoggedIn') && !window.location.pathname.includes('login.html')) {
  window.location.href = 'login.html';
}

// ====== Global state ======
let inventory = [];
let documents = [];
let activityLog = [];
const currentPage = window.location.pathname.split('/').pop();

// ====== On load init ======
window.addEventListener('load', async () => {
  try {
    const adminName = sessionStorage.getItem('adminName') || localStorage.getItem('adminName');
    if(qs('#adminName')) qs('#adminName').textContent = adminName || 'Admin';

    if(currentPage.includes('inventory')) { await fetchInventory(); bindInventoryUI(); }
    if(currentPage.includes('documents')) { await fetchDocuments(); bindDocumentsUI(); }
    if(currentPage.includes('log')) { await fetchLogs(); }
    if(currentPage.includes('index.html') || currentPage === '' || currentPage === 'index.html') {
      if(window.fetchDashboardData) fetchDashboardData();
    }
    if(currentPage.includes('product')) bindProductPage();

    const theme = localStorage.getItem('theme');
    if(theme === 'dark') document.body.classList.add('dark-mode');
  } catch(e){ console.error('init error', e); }
});

// ====== AUTH ======
async function login(){
  const user = qs('#username')?.value.trim();
  const pass = qs('#password')?.value.trim();
  const msg = qs('#loginMessage');
  showMsg(msg, '');
  if(!user||!pass){ showMsg(msg, '⚠️ Please enter username and password.', 'red'); return; }

  try{
    const res = await fetch(`${API_BASE}/login`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await eJSON(res);
    if(res.ok){
      sessionStorage.setItem('isLoggedIn','true');
      sessionStorage.setItem('adminName', data.username || user);
      localStorage.setItem('adminName', data.username || user);
      showMsg(msg, '✅ Login successful! Redirecting...', 'green');
      setTimeout(()=> window.location.href = 'index.html', 700);
    } else {
      showMsg(msg, data.message || '❌ Invalid username or password.', 'red');
    }
  } catch(e){
    showMsg(msg, '❌ Unable to contact server.', 'red');
  }
}

async function register(){
  const user = qs('#newUsername')?.value.trim();
  const pass = qs('#newPassword')?.value.trim();
  const code = qs('#securityCode')?.value.trim();
  const msg = qs('#registerMessage');
  showMsg(msg, '');
  if(!user||!pass||!code){ showMsg(msg, '⚠️ Please fill in all fields.', 'red'); return; }

  try{
    const res = await fetch(`${API_BASE}/register`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username: user, password: pass, securityCode: code })
    });
    const data = await eJSON(res);
    if(res.ok){
      showMsg(msg, '✅ Registered successfully! You can now log in.', 'green');
      setTimeout(()=> toggleForm(), 900);
    } else {
      showMsg(msg, data.message || '❌ Registration failed.', 'red');
    }
  } catch(e){
    showMsg(msg, '❌ Unable to contact server.', 'red');
  }
}

function toggleForm(){
  const loginForm = qs('#loginForm');
  const registerForm = qs('#registerForm');
  const formTitle = qs('#formTitle');
  if(!loginForm || !registerForm) return;
  if(getComputedStyle(loginForm).display === 'none'){
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    formTitle.textContent = '🔐 Admin Login';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    formTitle.textContent = '🧾 Register Account';
  }
}

// Bind login/register UI events (CSP-safe)
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = qs('#loginBtn');
  const registerBtn = qs('#registerBtn');
  const toggleToRegister = qs('#toggleToRegister');
  const toggleToLogin = qs('#toggleToLogin');
  if(loginBtn) loginBtn.addEventListener('click', login);
  if(registerBtn) registerBtn.addEventListener('click', register);
  if(toggleToRegister) toggleToRegister.addEventListener('click', toggleForm);
  if(toggleToLogin) toggleToLogin.addEventListener('click', toggleForm);
});

// ====== INVENTORY ======
async function fetchInventory(){
  try{
    const res = await fetch(`${API_BASE}/inventory`);
    if(!res.ok) throw new Error('Failed to fetch inventory.');
    inventory = await res.json();
    renderInventory();
  } catch(err){
    console.error(err);
    alert('⚠️ Unable to load inventory data.');
  }
}

function renderInventory(){
  const tbody = qs('#inventoryTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  let totalValue = 0, totalRevenue = 0, totalStock = 0;

  inventory.forEach((item, i) => {
    const qty = Number(item.quantity || 0);
    const uc = Number(item.unitCost || 0);
    const up = Number(item.unitPrice || 0);
    const itemTotalValue = qty * uc;
    const itemRevenue = qty * up;
    totalValue += itemTotalValue;
    totalRevenue += itemRevenue;
    totalStock += qty;

    const tr = document.createElement('tr');
    tr.dataset.index = i;
    tr.innerHTML = `
      <td>${escapeHtml(item.sku||'')}</td>
      <td>${escapeHtml(item.name||'')}</td>
      <td>${escapeHtml(item.category||'')}</td>
      <td>${qty}</td>
      <td>${uc.toFixed(2)}</td>
      <td>${up.toFixed(2)}</td>
      <td>${itemTotalValue.toFixed(2)}</td>
      <td>${itemRevenue.toFixed(2)}</td>
      <td class="actions"></td>
    `;
    tbody.appendChild(tr);

    // actions
    const actionsTd = tr.querySelector('.actions');
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit-btn';
    editBtn.type = 'button';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', ()=> openEditPageForItem(item));

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn del-btn';
    delBtn.type = 'button';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', ()=> deleteItemConfirm(i));

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);
  });

  if(qs('#totalValue')) qs('#totalValue').textContent = totalValue.toFixed(2);
  if(qs('#totalRevenue')) qs('#totalRevenue').textContent = totalRevenue.toFixed(2);
  if(qs('#totalStock')) qs('#totalStock').textContent = totalStock;
}

// Called by Edit button
function openEditPageForItem(item){
  if(!item || !item.id) { alert('Cannot edit: id missing'); return; }
  window.location.href = `product.html?id=${encodeURIComponent(item.id)}`;
}

async function deleteItemConfirm(i){
  const item = inventory[i];
  if(!item) return;
  if(!confirm(`Delete "${item.name}"?`)) return;
  try{
    const res = await fetch(`${API_BASE}/inventory/${item.id}`, { method: 'DELETE' });
    if(!res.ok){ const txt = await res.text(); throw new Error(txt||'Delete failed'); }
    alert('🗑️ Item deleted!');
    await fetchInventory();
  } catch(err){ console.error(err); alert('❌ Delete failed'); }
}

// Add product from top bar
async function addProductFromBar(){
  const sku = qs('#p_sku')?.value.trim();
  const name = qs('#p_name')?.value.trim();
  const category = qs('#p_category')?.value.trim();
  const quantity = parseInt(qs('#p_quantity')?.value || 0, 10);
  const unitCost = parseFloat(qs('#p_unitCost')?.value || 0);
  const unitPrice = parseFloat(qs('#p_unitPrice')?.value || 0);
  if(!sku || !name) return alert('Please enter SKU and Name.');

  try{
    const res = await fetch(`${API_BASE}/inventory`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ sku, name, category, quantity, unitCost, unitPrice })
    });
    if(!res.ok) { const txt = await res.text(); throw new Error(txt||'Add failed'); }
    ['#p_sku','#p_name','#p_category','#p_quantity','#p_unitCost','#p_unitPrice'].forEach(id => { if(qs(id)) qs(id).value=''; });
    await fetchInventory();
    alert('✅ Product added.');
  } catch(err){ console.error(err); alert('❌ Add failed.'); }
}

// Search items
function searchItems(){
  const q = (qs('#searchInput')?.value || '').toLowerCase().trim();
  const rows = qsa('#inventoryTable tbody tr');
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    r.style.display = text.includes(q) ? '' : 'none';
  });
}

// ================= REPORT (download xlsx & refresh documents) =================
async function generateReport(){
  try{
    const res = await fetch(`${API_BASE}/inventory/report`);
    if(!res.ok){
      const txt = await res.text();
      throw new Error(txt || 'Failed to generate report');
    }
    const blob = await res.blob();
    const filename = `Inventory_Report_${new Date().toISOString().slice(0,10)}.xlsx`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();

    // give server a moment to write documents.json then refresh documents
    setTimeout(()=> { if(typeof fetchDocuments === 'function') fetchDocuments().catch(()=>{}); }, 500);
    alert('✅ Report downloaded and added to Documents.');
  } catch(err){
    console.error(err);
    alert('❌ Report generation failed: ' + (err.message || err));
  }
}

// ====== DOCUMENTS ======
async function fetchDocuments(){
  try{
    const res = await fetch(`${API_BASE}/documents`);
    if(!res.ok) throw new Error('Failed to load documents.');
    documents = await res.json();
    renderDocuments();
  } catch(err){ console.error('Failed to load documents', err); alert('⚠️ Unable to load documents.'); }
}

function renderDocuments(){
  const list = qs('#docList');
  if(!list) return;
  list.innerHTML = '';
  documents.forEach((d,i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(d.name)} ${(d.size?('('+ (d.size/1024).toFixed(1)+' KB)'):'')}</span>`;
    const btnDown = document.createElement('button'); btnDown.textContent='⬇️'; btnDown.type='button';
    btnDown.addEventListener('click', ()=> downloadDocument(d.id, d.name));
    const btnDel = document.createElement('button'); btnDel.textContent='🗑'; btnDel.type='button';
    btnDel.addEventListener('click', ()=> deleteDocumentConfirm(i));
    li.appendChild(btnDown); li.appendChild(btnDel);
    list.appendChild(li);
  });
}

async function uploadDocuments(){
  const input = qs('#docUpload');
  const files = Array.from(input?.files || []);
  if(!files.length) return alert('No files selected.');
  const form = new FormData();
  files.forEach(f => form.append('documents', f));
  try{
    const res = await fetch(`${API_BASE}/documents`, { method: 'POST', body: form });
    if(!res.ok){ const txt = await res.text(); throw new Error(txt||'Upload failed'); }
    input.value = '';
    await fetchDocuments();
    alert('✅ Uploaded successfully!');
  } catch(err){ console.error(err); alert('⚠️ Unable to upload documents.'); }
}

async function downloadDocument(id,name){
  try{
    const res = await fetch(`${API_BASE}/documents/${id}/download`);
    if(!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
  } catch(err){ console.error(err); alert('⚠️ Unable to download file.'); }
}

async function deleteDocumentConfirm(i){
  const doc = documents[i];
  if(!doc) return;
  if(!confirm(`Delete '${doc.name}'?`)) return;
  try{
    const res = await fetch(`${API_BASE}/documents/${doc.id}`, { method: 'DELETE' });
    if(!res.ok){ const txt = await res.text(); throw new Error(txt||'Delete failed'); }
    await fetchDocuments();
    alert('🗑️ Deleted!');
  } catch(err){ console.error(err); alert('❌ Delete failed.'); }
}

// ====== LOGS ======
async function fetchLogs(){
  try{
    const res = await fetch(`${API_BASE}/logs`);
    if(!res.ok) throw new Error('Failed to load logs');
    activityLog = await res.json();
    const list = qs('#logList');
    if(!list) return;
    list.innerHTML = '';
    activityLog.slice().reverse().forEach(l => {
      const li = document.createElement('li');
      li.textContent = `${l.time} - ${l.action}`;
      list.appendChild(li);
    });
  } catch(err){ console.error(err); }
}

// ====== DASHBOARD helper used by index.html ======
async function fetchDashboardData(){
  try{
    const res = await fetch(`${API_BASE}/logs`);
    if(!res.ok) return;
    const logs = await res.json();
    const tbody = qs('#recentActivities');
    if(tbody) {
      tbody.innerHTML = '';
      logs.slice(0,5).forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(log.user || 'Admin')}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.time)}</td>`;
        tbody.appendChild(tr);
      });
    }
    // unique users logged today
    const today = new Date().toLocaleDateString();
    const usersToday = new Set(logs.filter(l => new Date(l.time).toLocaleDateString() === today).map(l => l.user));
    if(qs('#totalUsers')) qs('#totalUsers').textContent = usersToday.size;
  } catch(e){ console.error('dashboard fetch failed', e); }
}

// ====== UTILITIES/Bindings for UI ======
function logout(){
  sessionStorage.removeItem('isLoggedIn');
  sessionStorage.removeItem('adminName');
  localStorage.removeItem('adminName');
  window.location.href = 'login.html';
}
function toggleTheme(){
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

// Bind inventory UI controls
function bindInventoryUI(){
  if(qs('#addProductBtn')) qs('#addProductBtn').addEventListener('click', addProductFromBar);
  if(qs('#reportBtn')) qs('#reportBtn').addEventListener('click', generateReport);
  if(qs('#searchInput')) qs('#searchInput').addEventListener('input', searchItems);
  if(qs('#clearSearchBtn')) qs('#clearSearchBtn').addEventListener('click', ()=> { if(qs('#searchInput')) qs('#searchInput').value=''; searchItems(); });
}

// Bind documents page UI
function bindDocumentsUI(){
  if(qs('#uploadDocsBtn')) qs('#uploadDocsBtn').addEventListener('click', uploadDocuments);
  if(qs('#searchDocs')) qs('#searchDocs').addEventListener('input', ()=> {
    const q = (qs('#searchDocs').value||'').toLowerCase();
    qsa('#docList li').forEach(li => li.style.display = li.textContent.toLowerCase().includes(q)?'':'none');
  });
}

// Product page (load item by ?id=)
function bindProductPage(){
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const form = qs('#productForm');
  if(!form) return;
  if(id){
    // load inventory and find item
    fetch(`${API_BASE}/inventory`).then(r=>r.json()).then(items=>{
      const it = items.find(x => String(x.id) === String(id));
      if(!it) { alert('Item not found'); return; }
      qs('#prod_id').value = it.id;
      qs('#prod_sku').value = it.sku || '';
      qs('#prod_name').value = it.name || '';
      qs('#prod_category').value = it.category || '';
      qs('#prod_quantity').value = it.quantity || 0;
      qs('#prod_unitCost').value = it.unitCost || 0;
      qs('#prod_unitPrice').value = it.unitPrice || 0;
    }).catch(()=>{});
  }
  if(qs('#saveProductBtn')) qs('#saveProductBtn').addEventListener('click', async ()=>{
    const idVal = qs('#prod_id').value;
    const body = {
      sku: qs('#prod_sku').value,
      name: qs('#prod_name').value,
      category: qs('#prod_category').value,
      quantity: Number(qs('#prod_quantity').value||0),
      unitCost: Number(qs('#prod_unitCost').value||0),
      unitPrice: Number(qs('#prod_unitPrice').value||0)
    };
    try{
      const res = await fetch(`${API_BASE}/inventory/${idVal}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if(!res.ok) { const txt = await res.text(); throw new Error(txt||'Update failed'); }
      alert('✅ Item updated');
      window.location.href = 'inventory.html';
    } catch(e){ console.error(e); alert('❌ Update failed'); }
  });
  if(qs('#cancelProductBtn')) qs('#cancelProductBtn').addEventListener('click', ()=> window.location.href = 'inventory.html');
}

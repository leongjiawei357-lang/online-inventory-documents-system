// ===============================
// CONFIG
// ===============================
const API_BASE = "/api"; // relative path works locally and on Render

// ===============================
// UTILS & GLOBALS
// ===============================
let inventory = [];
let documents = [];
let activityLog = [];
const currentPage = window.location.pathname.split("/").pop();

// Helper safe fetch JSON
async function safeFetchJson(url, opts){
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text().catch(()=>null);
    const err = new Error(txt || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ===============================
// DOM READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  // Bind login/register buttons (CSP-safe)
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const toggleToRegister = document.getElementById("toggleToRegister");
  const toggleToLogin = document.getElementById("toggleToLogin");
  const logoutBtn = document.getElementById("logoutBtn");
  const themeBtn = document.getElementById("themeBtn");
  const goInventory = document.getElementById("goInventory");
  const goDocuments = document.getElementById("goDocuments");

  if (loginBtn) loginBtn.addEventListener("click", login);
  if (registerBtn) registerBtn.addEventListener("click", register);
  if (toggleToRegister) toggleToRegister.addEventListener("click", toggleForm);
  if (toggleToLogin) toggleToLogin.addEventListener("click", toggleForm);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
  if (goInventory) goInventory.addEventListener("click", ()=> location.href='inventory.html');
  if (goDocuments) goDocuments.addEventListener("click", ()=> location.href='documents.html');

  // set adminName if present
  const adminName = sessionStorage.getItem("adminName") || localStorage.getItem("adminName");
  if (document.getElementById("adminName")) document.getElementById("adminName").textContent = adminName || "Admin";

  // page-specific setups
  if (currentPage.includes("inventory")) fetchInventory();
  if (currentPage.includes("documents")) fetchDocuments();
  if (currentPage.includes("log")) fetchLogs();

  // theme
  const theme = localStorage.getItem("theme");
  if (theme === "dark") document.body.classList.add("dark-mode");

  // clock on dashboard
  if (document.getElementById("clock")) {
    updateClock();
    setInterval(updateClock, 1000);
    fetchDashboardData(); // populate recent activities
    setInterval(fetchDashboardData, 10000);
  }
});

// ===============================
// AUTH
// ===============================
function showMsg(id, text, color="red") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

async function login(){
  const user = document.getElementById("username")?.value.trim();
  const pass = document.getElementById("password")?.value.trim();
  showMsg("loginMessage", "");

  if (!user || !pass) { showMsg("loginMessage","⚠️ Please enter username and password.", "red"); return; }

  try{
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ username: user, password: pass })
    });
    if (!res.ok) {
      const j = await res.json().catch(()=>null);
      throw new Error(j?.message || "Invalid username or password");
    }
    const data = await res.json();
    sessionStorage.setItem("isLoggedIn","true");
    sessionStorage.setItem("adminName", data.username || user);
    localStorage.setItem("adminName", data.username || user);
    showMsg("loginMessage","✅ Login successful! Redirecting...", "green");
    setTimeout(()=> location.href = "index.html", 700);
  }catch(e){
    showMsg("loginMessage", `❌ ${e.message || "Unable to contact server."}`, "red");
  }
}

async function register(){
  const user = document.getElementById("newUsername")?.value.trim();
  const pass = document.getElementById("newPassword")?.value.trim();
  const code = document.getElementById("securityCode")?.value.trim();
  showMsg("registerMessage", "");

  if (!user || !pass || !code) { showMsg("registerMessage","⚠️ Please fill in all fields.", "red"); return; }

  try{
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ username: user, password: pass, securityCode: code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Registration failed");
    showMsg("registerMessage","✅ Registered successfully! You can now log in.", "green");
    setTimeout(toggleForm, 1100);
  }catch(e){
    showMsg("registerMessage", `❌ ${e.message || "Unable to contact server."}`, "red");
  }
}

function toggleForm(){
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const formTitle = document.getElementById("formTitle");
  if (!loginForm || !registerForm || !formTitle) return;
  if (loginForm.style.display === "none"){
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    formTitle.textContent = "🔐 Admin Login";
  } else {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    formTitle.textContent = "🧾 Register Account";
  }
}

// ===============================
// INVENTORY
// ===============================
async function fetchInventory(){
  try{
    const res = await fetch(`${API_BASE}/inventory`);
    if (!res.ok) throw new Error("Failed to fetch inventory.");
    inventory = await res.json();
    renderInventory();
  }catch(e){
    console.error(e);
    alert("⚠️ Unable to load inventory data.");
  }
}

function renderInventory(){
  const tbody = document.querySelector("#inventoryTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  let totalValue = 0, totalRevenue = 0, totalStock = 0;
  inventory.forEach((item, i) => {
    const qty = Number(item.quantity||0);
    const uc = Number(item.unitCost||0);
    const up = Number(item.unitPrice||0);
    const itemTotalValue = qty * uc;
    const itemRevenue = qty * up;
    totalValue += itemTotalValue;
    totalRevenue += itemRevenue;
    totalStock += qty;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.sku||""}</td>
      <td>${item.name||""}</td>
      <td>${item.category||""}</td>
      <td>${qty}</td>
      <td>${uc.toFixed(2)}</td>
      <td>${up.toFixed(2)}</td>
      <td>${itemTotalValue.toFixed(2)}</td>
      <td>${itemRevenue.toFixed(2)}</td>
      <td>
        <button class="btn-edit" data-i="${i}">✏️</button>
        <button class="btn-del" data-i="${i}">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });

  const summary = document.getElementById("summary");
  if (summary) summary.innerHTML = `<p><b>Total Inventory Value:</b> RM ${totalValue.toFixed(2)}</p>
    <p><b>Total Potential Revenue:</b> RM ${totalRevenue.toFixed(2)}</p>
    <p><b>Total Stock Quantity:</b> ${totalStock}</p>`;

  // bind edit/delete
  document.querySelectorAll(".btn-edit").forEach(btn => btn.addEventListener("click", (e)=> {
    const i = Number(e.currentTarget.dataset.i); editItem(i);
  }));
  document.querySelectorAll(".btn-del").forEach(btn => btn.addEventListener("click", (e)=> {
    const i = Number(e.currentTarget.dataset.i); deleteItem(i);
  }));
}

document.getElementById("addItemForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const formData = new FormData(e.target);
  const item = Object.fromEntries(formData.entries());
  item.quantity = parseInt(item.quantity||0,10);
  item.unitCost = parseFloat(item.unitCost||0);
  item.unitPrice = parseFloat(item.unitPrice||0);
  try{
    const res = await fetch(`${API_BASE}/inventory`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(item) });
    if (!res.ok) { const txt = await res.text(); throw new Error(txt || "Failed"); }
    alert("✅ Item added successfully!");
    e.target.reset();
    await fetchInventory();
  }catch(err){ console.error(err); alert("⚠️ Unable to add item."); }
});

async function editItem(i){
  const item = inventory[i];
  const sku = prompt("Edit SKU:", item.sku) || item.sku;
  const name = prompt("Edit name:", item.name) || item.name;
  const quantity = parseInt(prompt("Edit quantity:", item.quantity), 10);
  const category = prompt("Edit category:", item.category) || item.category;
  const unitCost = parseFloat(prompt("Edit unit cost:", item.unitCost)) || item.unitCost;
  const unitPrice = parseFloat(prompt("Edit unit price:", item.unitPrice)) || item.unitPrice;
  const body = { sku, name, quantity, category, unitCost, unitPrice };
  try{
    const res = await fetch(`${API_BASE}/inventory/${item.id||item._id}`, { method: "PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    if (!res.ok) { const txt = await res.text(); throw new Error(txt || "Update failed"); }
    alert("✅ Item updated!");
    await fetchInventory();
  }catch(err){ console.error(err); alert("⚠️ Unable to update item."); }
}

async function deleteItem(i){
  const item = inventory[i];
  if (!confirm(`Delete "${item.name}"?`)) return;
  try{
    const res = await fetch(`${API_BASE}/inventory/${item.id||item._id}`, { method: "DELETE" });
    if (!res.ok) { const txt = await res.text(); throw new Error(txt || "Delete failed"); }
    alert("🗑️ Item deleted!");
    await fetchInventory();
  }catch(err){ console.error(err); alert("⚠️ Unable to delete item."); }
}

// ===============================
// REPORT
// ===============================
async function generateReport(){
  try{
    const res = await fetch(`${API_BASE}/inventory/report`);
    if (!res.ok) { const txt = await res.text(); throw new Error(txt || "Report failed"); }
    const blob = await res.blob();
    const dispName = res.headers.get("content-disposition")?.split('filename=')[1]?.replace(/"/g,'') || `Inventory_Report.xlsx`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = dispName;
    link.click();
    alert("✅ Report downloaded and added to Documents.");
    await fetchDocuments(); // refresh documents list
  }catch(e){ console.error(e); alert("⚠️ Failed to generate report."); }
}

// ===============================
// DOCUMENTS
// ===============================
async function fetchDocuments(){
  try{
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error("Failed to load documents.");
    documents = await res.json();
    renderDocuments();
  }catch(e){ console.error(e); alert("⚠️ Unable to load documents."); }
}

async function uploadDocuments(){
  const input = document.getElementById("docUpload");
  const files = Array.from(input?.files || []);
  if (!files.length) return alert("No files selected.");
  const form = new FormData();
  files.forEach(f => form.append("documents", f));
  try{
    const res = await fetch(`${API_BASE}/documents`, { method: "POST", body: form });
    if (!res.ok) { const txt = await res.text(); throw new Error(txt || "Upload failed"); }
    alert("✅ Uploaded successfully!");
    input.value = "";
    await fetchDocuments();
  }catch(e){ console.error(e); alert("⚠️ Upload failed."); }
}

function renderDocuments(){
  const list = document.getElementById("docList");
  if (!list) return;
  list.innerHTML = "";
  documents.forEach((d, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${d.name} ${(d.size?('('+ (d.size/1024).toFixed(1)+' KB)'):'')}</span>
      <button class="doc-download" data-id="${d.id||d._id}" data-name="${d.name}">⬇️</button>
      <button class="doc-delete" data-i="${i}">🗑</button>`;
    list.appendChild(li);
  });
  document.querySelectorAll(".doc-download").forEach(b => b.addEventListener("click", (e)=>{
    const id = e.currentTarget.dataset.id, name = e.currentTarget.dataset.name;
    downloadDocument(id, name);
  }));
  document.querySelectorAll(".doc-delete").forEach(b => b.addEventListener("click", async (e)=>{
    const i = Number(e.currentTarget.dataset.i);
    deleteDocument(i);
  }));
}

async function downloadDocument(id, name){
  try{
    const res = await fetch(`${API_BASE}/documents/${id}/download`);
    if (!res.ok) { const txt = await res.text(); throw new Error(txt || "Download failed"); }
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name || 'document';
    link.click();
  }catch(e){ console.error(e); alert("⚠️ Unable to download file."); }
}

async function deleteDocument(i){
  const doc = documents[i];
  if (!confirm(`Delete '${doc.name}'?`)) return;
  try{
    const res = await fetch(`${API_BASE}/documents/${doc.id||doc._id}`, { method: "DELETE" });
    if (!res.ok) { const txt = await res.text(); throw new Error(txt || "Delete failed"); }
    alert("🗑️ Deleted!");
    await fetchDocuments();
  }catch(e){ console.error(e); alert("⚠️ Unable to delete document."); }
}

// ===============================
// LOGS
// ===============================
async function fetchLogs(){
  try{
    const res = await fetch(`${API_BASE}/logs`);
    if (!res.ok) throw new Error("Failed to load logs");
    activityLog = await res.json();
    const list = document.getElementById("logList");
    if (!list) return;
    list.innerHTML = "";
    activityLog.slice().reverse().forEach(l => {
      const li = document.createElement("li");
      li.textContent = `${new Date(l.time).toLocaleString()} - ${l.user || 'System'} - ${l.action}`;
      list.appendChild(li);
    });
  }catch(e){ console.error(e); }
}

// ===============================
// DASHBOARD HELPERS
// ===============================
function updateClock(){
  const now = new Date();
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  const dateStr = now.toLocaleDateString(undefined, options);
  const timeStr = now.toLocaleTimeString();
  document.getElementById('clock') && (document.getElementById('clock').textContent = `📅 ${dateStr} ⏰ ${timeStr}`);
}

async function fetchDashboardData(){
  try{
    const res = await fetch(`${API_BASE}/logs`);
    if (!res.ok) return;
    const logs = await res.json();
    const tbody = document.getElementById('recentActivities');
    if (tbody) {
      tbody.innerHTML = '';
      logs.slice(0,5).forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${log.user||'Admin'}</td><td>${log.action}</td><td>${new Date(log.time).toLocaleString()}</td>`;
        tbody.appendChild(tr);
      });
    }
    const today = new Date().toLocaleDateString();
    const usersToday = new Set((logs||[]).filter(l => new Date(l.time).toLocaleDateString() === today).map(l => l.user));
    document.getElementById('totalUsers') && (document.getElementById('totalUsers').textContent = usersToday.size);
  }catch(e){ console.error(e); }
}

// ===============================
// UTILITIES
// ===============================
function logout(){
  sessionStorage.removeItem("isLoggedIn");
  sessionStorage.removeItem("adminName");
  localStorage.removeItem("adminName");
  location.href = "login.html";
}

function toggleTheme(){
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
}

// Redirect to login when not logged in (but allow static pages like login.html)
if (!sessionStorage.getItem("isLoggedIn") && !window.location.pathname.endsWith("/login.html") && !window.location.pathname.endsWith("/register.html")) {
  // only redirect if not already on login page
  if (!window.location.pathname.endsWith("/index.html") && !window.location.pathname.endsWith("/login.html")) {
    // don't auto-redirect immediately on some pages (keep user flow)
  }
}

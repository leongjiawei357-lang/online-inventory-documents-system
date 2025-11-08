// script.js - client side (CSP-safe, no inline onclick)
const API_BASE = "https://online-inventory-documents-system.onrender.com/api";

// Simple routing check
const currentPage = window.location.pathname.split("/").pop();

let inventory = [];
let documents = [];
let activityLog = [];

// ---------- Utilities ----------
function $(id) { return document.getElementById(id); }
function showMessage(el, txt, color = "red") { if (!el) return; el.textContent = txt; el.style.color = color; }

// ---------- Initialization ----------
window.addEventListener("DOMContentLoaded", async () => {
  // Bind UI event handlers (CSP-safe)
  bindAuthButtons();
  bindThemeLogoutButtons();
  bindDashboardButtons();
  // Fetch data depending on page
  try {
    if (currentPage.includes("inventory")) await fetchInventory();
    if (currentPage.includes("documents")) await fetchDocuments();
    if (currentPage.includes("log")) await fetchLogs();
    if (currentPage === "" || currentPage === "index.html") {
      await fetchLogs();
      updateClock();
      setInterval(updateClock, 1000);
    }
  } catch (e) {
    console.error("Init error", e);
  }
  // set adminName
  const adminName = sessionStorage.getItem("adminName") || localStorage.getItem("adminName");
  if ($("adminName")) $("adminName").textContent = adminName || "Admin";

  // theme
  if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark-mode");
});

// ---------- AUTH ----------
function bindAuthButtons() {
  const loginBtn = $("loginBtn");
  const registerBtn = $("registerBtn");
  const toggleToRegister = $("toggleToRegister");
  const toggleToLogin = $("toggleToLogin");
  if (loginBtn) loginBtn.addEventListener("click", doLogin);
  if (registerBtn) registerBtn.addEventListener("click", doRegister);
  if (toggleToRegister) toggleToRegister.addEventListener("click", toggleForm);
  if (toggleToLogin) toggleToLogin.addEventListener("click", toggleForm);
}

// login function
async function doLogin() {
  const user = $("username")?.value?.trim();
  const pass = $("password")?.value?.trim();
  const msg = $("loginMessage");
  showMessage(msg, "");
  if (!user || !pass) { showMessage(msg, "⚠️ Please enter username and password.", "red"); return; }
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();
    if (res.ok) {
      sessionStorage.setItem("isLoggedIn", "true");
      sessionStorage.setItem("adminName", data.username || user);
      localStorage.setItem("adminName", data.username || user);
      showMessage(msg, "✅ Login successful! Redirecting...", "green");
      setTimeout(() => { window.location.href = "index.html"; }, 700);
    } else {
      showMessage(msg, data.message || "❌ Invalid username or password.", "red");
    }
  } catch (e) {
    console.error(e);
    showMessage(msg, "❌ Unable to contact server.", "red");
  }
}

// register function
async function doRegister() {
  const user = $("newUsername")?.value?.trim();
  const pass = $("newPassword")?.value?.trim();
  const code = $("securityCode")?.value?.trim();
  const msg = $("registerMessage");
  showMessage(msg, "");
  if (!user || !pass || !code) { showMessage(msg, "⚠️ Please fill in all fields.", "red"); return; }
  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass, securityCode: code }),
    });
    const data = await res.json();
    if (res.ok) {
      showMessage(msg, "✅ Registered successfully! You can now log in.", "green");
      setTimeout(toggleForm, 1000);
    } else {
      showMessage(msg, data.message || "❌ Registration failed.", "red");
    }
  } catch (e) {
    console.error(e);
    showMessage(msg, "❌ Unable to contact server.", "red");
  }
}

function toggleForm() {
  const loginForm = $("loginForm");
  const registerForm = $("registerForm");
  const formTitle = $("formTitle");
  if (!loginForm || !registerForm) return;
  if (loginForm.style.display === "none") {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    if (formTitle) formTitle.textContent = "🔐 Admin Login";
  } else {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    if (formTitle) formTitle.textContent = "🧾 Register Account";
  }
}

// ---------- DASHBOARD ----------
function bindDashboardButtons() {
  const themeBtns = document.querySelectorAll("#themeBtn, #themeBtnInv, #themeBtnDocs");
  themeBtns.forEach(b => b && b.addEventListener("click", toggleTheme));
  const logoutBtns = document.querySelectorAll("#logoutBtn, #logoutBtnInv, #logoutBtnDocs");
  logoutBtns.forEach(b => b && b.addEventListener("click", logout));
  const goInv = $("goInventory");
  const goDocs = $("goDocuments");
  if (goInv) goInv.addEventListener("click", () => location.href = "inventory.html");
  if (goDocs) goDocs.addEventListener("click", () => location.href = "documents.html");

  const reportBtn = $("downloadReportBtn");
  if (reportBtn) reportBtn.addEventListener("click", () => generateReport());

  const uploadBtn = $("uploadDocsBtn");
  if (uploadBtn) uploadBtn.addEventListener("click", uploadDocuments);

  // upload input change triggers nothing; we use button
}

// clock
function updateClock() {
  const now = new Date();
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  const dateStr = now.toLocaleDateString(undefined, options);
  const timeStr = now.toLocaleTimeString();
  const el = $("clock");
  if (el) el.textContent = `📅 ${dateStr} ⏰ ${timeStr}`;
}

// ---------- INVENTORY ----------
async function fetchInventory() {
  try {
    const res = await fetch(`${API_BASE}/inventory`);
    if (!res.ok) throw new Error("Failed to fetch inventory");
    inventory = await res.json();
    renderInventory();
  } catch (e) {
    console.error(e);
    alert("⚠️ Unable to load inventory data.");
  }
}

function renderInventory() {
  const tbody = document.querySelector("#inventoryTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  let totalValue = 0, totalRevenue = 0, totalStock = 0;
  inventory.forEach((item, i) => {
    const itemTotalValue = (item.quantity || 0) * (item.unitCost || 0);
    const itemRevenue = (item.quantity || 0) * (item.unitPrice || 0);
    totalValue += itemTotalValue;
    totalRevenue += itemRevenue;
    totalStock += (item.quantity || 0);

    const tr = document.createElement("tr");
    if (item.quantity < (item.reorderPoint || 5)) tr.classList.add("low-stock");
    tr.innerHTML = `
      <td>${item.sku || ""}</td>
      <td>${item.name || ""}</td>
      <td>${item.category || ""}</td>
      <td>${item.quantity ?? 0}</td>
      <td>${(item.unitCost||0).toFixed(2)}</td>
      <td>${(item.unitPrice||0).toFixed(2)}</td>
      <td>${itemTotalValue.toFixed(2)}</td>
      <td>${itemRevenue.toFixed(2)}</td>
      <td>
        <button class="editBtn" data-i="${i}">✏️</button>
        <button class="delBtn" data-i="${i}">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const summary = $("summary");
  if (summary) summary.innerHTML = `<p><b>Total Inventory Value:</b> RM ${totalValue.toFixed(2)}</p>
    <p><b>Total Potential Revenue:</b> RM ${totalRevenue.toFixed(2)}</p>
    <p><b>Total Stock Quantity:</b> ${totalStock}</p>`;

  // bind edit/delete buttons
  document.querySelectorAll(".editBtn").forEach(b => b.addEventListener("click", (e) => {
    const i = Number(e.currentTarget.dataset.i);
    editItem(i);
  }));
  document.querySelectorAll(".delBtn").forEach(b => b.addEventListener("click", (e) => {
    const i = Number(e.currentTarget.dataset.i);
    deleteItem(i);
  }));
}

// Add item form
const addForm = $("addItemForm");
if (addForm) {
  addForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = new FormData(addForm);
    const item = Object.fromEntries(form.entries());
    item.quantity = Number(item.quantity || 0);
    item.unitCost = Number(item.unitCost || 0);
    item.unitPrice = Number(item.unitPrice || 0);
    try {
      const res = await fetch(`${API_BASE}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to add");
      }
      alert("✅ Item added successfully!");
      addForm.reset();
      await fetchInventory();
    } catch (e) {
      console.error(e);
      alert("⚠️ Unable to add item.");
    }
  });
}

async function editItem(i) {
  const item = inventory[i];
  if (!item) return;
  const sku = prompt("Edit SKU:", item.sku) || item.sku;
  const name = prompt("Edit name:", item.name) || item.name;
  let quantity = prompt("Edit quantity:", item.quantity);
  quantity = Number(quantity || item.quantity || 0);
  const category = prompt("Edit category:", item.category) || item.category;
  let unitCost = prompt("Edit unit cost:", item.unitCost);
  unitCost = Number(unitCost || item.unitCost || 0);
  let unitPrice = prompt("Edit unit price:", item.unitPrice);
  unitPrice = Number(unitPrice || item.unitPrice || 0);

  const body = { sku, name, quantity, category, unitCost, unitPrice };
  try {
    const res = await fetch(`${API_BASE}/inventory/${item._id || item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Update failed");
    }
    alert("✅ Item updated");
    await fetchInventory();
  } catch (e) {
    console.error(e);
    alert("⚠️ Update failed");
  }
}

async function deleteItem(i) {
  const item = inventory[i];
  if (!item) return;
  if (!confirm(`Delete "${item.name}"?`)) return;
  try {
    const res = await fetch(`${API_BASE}/inventory/${item._id || item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Delete failed");
    }
    alert("🗑️ Deleted");
    await fetchInventory();
  } catch (e) {
    console.error(e);
    alert("⚠️ Delete failed");
  }
}

// ---------- REPORT ----------
async function generateReport() {
  try {
    const res = await fetch(`${API_BASE}/inventory/report`);
    if (!res.ok) throw new Error("Report failed");
    const blob = await res.blob();
    const filenameHeader = res.headers.get("content-disposition") || "Inventory_Report.xlsx";
    // create download link
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filenameHeader.split('filename=')[1] ? filenameHeader.split('filename=')[1].replace(/"/g,'') : "Inventory_Report.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    alert("✅ Report downloaded and added to Documents.");
    // refresh documents list so user sees the report there
    await fetchDocuments();
  } catch (e) {
    console.error(e);
    alert("⚠️ Failed to generate report.");
  }
}

// ---------- DOCUMENTS ----------
async function fetchDocuments() {
  try {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error("Failed to load documents");
    documents = await res.json();
    renderDocuments();
  } catch (e) {
    console.error(e);
    alert("⚠️ Unable to load documents.");
  }
}

async function renderDocuments() {
  const list = $("docList");
  if (!list) return;
  list.innerHTML = "";
  documents.forEach((d) => {
    const li = document.createElement("li");
    const sizeText = d.size ? `(${(d.size/1024).toFixed(1)} KB)` : "";
    const id = d._id || d.id;
    li.innerHTML = `<span>${d.name} ${sizeText} - ${d.date ? new Date(d.date).toLocaleString() : ""}</span>
      <div>
        <button class="dlBtn" data-id="${id}" data-name="${d.name}">⬇️</button>
        <button class="delDocBtn" data-id="${id}">🗑</button>
      </div>`;
    list.appendChild(li);
  });
  // events
  document.querySelectorAll(".dlBtn").forEach(b => b.addEventListener("click", (e) => {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    downloadDocument(id, name);
  }));
  document.querySelectorAll(".delDocBtn").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.id;
    if (!confirm("Delete document?")) return;
    try {
      const res = await fetch(`${API_BASE}/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await fetchDocuments();
    } catch (ex) {
      console.error(ex);
      alert("⚠️ Delete failed");
    }
  }));
}

async function uploadDocuments() {
  const input = $("docUpload");
  if (!input || !input.files.length) return alert("No files selected.");
  const form = new FormData();
  Array.from(input.files).forEach(f => form.append("documents", f));
  try {
    const res = await fetch(`${API_BASE}/documents`, { method: "POST", body: form });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Upload failed");
    }
    alert("✅ Uploaded");
    input.value = "";
    await fetchDocuments();
  } catch (e) {
    console.error(e);
    alert("⚠️ Upload failed");
  }
}

async function downloadDocument(id, name) {
  try {
    const res = await fetch(`${API_BASE}/documents/${id}/download`);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    console.error(e);
    alert("⚠️ Unable to download");
  }
}

// ---------- LOGS ----------
async function fetchLogs() {
  try {
    const res = await fetch(`${API_BASE}/logs`);
    if (!res.ok) throw new Error("Failed to load logs");
    activityLog = await res.json();
    const list = $("logList");
    if (!list) return;
    list.innerHTML = "";
    const recent = (Array.isArray(activityLog) ? activityLog : []).slice(0, 50);
    recent.reverse().forEach(l => {
      const li = document.createElement("li");
      const time = l.time ? new Date(l.time).toLocaleString() : "";
      li.textContent = `${time} - ${l.user || 'System'} - ${l.action}`;
      list.appendChild(li);
    });
    // Dashboard: recent activities table
    const tb = $("recentActivities");
    if (tb) {
      tb.innerHTML = "";
      (activityLog.slice(0,5) || []).forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.user || 'Admin'}</td><td>${r.action}</td><td>${r.time ? new Date(r.time).toLocaleString() : ''}</td>`;
        tb.appendChild(tr);
      });
      const today = new Date().toLocaleDateString();
      const usersToday = new Set((activityLog || []).filter(a => new Date(a.time).toLocaleDateString() === today).map(a => a.user));
      const totalUsers = $("totalUsers");
      if (totalUsers) totalUsers.textContent = usersToday.size;
    }
  } catch (e) {
    console.error("Failed to load logs", e);
  }
}

// ---------- Utilities: theme & logout ----------
function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
}

function logout() {
  sessionStorage.removeItem("isLoggedIn");
  sessionStorage.removeItem("adminName");
  localStorage.removeItem("adminName");
  window.location.href = "login.html";
}

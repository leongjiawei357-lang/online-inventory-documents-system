// ===============================
// CONFIG (Render Backend)
// ===============================
const API_BASE = "https://online-inventory-documents-system.onrender.com/api";

// ===============================
// LOGIN REDIRECT (only redirect if not on login page)
// ===============================
if (!sessionStorage.getItem("isLoggedIn") && !window.location.pathname.includes("login.html")) {
  window.location.href = "login.html";
}

// ===============================
// GLOBAL
// ===============================
let inventory = [];
let documents = [];
let activityLog = [];
const currentPage = window.location.pathname.split("/").pop();

// small helper to set admin name on pages
function setAdminName() {
  const adminName = sessionStorage.getItem("adminName") || localStorage.getItem("adminName");
  if (document.getElementById("adminName")) document.getElementById("adminName").textContent = adminName || "Admin";
}
setAdminName();

// ===============================
// ON LOAD - fetch relevant data
// ===============================
window.addEventListener("DOMContentLoaded", async () => {
  setAdminName();
  // Attach global UI buttons (CSP-safe)
  const btnTheme = document.getElementById("btn-theme") || document.getElementById("btnTheme") || document.getElementById("btn-theme");
  const btnLogout = document.getElementById("btn-logout") || document.getElementById("btnLogout") || document.getElementById("btn-logout");
  const quickInv = document.getElementById("shortcut-inventory");
  const quickDoc = document.getElementById("shortcut-documents");

  if (btnTheme) btnTheme.addEventListener("click", toggleTheme);
  if (btnLogout) btnLogout.addEventListener("click", logout);
  if (quickInv) quickInv.addEventListener("click", () => window.location.href = "inventory.html");
  if (quickDoc) quickDoc.addEventListener("click", () => window.location.href = "documents.html");

  // login page buttons (if present)
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const toggleToRegister = document.getElementById("toggleToRegister");
  const toggleToLogin = document.getElementById("toggleToLogin");
  if (loginBtn) loginBtn.addEventListener("click", login);
  if (registerBtn) registerBtn.addEventListener("click", register);
  if (toggleToRegister) toggleToRegister.addEventListener("click", toggleForm);
  if (toggleToLogin) toggleToLogin.addEventListener("click", toggleForm);

  // page-specific fetches
  try {
    if (currentPage.includes("inventory")) await fetchInventory();
    if (currentPage.includes("documents")) await fetchDocuments();
    if (currentPage.includes("log")) await fetchLogs();
    if (currentPage === "index.html" || currentPage === "" || currentPage === "index") {
      // fetch dashboard activities
      if (window.fetchDashboardData) window.fetchDashboardData();
    }
  } catch (e) {
    console.error("Error during page init:", e);
  }

  // attach inventory add form if present
  const addItemForm = document.getElementById("addItemForm");
  if (addItemForm) addItemForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(addItemForm);
    const item = Object.fromEntries(formData.entries());
    item.quantity = parseInt(item.quantity || 0, 10);
    item.unitCost = parseFloat(item.unitCost || 0);
    item.unitPrice = parseFloat(item.unitPrice || 0);
    try {
      const res = await fetch(`${API_BASE}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        alert("✅ Item added successfully!");
        addItemForm.reset();
        await fetchInventory();
      } else {
        const txt = await res.text();
        alert("❌ Failed to add item: " + txt);
      }
    } catch (err) {
      console.error(err);
      alert("⚠️ Unable to contact server.");
    }
  });
});

// ===============================
// AUTH (Login/Register)
// ===============================
async function login() {
  const user = document.getElementById("username")?.value?.trim();
  const pass = document.getElementById("password")?.value?.trim();
  const msg = document.getElementById("loginMessage");
  if (msg) msg.textContent = "";

  if (!user || !pass) {
    if (msg) { msg.textContent = "⚠️ Please enter username and password."; msg.style.color = "red"; }
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();
    if (res.ok) {
      sessionStorage.setItem("isLoggedIn", "true");
      sessionStorage.setItem("adminName", data.username || user);
      localStorage.setItem("adminName", data.username || user);
      if (msg) { msg.textContent = "✅ Login successful! Redirecting..."; msg.style.color = "green"; }
      setTimeout(() => window.location.href = "index.html", 700);
    } else {
      if (msg) { msg.textContent = data.message || "❌ Invalid username or password."; msg.style.color = "red"; }
    }
  } catch (err) {
    console.error("Login error", err);
    if (msg) { msg.textContent = "❌ Unable to contact server."; msg.style.color = "red"; }
  }
}

async function register() {
  const user = document.getElementById("newUsername")?.value?.trim();
  const pass = document.getElementById("newPassword")?.value?.trim();
  const code = document.getElementById("securityCode")?.value?.trim();
  const msg = document.getElementById("registerMessage");
  if (msg) msg.textContent = "";

  if (!user || !pass || !code) {
    if (msg) { msg.textContent = "⚠️ Please fill in all fields."; msg.style.color = "red"; }
    return;
  }

  try {
    // IMPORTANT: send fields named username/password/securityCode to match server
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass, securityCode: code })
    });
    const data = await res.json();
    if (res.ok) {
      if (msg) { msg.textContent = "✅ Registered successfully! You can now log in."; msg.style.color = "green"; }
      // show login form
      setTimeout(toggleForm, 1100);
    } else {
      if (msg) { msg.textContent = data.message || "❌ Registration failed."; msg.style.color = "red"; }
    }
  } catch (err) {
    console.error("Register error", err);
    if (msg) { msg.textContent = "❌ Unable to contact server."; msg.style.color = "red"; }
  }
}

function toggleForm() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const formTitle = document.getElementById("formTitle");
  if (!loginForm || !registerForm || !formTitle) return;
  if (loginForm.style.display === "none") {
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
async function fetchInventory() {
  try {
    const res = await fetch(`${API_BASE}/inventory`);
    if (!res.ok) throw new Error("Failed to fetch inventory.");
    inventory = await res.json();
    renderInventory();
  } catch (err) {
    console.error(err);
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

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.sku}</td>
      <td>${item.name}</td>
      <td>${item.category}</td>
      <td>${item.quantity}</td>
      <td>${(item.unitCost||0).toFixed(2)}</td>
      <td>${(item.unitPrice||0).toFixed(2)}</td>
      <td>${itemTotalValue.toFixed(2)}</td>
      <td>${itemRevenue.toFixed(2)}</td>
      <td>
        <button data-action="edit" data-index="${i}">✏️</button>
        <button data-action="delete" data-index="${i}">🗑️</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // attach delegated click handlers for edit/delete
  tbody.querySelectorAll("button").forEach(btn => {
    const action = btn.getAttribute("data-action");
    const idx = parseInt(btn.getAttribute("data-index"), 10);
    if (action === "edit") btn.addEventListener("click", () => editItem(idx));
    if (action === "delete") btn.addEventListener("click", () => deleteItem(idx));
  });

  const summary = document.getElementById("summary");
  if (summary) {
    summary.innerHTML = `<p><b>Total Inventory Value:</b> RM ${totalValue.toFixed(2)}</p>
      <p><b>Total Potential Revenue:</b> RM ${totalRevenue.toFixed(2)}</p>
      <p><b>Total Stock Quantity:</b> ${totalStock}</p>
      <p><button id="btn-report">📥 Download Report</button></p>`;
    const rptBtn = document.getElementById("btn-report");
    if (rptBtn) rptBtn.addEventListener("click", () => generateReport());
  }
}

async function editItem(i) {
  const item = inventory[i];
  const sku = prompt("Edit SKU:", item.sku) || item.sku;
  const name = prompt("Edit name:", item.name) || item.name;
  const quantity = parseInt(prompt("Edit quantity:", item.quantity), 10) || item.quantity;
  const category = prompt("Edit category:", item.category) || item.category;
  const unitCost = parseFloat(prompt("Edit unit cost:", item.unitCost)) || item.unitCost;
  const unitPrice = parseFloat(prompt("Edit unit price:", item.unitPrice)) || item.unitPrice;

  const body = { sku, name, quantity, category, unitCost, unitPrice };
  try {
    const res = await fetch(`${API_BASE}/inventory/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      await fetchInventory();
    } else {
      const txt = await res.text();
      alert("❌ Update failed: " + txt);
    }
  } catch (err) {
    console.error(err); alert("⚠️ Unable to contact server.");
  }
}

async function deleteItem(i) {
  const item = inventory[i];
  if (!confirm(`Delete "${item.name}"?`)) return;
  try {
    const res = await fetch(`${API_BASE}/inventory/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchInventory();
    } else {
      const txt = await res.text();
      alert("❌ Delete failed: " + txt);
    }
  } catch (err) {
    console.error(err); alert("⚠️ Unable to contact server.");
  }
}

// ===============================
// REPORT
// ===============================
async function generateReport() {
  try {
    const res = await fetch(`${API_BASE}/inventory/report`);
    if (!res.ok) throw new Error("Failed to generate report");
    const blob = await res.blob();
    const name = res.headers.get("content-disposition")?.split('filename=')[1] || `Inventory_Report.xlsx`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name.replace(/"/g,"");
    link.click();

    // also upload to Documents endpoint so it appears in history (server handles documents save)
    const form = new FormData();
    form.append("documents", new File([blob], name.replace(/"/g,"")));
    await fetch(`${API_BASE}/documents`, { method: "POST", body: form });

    // refresh documents list if on documents page
    if (currentPage.includes("documents")) await fetchDocuments();
  } catch (err) {
    console.error(err); alert("⚠️ Failed to generate report.");
  }
}

// ===============================
// DOCUMENTS
// ===============================
async function fetchDocuments() {
  try {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error("Failed to load documents.");
    documents = await res.json();
    renderDocuments();
  } catch (err) {
    console.error(err);
  }
}

async function uploadDocuments() {
  const input = document.getElementById("docUpload");
  const files = Array.from(input.files || []);
  if (!files.length) return alert("No files selected.");
  const form = new FormData();
  files.forEach(f => form.append("documents", f));
  try {
    const res = await fetch(`${API_BASE}/documents`, { method: "POST", body: form });
    if (res.ok) {
      input.value = "";
      await fetchDocuments();
      alert("✅ Uploaded successfully!");
    } else {
      const txt = await res.text();
      alert("❌ Upload failed: " + txt);
    }
  } catch (err) {
    console.error(err); alert("⚠️ Unable to contact server.");
  }
}

function renderDocuments() {
  const list = document.getElementById("docList");
  if (!list) return;
  list.innerHTML = "";
  documents.forEach((d, i) => {
    const li = document.createElement("li");
    const sizeText = d.size ? ` (${(d.size/1024).toFixed(1)} KB)` : "";
    li.innerHTML = `<span>${d.name}${sizeText} - ${d.date || ''}</span>
      <div>
        <button data-download="${d.id}" data-name="${d.name}">⬇️</button>
        <button data-delete="${i}">🗑</button>
      </div>`;
    list.appendChild(li);
  });
  // bind buttons
  list.querySelectorAll("button").forEach(b=>{
    if (b.hasAttribute("data-download")) b.addEventListener("click", ()=> downloadDocument(b.dataset.download, b.dataset.name));
    if (b.hasAttribute("data-delete")) b.addEventListener("click", ()=> deleteDocument(parseInt(b.dataset.delete,10)));
  });
}

async function downloadDocument(id, name) {
  try {
    const res = await fetch(`${API_BASE}/documents/${id}/download`);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
  } catch (err) {
    console.error(err); alert("⚠️ Unable to download file.");
  }
}

async function deleteDocument(i) {
  const doc = documents[i];
  if (!confirm(`Delete '${doc.name}'?`)) return;
  try {
    const res = await fetch(`${API_BASE}/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchDocuments();
    } else {
      const txt = await res.text();
      alert("❌ Delete failed: " + txt);
    }
  } catch (err) {
    console.error(err); alert("⚠️ Unable to delete document.");
  }
}

// ===============================
// LOGS & DASHBOARD
// ===============================
async function fetchLogs() {
  try {
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
  } catch (err) {
    console.error(err);
  }
}

async function fetchDashboardData() {
  try {
    const res = await fetch(`${API_BASE}/logs`);
    if (!res.ok) return;
    const logs = await res.json();
    // recent 5
    const tbody = document.getElementById('recentActivities');
    if (tbody) {
      tbody.innerHTML = '';
      logs.slice(0,5).forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${l.user || 'Admin'}</td><td>${l.action}</td><td>${new Date(l.time).toLocaleString()}</td>`;
        tbody.appendChild(tr);
      });
    }
    // total users today
    const today = new Date().toLocaleDateString();
    const usersToday = new Set(logs.filter(l => new Date(l.time).toLocaleDateString() === today).map(l => l.user));
    const totalUsersEl = document.getElementById('totalUsers');
    if (totalUsersEl) totalUsersEl.textContent = usersToday.size;
  } catch (e) {
    console.error("fetchDashboardData failed", e);
  }
}

// ===============================
// UTILITIES
// ===============================
function logout() {
  sessionStorage.removeItem("isLoggedIn");
  sessionStorage.removeItem("adminName");
  localStorage.removeItem("adminName");
  // navigate to login
  window.location.href = "login.html";
}

function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
}

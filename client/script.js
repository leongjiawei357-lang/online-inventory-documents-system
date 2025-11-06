// ===============================
// CONFIG (Render Backend)
// ===============================
const API_BASE = "https://online-inventory-documents-system.onrender.com/api";

// ===============================
// LOGIN REDIRECT
// ===============================
if (!sessionStorage.getItem("isLoggedIn") && !window.location.pathname.includes("login.html")) {
  window.location.href = "login.html";
}

// ===============================
// GLOBAL VARIABLES
// ===============================
let inventory = [];
let documents = [];
let activityLog = [];
const currentPage = window.location.pathname.split("/").pop();

// ===============================
// ON LOAD
// ===============================
window.onload = async function () {
  try {
    const adminName = sessionStorage.getItem("adminName") || localStorage.getItem("adminName");
    if (document.getElementById("adminName")) {
      document.getElementById("adminName").textContent = adminName || "Admin";
    }

    if (currentPage.includes("inventory")) await fetchInventory();
    if (currentPage.includes("documents")) await fetchDocuments();
    if (currentPage.includes("log")) await fetchLogs();

    const theme = localStorage.getItem("theme");
    if (theme === "dark") document.body.classList.add("dark-mode");
  } catch (err) {
    console.error("Initialization failed:", err);
  }
};

// ===============================
// AUTH (Login/Register)
// ===============================
async function login() {
  const user = document.getElementById("username")?.value.trim();
  const pass = document.getElementById("password")?.value.trim();
  const msg = document.getElementById("loginMessage");
  msg.textContent = "";

  if (!user || !pass) {
    msg.textContent = "⚠️ Please enter username and password.";
    msg.style.color = "red";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();

    if (res.ok) {
      sessionStorage.setItem("isLoggedIn", "true");
      sessionStorage.setItem("adminName", data.username);
      localStorage.setItem("adminName", data.username);
      msg.textContent = "✅ Login successful! Redirecting...";
      msg.style.color = "green";
      setTimeout(() => (window.location.href = "index.html"), 800);
    } else {
      msg.textContent = data.message || "❌ Invalid username or password.";
      msg.style.color = "red";
    }
  } catch {
    msg.textContent = "❌ Unable to contact server.";
    msg.style.color = "red";
  }
}

async function register() {
  const user = document.getElementById("newUsername")?.value.trim();
  const pass = document.getElementById("newPassword")?.value.trim();
  const code = document.getElementById("securityCode")?.value.trim();
  const msg = document.getElementById("registerMessage");
  msg.textContent = "";

  if (!user || !pass || !code) {
    msg.textContent = "⚠️ Please fill in all fields.";
    msg.style.color = "red";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass, securityCode: code }),
    });
    const data = await res.json();

    if (res.ok) {
      msg.textContent = "✅ Registered successfully! You can now log in.";
      msg.style.color = "green";
      setTimeout(toggleForm, 1200);
    } else {
      msg.textContent = data.message || "❌ Registration failed.";
      msg.style.color = "red";
    }
  } catch {
    msg.textContent = "❌ Unable to contact server.";
    msg.style.color = "red";
  }
}

function toggleForm() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const formTitle = document.getElementById("formTitle");

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
// INVENTORY FUNCTIONS
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

  let totalValue = 0;
  let totalRevenue = 0;
  let totalStock = 0;

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
        <button onclick="editItem(${i})">✏️</button>
        <button onclick="deleteItem(${i})">🗑️</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  const summary = document.getElementById("summary");
  if (summary) {
    summary.innerHTML = `<p><b>Total Inventory Value:</b> RM ${totalValue.toFixed(2)}</p>
      <p><b>Total Potential Revenue:</b> RM ${totalRevenue.toFixed(2)}</p>
      <p><b>Total Stock Quantity:</b> ${totalStock}</p>`;
  }
}

document.getElementById("addItemForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const item = Object.fromEntries(formData.entries());
  item.quantity = parseInt(item.quantity || 0, 10);
  item.unitCost = parseFloat(item.unitCost || 0);
  item.unitPrice = parseFloat(item.unitPrice || 0);

  try {
    const res = await fetch(`${API_BASE}/inventory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (res.ok) {
      alert("✅ Item added successfully!");
      e.target.reset();
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

async function editItem(i) {
  const item = inventory[i];
  const sku = prompt("Edit SKU:", item.sku) || item.sku;
  const name = prompt("Edit name:", item.name) || item.name;
  const quantity = parseInt(prompt("Edit quantity:", item.quantity), 10);
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
      alert("✅ Item updated!");
      await fetchInventory();
    } else {
      const txt = await res.text();
      alert("❌ Update failed: " + txt);
    }
  } catch (err) {
    console.error(err);
    alert("⚠️ Unable to contact server.");
  }
}

async function deleteItem(i) {
  const item = inventory[i];
  if (!confirm(`Delete "${item.name}"?`)) return;
  try {
    const res = await fetch(`${API_BASE}/inventory/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      alert("🗑️ Item deleted!");
      await fetchInventory();
    } else {
      const txt = await res.text();
      alert("❌ Delete failed: " + txt);
    }
  } catch (err) {
    console.error(err);
    alert("⚠️ Unable to contact server.");
  }
}

// ===============================
// REPORT GENERATION
// ===============================
async function generateReport(format) {
  try {
    const res = await fetch(`${API_BASE}/inventory/report`);
    if (!res.ok) throw new Error("Failed to generate report");
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Inventory_Report.xlsx";
    link.click();
    alert("✅ Report generated and uploaded to Documents.");
  } catch (err) {
    console.error(err);
    alert("⚠️ Failed to generate report.");
  }
}

// ===============================
// DOCUMENTS (CRUD + DOWNLOAD)
// ===============================
async function fetchDocuments() {
  try {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error("Failed to load documents.");
    documents = await res.json();
    renderDocuments();
  } catch (err) {
    console.error(err);
    alert("⚠️ Unable to load documents.");
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
      alert("✅ Uploaded successfully!");
      input.value = "";
      await fetchDocuments();
    } else {
      const txt = await res.text();
      alert("❌ Upload failed: " + txt);
  } } catch (err) {
    console.error(err);
    alert("⚠️ Unable to contact server.");
  }
}

async function renderDocuments() {
  const list = document.getElementById("docList");
  if (!list) return;
  list.innerHTML = "";
  documents.forEach((d, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${d.name} ${(d.size?('('+ (d.size/1024).toFixed(1)+' KB)'):'')}</span>
      <button onclick="downloadDocument('${d.id}','${d.name}')">⬇️</button>
      <button onclick="deleteDocument(${i})">🗑</button>`;
    list.appendChild(li);
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
    console.error(err);
    alert("⚠️ Unable to download file.");
  }
}

async function deleteDocument(i) {
  const doc = documents[i];
  if (!confirm(`Delete '${doc.name}'?`)) return;
  try {
    const res = await fetch(`${API_BASE}/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      alert("🗑️ Deleted!");
      await fetchDocuments();
    } else {
      const txt = await res.text();
      alert("❌ Delete failed: " + txt);
    }
  } catch (err) {
    console.error(err);
    alert("⚠️ Unable to delete document.");
  }
}

// ===============================
// LOGS
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
      li.textContent = `${l.time} - ${l.action}`;
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

// ===============================
// UTILITIES
// ===============================
function logout() {
  sessionStorage.removeItem("isLoggedIn");
  sessionStorage.removeItem("adminName");
  localStorage.removeItem("adminName");
  window.location.href = "login.html";
}

function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
}
// Fallback for when buttons exist but listeners aren’t yet bound (Render timing fix)
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  if (loginBtn && !loginBtn.onclick) loginBtn.addEventListener("click", login);
  if (registerBtn && !registerBtn.onclick) registerBtn.addEventListener("click", register);
});
// ===============================
// CSP-SAFE EVENT BINDINGS (no inline onclick)
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const toggleToRegister = document.getElementById("toggleToRegister");
  const toggleToLogin = document.getElementById("toggleToLogin");

  if (loginBtn) loginBtn.addEventListener("click", login);
  if (registerBtn) registerBtn.addEventListener("click", register);
  if (toggleToRegister) toggleToRegister.addEventListener("click", toggleForm);
  if (toggleToLogin) toggleToLogin.addEventListener("click", toggleForm);
});

let ADMIN_PASSWORD = sessionStorage.getItem("admin_password") || "";

const loginScreen = document.getElementById("login-screen");
const app = document.getElementById("app");

async function apiFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    options.headers["Content-Type"] = "application/json";
  }
  options.headers["x-admin-password"] = ADMIN_PASSWORD;
  const res = await fetch(url, options);
  if (res.status === 401) {
    sessionStorage.removeItem("admin_password");
    showLogin("كلمة السر غير صحيحة، عاود المحاولة");
    throw new Error("unauthorized");
  }
  return res;
}

function showLogin(error) {
  loginScreen.classList.remove("hidden");
  app.classList.add("hidden");
  document.getElementById("login-error").textContent = error || "";
}

function showApp() {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  loadProducts();
  loadOrders();
}

document.getElementById("login-btn").addEventListener("click", async () => {
  const pw = document.getElementById("password-input").value;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pw })
  });
  if (res.ok) {
    ADMIN_PASSWORD = pw;
    sessionStorage.setItem("admin_password", pw);
    showApp();
  } else {
    document.getElementById("login-error").textContent = "كلمة السر غير صحيحة";
  }
});

document.getElementById("password-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("login-btn").click();
});

// ===== Tabs =====
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab").forEach((t) => t.classList.add("hidden"));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

// ===== Products =====
let productsCache = [];

async function loadProducts() {
  try {
    const res = await apiFetch("/api/products");
    productsCache = await res.json();
    renderProducts();
  } catch {}
}

function renderProducts() {
  const grid = document.getElementById("products-grid");
  if (productsCache.length === 0) {
    grid.innerHTML = `<p class="empty-state">لا توجد موديلات بعد. زيد أول موديل باش يبدا البوت يقترحه على الزبائن.</p>`;
    return;
  }
  grid.innerHTML = productsCache
    .map(
      (p) => `
    <div class="product-card" data-id="${p.id}">
      ${
        p.photos && p.photos[0]
          ? `<img class="product-photo" src="${p.photos[0]}" alt="${p.name}" />`
          : `<div class="product-photo-placeholder">بلا صورة</div>`
      }
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-price">${p.seriePrice} دج / سيري</div>
        <div class="product-status ${p.available ? "status-available" : "status-unavailable"}">
          ${p.available ? "متوفر" : "خلاص"}
        </div>
      </div>
    </div>`
    )
    .join("");

  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openProductModal(card.dataset.id));
  });
}

const modal = document.getElementById("product-modal");
const form = document.getElementById("product-form");

document.getElementById("new-product-btn").addEventListener("click", () => openProductModal(null));
document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

function closeModal() {
  modal.classList.add("hidden");
}

function openProductModal(id) {
  form.reset();
  document.getElementById("product-id").value = "";
  document.getElementById("delete-product-btn").classList.add("hidden");

  if (id) {
    const p = productsCache.find((x) => x.id === id);
    document.getElementById("modal-title").textContent = "تعديل الموديل";
    document.getElementById("product-id").value = p.id;
    document.getElementById("f-name").value = p.name;
    document.getElementById("f-type").value = p.type;
    document.getElementById("f-pieces").value = p.piecesPerSerie;
    document.getElementById("f-price").value = p.seriePrice;
    document.getElementById("f-floor").value = p.negotiatedFloor;
    document.getElementById("f-sizes").value = p.sizes;
    document.getElementById("f-colors").value = p.colors;
    document.getElementById("f-notes").value = p.notes;
    document.getElementById("f-available").checked = p.available;
    document.getElementById("delete-product-btn").classList.remove("hidden");
  } else {
    document.getElementById("modal-title").textContent = "موديل جديد";
    document.getElementById("f-available").checked = true;
  }
  modal.classList.remove("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("product-id").value;
  const fd = new FormData();
  fd.append("name", document.getElementById("f-name").value);
  fd.append("type", document.getElementById("f-type").value);
  fd.append("piecesPerSerie", document.getElementById("f-pieces").value);
  fd.append("seriePrice", document.getElementById("f-price").value);
  fd.append("negotiatedFloor", document.getElementById("f-floor").value);
  fd.append("sizes", document.getElementById("f-sizes").value);
  fd.append("colors", document.getElementById("f-colors").value);
  fd.append("notes", document.getElementById("f-notes").value);
  fd.append("available", document.getElementById("f-available").checked);
  const photoFile = document.getElementById("f-photo").files[0];
  if (photoFile) fd.append("photo", photoFile);

  try {
    if (id) {
      await apiFetch(`/api/products/${id}`, { method: "PUT", body: fd });
    } else {
      await apiFetch("/api/products", { method: "POST", body: fd });
    }
    closeModal();
    loadProducts();
  } catch {}
});

document.getElementById("delete-product-btn").addEventListener("click", async () => {
  const id = document.getElementById("product-id").value;
  if (!confirm("متأكد تحب تحذف هذا الموديل؟")) return;
  await apiFetch(`/api/products/${id}`, { method: "DELETE" });
  closeModal();
  loadProducts();
});

// ===== Orders =====
async function loadOrders() {
  try {
    const res = await apiFetch("/api/orders");
    const list = await res.json();
    renderOrders(list);
  } catch {}
}

function renderOrders(list) {
  const container = document.getElementById("orders-list");
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-state">مازال ماكانش طلبيات. كي يأكد البوت طلبية مع زبون، تبان هنا.</p>`;
    return;
  }
  const statuses = ["بانتظار التأكيد", "تم التأكيد", "قيد التوصيل", "تم التسليم", "ملغاة"];
  container.innerHTML = list
    .map((o) => {
      const itemsText = (o.items || [])
        .map((it) => `${it.productName || it.productId} — ${it.series} سيري × ${it.agreedPricePerSerie} دج`)
        .join("<br/>");
      const date = new Date(o.createdAt).toLocaleString("ar-DZ");
      return `
      <div class="order-card">
        <div class="order-top">
          <span class="order-customer">${o.customerName} ${o.customerSurname} — ${o.wilaya}</span>
          <span class="order-date">${date}</span>
        </div>
        <div class="order-items">${itemsText}<br/>📞 ${o.phone}</div>
        <div class="order-bottom">
          <span class="order-total">${o.total} دج</span>
          <select class="order-status-select" data-id="${o.id}">
            ${statuses.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".order-status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await apiFetch(`/api/orders/${sel.dataset.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: sel.value })
      });
    });
  });
}

// ===== Init =====
if (ADMIN_PASSWORD) {
  showApp();
} else {
  showLogin();
}

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "orders.json");

function ensureFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, "[]", "utf8");
  }
}

function readAll() {
  ensureFile();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  try {
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

function writeAll(orders) {
  fs.writeFileSync(DB_PATH, JSON.stringify(orders, null, 2), "utf8");
}

function create(order) {
  const orders = readAll();
  const newOrder = {
    id: `o${Date.now()}`,
    customerName: order.customerName || "",
    customerSurname: order.customerSurname || "",
    wilaya: order.wilaya || "",
    phone: order.phone || "",
    items: order.items || [], // [{productId, productName, series, agreedPricePerSerie}]
    total: order.total || 0,
    status: "بانتظار التأكيد",
    createdAt: new Date().toISOString()
  };
  orders.push(newOrder);
  writeAll(orders);
  return newOrder;
}

function update(id, patch) {
  const orders = readAll();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...patch, id };
  writeAll(orders);
  return orders[idx];
}

module.exports = { readAll, writeAll, create, update };

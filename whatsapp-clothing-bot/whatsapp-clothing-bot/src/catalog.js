const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "products.json");

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

function writeAll(products) {
  fs.writeFileSync(DB_PATH, JSON.stringify(products, null, 2), "utf8");
}

function getAvailable() {
  return readAll().filter((p) => p.available !== false);
}

function getById(id) {
  return readAll().find((p) => p.id === id);
}

function create(product) {
  const products = readAll();
  const id = product.id || `p${Date.now()}`;
  const newProduct = {
    id,
    name: product.name,
    type: product.type || "",
    seriePrice: Number(product.seriePrice) || 0,
    negotiatedFloor: Number(product.negotiatedFloor) || Number(product.seriePrice) || 0,
    piecesPerSerie: Number(product.piecesPerSerie) || 12,
    sizes: product.sizes || "",
    colors: product.colors || "",
    photos: product.photos || [],
    available: product.available !== false,
    notes: product.notes || "",
    createdAt: new Date().toISOString()
  };
  products.push(newProduct);
  writeAll(products);
  return newProduct;
}

function update(id, patch) {
  const products = readAll();
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  products[idx] = { ...products[idx], ...patch, id };
  writeAll(products);
  return products[idx];
}

function remove(id) {
  const products = readAll().filter((p) => p.id !== id);
  writeAll(products);
  return true;
}

function addPhoto(id, photoPath) {
  const products = readAll();
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  products[idx].photos = products[idx].photos || [];
  products[idx].photos.push(photoPath);
  writeAll(products);
  return products[idx];
}

module.exports = {
  readAll,
  writeAll,
  getAvailable,
  getById,
  create,
  update,
  remove,
  addPhoto
};

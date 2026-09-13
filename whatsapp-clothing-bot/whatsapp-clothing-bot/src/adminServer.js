const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const catalog = require("./catalog");
const orders = require("./orders");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

function requireAuth(req, res, next) {
  const password = req.headers["x-admin-password"] || req.query.password;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "كلمة السر غير صحيحة" });
  }
  next();
}

function createAdminServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(UPLOADS_DIR));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.post("/api/login", (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
      return res.json({ ok: true });
    }
    res.status(401).json({ ok: false, error: "كلمة السر غير صحيحة" });
  });

  app.get("/api/products", requireAuth, (req, res) => {
    res.json(catalog.readAll());
  });

  app.post("/api/products", requireAuth, upload.single("photo"), (req, res) => {
    const body = req.body;
    const product = catalog.create({
      name: body.name,
      type: body.type,
      seriePrice: body.seriePrice,
      negotiatedFloor: body.negotiatedFloor,
      piecesPerSerie: body.piecesPerSerie,
      sizes: body.sizes,
      colors: body.colors,
      notes: body.notes,
      available: body.available !== "false",
      photos: req.file ? [`/uploads/${req.file.filename}`] : []
    });
    res.json(product);
  });

  app.put("/api/products/:id", requireAuth, upload.single("photo"), (req, res) => {
    const body = req.body;
    const patch = {
      name: body.name,
      type: body.type,
      seriePrice: Number(body.seriePrice),
      negotiatedFloor: Number(body.negotiatedFloor),
      piecesPerSerie: Number(body.piecesPerSerie),
      sizes: body.sizes,
      colors: body.colors,
      notes: body.notes,
      available: body.available === "true" || body.available === true
    };
    if (req.file) {
      const existing = catalog.getById(req.params.id);
      patch.photos = [`/uploads/${req.file.filename}`, ...((existing && existing.photos) || [])];
    }
    const updated = catalog.update(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: "السلعة غير موجودة" });
    res.json(updated);
  });

  app.delete("/api/products/:id", requireAuth, (req, res) => {
    catalog.remove(req.params.id);
    res.json({ ok: true });
  });

  app.get("/api/orders", requireAuth, (req, res) => {
    res.json(orders.readAll().reverse());
  });

  app.put("/api/orders/:id", requireAuth, (req, res) => {
    const updated = orders.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "الطلبية غير موجودة" });
    res.json(updated);
  });

  return app;
}

module.exports = { createAdminServer };

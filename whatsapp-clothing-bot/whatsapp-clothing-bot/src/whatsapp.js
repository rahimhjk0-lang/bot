const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");

const ai = require("./ai");
const catalog = require("./catalog");
const orders = require("./orders");

const AUTH_DIR = path.join(__dirname, "..", "data", "auth");
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

const ADMIN_NUMBERS = (process.env.ADMIN_NUMBERS || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

// تاريخ المحادثة لكل زبون (فالذاكرة فقط - MVP بسيط)
// الشكل: Map<jid, [{role, content}]>
const conversations = new Map();
const MAX_HISTORY = 16;

let sockRef = null;

function jidToAdmin(jid) {
  const num = jid.split("@")[0];
  return ADMIN_NUMBERS.includes(num);
}

function getHistory(jid) {
  if (!conversations.has(jid)) conversations.set(jid, []);
  return conversations.get(jid);
}

function pushHistory(jid, role, content) {
  const hist = getHistory(jid);
  hist.push({ role, content });
  while (hist.length > MAX_HISTORY) hist.shift();
}

/**
 * يفلتر رد الموديل: يسحب أوسمة [PHOTO:id] و ORDER_JSON:{...}
 * ويرجع { cleanText, photoIds, order }
 */
function parseModelReply(raw) {
  const photoIds = [];
  let order = null;

  let cleanText = raw.replace(/\[PHOTO:([a-zA-Z0-9_-]+)\]/g, (_, id) => {
    photoIds.push(id);
    return "";
  });

  const orderMatch = cleanText.match(/ORDER_JSON:(\{[\s\S]*\})/);
  if (orderMatch) {
    try {
      order = JSON.parse(orderMatch[1]);
    } catch (e) {
      console.error("تعذر تحليل ORDER_JSON:", e.message);
    }
    cleanText = cleanText.replace(orderMatch[0], "");
  }

  cleanText = cleanText.trim().replace(/\n{3,}/g, "\n\n");
  return { cleanText, photoIds, order };
}

async function sendProductPhotos(sock, jid, photoIds) {
  for (const id of photoIds) {
    const product = catalog.getById(id);
    if (!product || !product.photos || product.photos.length === 0) continue;
    const photoRelPath = product.photos[0];
    const photoAbsPath = path.join(UPLOADS_DIR, path.basename(photoRelPath));
    if (fs.existsSync(photoAbsPath)) {
      try {
        await sock.sendMessage(jid, {
          image: fs.readFileSync(photoAbsPath),
          caption: `${product.name} — ${product.seriePrice} دج / سيري (${product.piecesPerSerie} حبة)`
        });
      } catch (e) {
        console.error("خطأ فإرسال الصورة:", e.message);
      }
    }
  }
}

async function notifyAdminNewOrder(sock, order, customerJid) {
  if (ADMIN_NUMBERS.length === 0) return;
  const itemsText = (order.items || [])
    .map((it) => `- ${it.productName || it.productId}: ${it.series} سيري بسعر ${it.agreedPricePerSerie} دج/سيري`)
    .join("\n");
  const total = (order.items || []).reduce((sum, it) => sum + (Number(it.series) || 0) * (Number(it.agreedPricePerSerie) || 0), 0);
  const text = `📦 طلبية جديدة من البوت\n\nالزبون: ${order.customerName} ${order.customerSurname}\nالولاية: ${order.wilaya}\nالهاتف: ${order.phone || customerJid.split("@")[0]}\n\n${itemsText}\n\nالمجموع التقديري: ${total} دج\n\nرقم واتساب الزبون: ${customerJid.split("@")[0]}`;

  for (const num of ADMIN_NUMBERS) {
    try {
      await sock.sendMessage(`${num}@s.whatsapp.net`, { text });
    } catch (e) {
      console.error("تعذر إشعار الأدمين:", e.message);
    }
  }
}

async function handleAdminCommand(sock, jid, text) {
  // أمر سريع لإضافة سلعة عبر واتساب: #اضافة | الاسم | نوع | سعر_عادي | سعر_ادنى | حبات_السيري | مقاسات | ألوان
  if (text.startsWith("#اضافة")) {
    const parts = text.split("|").map((p) => p.trim());
    if (parts.length < 5) {
      await sock.sendMessage(jid, {
        text: "الصيغة: #اضافة | الاسم | النوع | السعر_العادي | السعر_الأدنى | (اختياري) حبات_السيري | (اختياري) مقاسات | (اختياري) ألوان"
      });
      return true;
    }
    const [, name, type, seriePrice, negotiatedFloor, piecesPerSerie, sizes, colors] = parts;
    const product = catalog.create({
      name,
      type,
      seriePrice: Number(seriePrice),
      negotiatedFloor: Number(negotiatedFloor),
      piecesPerSerie: piecesPerSerie ? Number(piecesPerSerie) : 12,
      sizes: sizes || "",
      colors: colors || ""
    });
    await sock.sendMessage(jid, {
      text: `تمت إضافة "${product.name}" بمعرف ${product.id}. تقدر ترسل صورتها دروك مع كتابة معرفها فالتعليق باش تترابط، ولا زيدها من لوحة التحكم.`
    });
    return true;
  }

  if (text.startsWith("#قائمة")) {
    const products = catalog.readAll();
    const list = products
      .map((p) => `${p.available ? "✅" : "⛔"} ${p.id} — ${p.name} — ${p.seriePrice} دج`)
      .join("\n");
    await sock.sendMessage(jid, { text: list || "الكتالوج فارغ حالياً." });
    return true;
  }

  if (text.startsWith("#خلص") || text.startsWith("#توفر")) {
    // #خلص شكل الأمر: #خلص id  او  #توفر id
    const id = text.split(" ")[1];
    const available = text.startsWith("#توفر");
    const updated = catalog.update(id, { available });
    await sock.sendMessage(jid, {
      text: updated
        ? `تم تحديث "${updated.name}" إلى ${available ? "متوفر" : "خلاص"}.`
        : "المعرف ماكانش موجود. استعمل #قائمة باش تشوف المعرفات."
    });
    return true;
  }

  return false;
}

async function handleIncomingMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast") return;
  if (msg.key.fromMe) return;

  const messageContent = msg.message;
  if (!messageContent) return;

  const text =
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    "";

  if (!text) return;

  // أوامر الأدمين (فقط للأرقام المسجلة فـ ADMIN_NUMBERS)
  if (jidToAdmin(jid) && text.startsWith("#")) {
    const handled = await handleAdminCommand(sock, jid, text);
    if (handled) return;
  }

  // محادثة عادية مع زبون
  pushHistory(jid, "user", text);

  try {
    const raw = await ai.getReply(getHistory(jid));
    const { cleanText, photoIds, order } = parseModelReply(raw);

    if (cleanText) {
      await sock.sendMessage(jid, { text: cleanText });
      pushHistory(jid, "assistant", cleanText);
    }

    if (photoIds.length > 0) {
      await sendProductPhotos(sock, jid, photoIds);
    }

    if (order) {
      const total = (order.items || []).reduce(
        (sum, it) => sum + (Number(it.series) || 0) * (Number(it.agreedPricePerSerie) || 0),
        0
      );
      const saved = orders.create({ ...order, phone: order.phone || jid.split("@")[0], total });
      await notifyAdminNewOrder(sock, saved, jid);
    }
  } catch (err) {
    console.error("خطأ فمعالجة الرسالة:", err.message);
    await sock.sendMessage(jid, {
      text: "معذرة صرا مشكل تقني صغير، عاود أرسل رسالتك من فضلك 🙏"
    });
  }
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false
  });
  sockRef = sock;

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("\n📱 امسح هذا الرمز بتطبيق واتساب (الأجهزة المرتبطة > ربط جهاز):\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("انقطع الاتصال، إعادة المحاولة:", shouldReconnect);
      if (shouldReconnect) startWhatsApp();
    } else if (connection === "open") {
      console.log("✅ البوت متصل بواتساب وجاهز للرد على الزبائن.");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      await handleIncomingMessage(sock, msg);
    }
  });

  return sock;
}

module.exports = { startWhatsApp, getSock: () => sockRef };

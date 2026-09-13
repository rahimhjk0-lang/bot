require("dotenv").config();

const { startWhatsApp } = require("./whatsapp");
const { createAdminServer } = require("./adminServer");

async function main() {
  const port = process.env.PORT || 3000;
  const app = createAdminServer();
  app.listen(port, () => {
    console.log(`🖥️  لوحة التحكم شغالة على المنفذ ${port}`);
  });

  await startWhatsApp();
}

main().catch((err) => {
  console.error("خطأ فتشغيل البوت:", err);
  process.exit(1);
});

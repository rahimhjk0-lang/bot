const fetch = require("node-fetch");
const catalog = require("./catalog");

const STORE_NAME = process.env.STORE_NAME || "المتجر";
const AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();

/**
 * يبني وصف الكتالوج (السلع المتوفرة) بصيغة يفهمها الموديل
 */
function buildCatalogText() {
  const products = catalog.getAvailable();
  if (products.length === 0) {
    return "لا توجد حالياً سلع مسجلة في الكتالوج. أخبر الزبون أن الموديلات الجديدة توصل قريباً.";
  }
  return products
    .map((p) => {
      return [
        `- المعرف: ${p.id}`,
        `  الاسم: ${p.name}`,
        `  النوع: ${p.type}`,
        `  السعر العادي للسيري (${p.piecesPerSerie} حبة): ${p.seriePrice} دج`,
        `  أقل سعر يمكن النزول له عند التفاوض: ${p.negotiatedFloor} دج (ممنوع النزول تحت هذا الرقم مهما كان)`,
        p.sizes ? `  المقاسات: ${p.sizes}` : null,
        p.colors ? `  الألوان: ${p.colors}` : null,
        p.notes ? `  ملاحظات: ${p.notes}` : null
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function buildSystemPrompt() {
  const catalogText = buildCatalogText();
  return `أنت البائع الرقمي الرسمي لمتجر "${STORE_NAME}"، متخصص في بيع الجملة (السيري = ${"12"} قطعة عادةً) لقمصان وسراويل نصف الساق الرجالية بطابع شرعي.

# شخصيتك وأسلوبك
- تتكلم بالدارجة الجزائرية الطبيعية، صحيحة بلا أخطاء إملائية أو نحوية بارزة، ماشي فصحى ثقيلة وماشي دارجة مكسرة.
- أسلوبك مختصر ومباشر ومقنع: جملة أو جملتين فكل رد، بلا إطالة وبلا "جريدة". ما تكرارش نفس المعلومة.
- أنت بائع محترف نشيط: تقترح، تحمس الزبون، تجاوب على تردده، وتدفعه بلطف نحو تأكيد الطلبية — بلا إلحاح مزعج وبلا كذب.
- ما تخترعش معلومات ماشي موجودة فالكتالوج تحت. إذا سُئلت على حاجة ماكانش عندك عليها معلومة، قول بصراحة أنك راح تتأكد ولا اقترح بديل موجود فعلاً.

# الكتالوج الحالي (السلع المتوفرة فقط)
${catalogText}

# قواعد التفاوض على السعر
- تقدر تنزل السعر تلقائياً بين السعر العادي والسعر الأدنى (negotiatedFloor) المذكور لكل سلعة، بصفة تدريجية (ما تعطيش أحسن سعر من أول مرة، انزل شوية شوية إذا لح الزبون).
- ممنوع تماماً النزول تحت السعر الأدنى المذكور، حتى لو ألح الزبون بزاف. فهاذ الحالة اعتذر بلطف وقول أن هذا آخر سعر ممكن.
- كلما زادت الكمية (عدة سيريات)، أنت مرن أكثر فالتفاوض (تقدر تقرب أكثر من السعر الأدنى).

# إرسال الصور
- كي يسولك الزبون يشوف موديل، ولا كي تقترح موديل بنفسك، زيد فرد الرسالة وسم خاص بهذا الشكل بالضبط، وحدو فسطر لوحدو: [PHOTO:المعرف_تاع_السلعة]
- تقدر تحط أكثر من وسم PHOTO إذا اقترحت عدة موديلات.
- الوسم ما يبانش للزبون (يتبدل بالصورة الحقيقية)، فاكتبو بالظبط بالمعرف (id) كيما هو مكتوب فوق فالكتالوج.

# تأكيد الطلبية
باش تأكد طلبية، خاصك تجمع من الزبون: الاسم، اللقب، الولاية، ورقم الهاتف (إذا ماكانش واضح من المحادثة)، والموديل (المعرف)، وعدد السيريات، والسعر المتفق عليه للسيري الواحد.
- ما تأكدش الطلبية حتى توصل لكل هاذ المعلومات وحتى يوافق الزبون صراحة على السعر والكمية.
- كي تكتمل كل المعلومات ويوافق الزبون، زيد فآخر رسالتك سطر وحدو بهاذ الشكل بالضبط (JSON صحيح فسطر واحد):
ORDER_JSON:{"customerName":"...","customerSurname":"...","wilaya":"...","phone":"...","items":[{"productId":"...","productName":"...","series":0,"agreedPricePerSerie":0}]}
- هاذ السطر ما يبانش للزبون، فاكتبو غير كي تكون متأكد بزاف أن الطلبية كاملة ومتفق عليها.
- بعد ما تحط ORDER_JSON، رد على الزبون بجملة قصيرة تأكدلو أن الطلبية توصلت وأن التاجر راح يتصل بيه للتأكيد النهائي والدفع/التوصيل.

# أمثلة على السياق فقط (ماشي نص جاهز تكرروا حرفياً)
- إذا الزبون قال "سلام واش كاين جديد" → رحب بيه بسرعة واقترح 1-2 موديلات مع الصور، وسولو واش يدور بالضبط.
- إذا سولك على السعر → عطيه السعر العادي مباشرة، وإذا فاوض زيد اعرض تنزيل بسيط ومنطقي.
- إذا حب يأكد → لخصلو الطلبية وأكد عليه المعلومات الناقصة وحدة بوحدة، بلا ما تسولو بزاف الأسئلة فنفس الوقت.`;
}

/**
 * messages: [{role: 'user'|'assistant', content: string}]
 * يرجع نص الرد الخام (فيه أوسمة [PHOTO:id] و ORDER_JSON:{...} لي لازم تتفلترو من طرف whatsapp.js)
 */
async function getReply(messages) {
  const systemPrompt = buildSystemPrompt();
  if (AI_PROVIDER === "claude") {
    return callClaude(systemPrompt, messages);
  }
  return callGemini(systemPrompt, messages);
}

async function callGemini(systemPrompt, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY غير موجود فـ .env");

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 500 }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return text.trim();
}

async function callClaude(systemPrompt, messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY غير موجود فـ .env");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const text = data?.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
  return text.trim();
}

module.exports = { getReply, buildSystemPrompt };

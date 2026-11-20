const LANGUAGES = {
  auto: {
    label: "Auto (EN <-> HI/Hinglish)",
    rule: "Detect the input language. If English, translate to natural Hindi. If Hindi or Hinglish, translate to natural English.",
  },
  en: {
    label: "English",
    rule: "Translate to natural, clear English.",
  },
  hi: {
    label: "Hindi (हिन्दी)",
    rule: "Translate to natural Hindi in Devanagari script.",
  },
  hinglish: {
    label: "Hinglish",
    rule: "Translate to natural everyday Hinglish in Latin script.",
  },
  mr: {
    label: "Marathi (मराठी)",
    rule: "Translate to natural Marathi in Devanagari script.",
  },
  ta: {
    label: "Tamil (தமிழ்)",
    rule: "Translate to natural Tamil in Tamil script.",
  },
  te: {
    label: "Telugu (తెలుగు)",
    rule: "Translate to natural Telugu in Telugu script.",
  },
  kn: {
    label: "Kannada (ಕನ್ನಡ)",
    rule: "Translate to natural Kannada in Kannada script.",
  },
  ml: {
    label: "Malayalam (മലയാളം)",
    rule: "Translate to natural Malayalam in Malayalam script.",
  },
  bn: {
    label: "Bengali (বাংলা)",
    rule: "Translate to natural Bengali in Bengali script.",
  },
  gu: {
    label: "Gujarati (ગુજરાતી)",
    rule: "Translate to natural Gujarati in Gujarati script.",
  },
  pa: {
    label: "Punjabi (ਪੰਜਾਬੀ)",
    rule: "Translate to natural Punjabi in Gurmukhi script.",
  },
};

const DEFAULT_LANG = "auto";
const GEMINI_MODEL = "gemini-3.8-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot webhook is live.");
  }

  const telegramToken = (process.env.TELEGRAM_TOKEN || "").trim();
  const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();
  const webhookSecret = (process.env.WEBHOOK_SECRET || "").trim();

  if (!telegramToken || !geminiApiKey) {
    return res.status(500).send("Missing TELEGRAM_TOKEN or GEMINI_API_KEY");
  }

  if (webhookSecret) {
    const incomingSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (incomingSecret !== webhookSecret) {
      return res.status(401).send("Unauthorized");
    }
  }

  let update;
  try {
    update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  if (!update) {
    return res.status(200).json({ ok: true });
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query, telegramToken);
      return res.status(200).json({ ok: true });
    }

    const message = update.message || update.edited_message;
    if (!message || !message.chat || !message.chat.id) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = (message.text || "").trim();

    if (!text) {
      return res.status(200).json({ ok: true });
    }

    await handleText(chatId, text, telegramToken, geminiApiKey);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: true });
  }
}

function buildKeyboard(activeCode) {
  const entries = Object.entries(LANGUAGES);
  const rows = [];

  for (let i = 0; i < entries.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < entries.length; j++) {
      const [code, info] = entries[j];
      row.push({
        text: `${code === activeCode ? "✅ " : ""}${info.label}`,
        callback_data: `lang:${code}`,
      });
    }
    rows.push(row);
  }

  return { inline_keyboard: rows };
}

function parsePrefix(text) {
  const match = text.match(/^\/([a-z]+)\s+([\s\S]+)$/i);
  if (match) {
    const code = match[1].toLowerCase();
    if (LANGUAGES[code]) {
      return { langCode: code, cleanText: match[2].trim() };
    }
  }
  return { langCode: DEFAULT_LANG, cleanText: text };
}

async function handleCallback(cq, token) {
  const callbackId = cq.id;
  const data = cq.data || "";
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;

  const code = data.startsWith("lang:") ? data.slice(5) : DEFAULT_LANG;
  const lang = LANGUAGES[code] || LANGUAGES[DEFAULT_LANG];

  await tgApi(token, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text: `Selected: ${lang.label}`,
  });

  if (chatId && messageId) {
    await tgApi(token, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: buildKeyboard(code),
    });

    await sendText(
      token,
      chatId,
      `Language set to ${lang.label}. Ab koi bhi text bhejein (ya /mr <text>).`
    );
  }
}

async function handleText(chatId, text, token, apiKey) {
  if (text === "/start" || text === "/lang") {
    await tgApi(token, "sendMessage", {
      chat_id: chatId,
      text: "Translator bot ready hai. Language chunein ya seedha text bhejein (example: /mr Aaj mausam accha hai).",
      reply_markup: buildKeyboard(DEFAULT_LANG),
    });
    return;
  }

  if (text === "/help") {
    await sendText(
      token,
      chatId,
      "Commands: /start, /lang, /help\nPrefixes: /en, /hi, /hinglish, /mr, /ta, /te, /kn, /ml, /bn, /gu, /pa"
    );
    return;
  }

  const { langCode, cleanText } = parsePrefix(text);

  try {
    const translated = await translateWithGemini(cleanText, langCode, apiKey);
    await sendText(token, chatId, translated);
  } catch (err) {
    await sendText(token, chatId, `Error: ${err.message}`);
  }
}

async function translateWithGemini(text, langCode, apiKey) {
  const target = LANGUAGES[langCode] || LANGUAGES[DEFAULT_LANG];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `${target.rule}
Return ONLY the translated text without quotes or extra notes.

Text:
${text}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const apiMsg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(apiMsg);
  }

  const output =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  if (!output) {
    throw new Error("Empty response from Gemini");
  }

  return output;
}

async function sendText(token, chatId, text) {
  const safe = text.length > 4000 ? text.slice(0, 4000) : text;
  await tgApi(token, "sendMessage", {
    chat_id: chatId,
    text: safe,
  });
}

async function tgApi(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Telegram ${method} failed: ${res.status} ${errText}`);
  }
}

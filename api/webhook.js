const LANGUAGES = {
  auto: {
    label: "Auto (EN <-> HI/Hinglish)",
    instruction:
      "Detect the language of the input text. If it is in English, translate it into natural Hindi. If it is in Hindi or Hinglish, translate it into natural English.",
  },
  en: {
    label: "English",
    instruction: "Translate the input text into natural, clear English.",
  },
  hi: {
    label: "Hindi (हिन्दी)",
    instruction: "Translate the input text into natural Hindi in Devanagari script.",
  },
  hinglish: {
    label: "Hinglish",
    instruction:
      "Translate the input text into natural everyday Hinglish written in Latin script.",
  },
  mr: {
    label: "Marathi (मराठी)",
    instruction: "Translate the input text into natural Marathi in Devanagari script.",
  },
  ta: {
    label: "Tamil (தமிழ்)",
    instruction: "Translate the input text into natural Tamil in Tamil script.",
  },
  te: {
    label: "Telugu (తెలుగు)",
    instruction: "Translate the input text into natural Telugu in Telugu script.",
  },
  kn: {
    label: "Kannada (ಕನ್ನಡ)",
    instruction: "Translate the input text into natural Kannada in Kannada script.",
  },
  ml: {
    label: "Malayalam (മലയാളം)",
    instruction: "Translate the input text into natural Malayalam in Malayalam script.",
  },
  bn: {
    label: "Bengali (বাংলা)",
    instruction: "Translate the input text into natural Bengali in Bengali script.",
  },
  gu: {
    label: "Gujarati (ગુજરાતી)",
    instruction: "Translate the input text into natural Gujarati in Gujarati script.",
  },
  pa: {
    label: "Punjabi (ਪੰਜਾਬੀ)",
    instruction: "Translate the input text into natural Punjabi in Gurmukhi script.",
  },
};

const DEFAULT_LANG = "auto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Telegram Translator Vercel endpoint is active.");
  }

  const telegramToken = process.env.TELEGRAM_TOKEN;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!telegramToken || !geminiApiKey) {
    return res.status(500).send("Missing TELEGRAM_TOKEN or GEMINI_API_KEY.");
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
    return res.status(400).send("Empty payload");
  }

  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, telegramToken);
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

    await handleMessage(chatId, text, telegramToken, geminiApiKey);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(200).json({ ok: true });
  }
}

function buildLanguageKeyboard(activeCode) {
  const entries = Object.entries(LANGUAGES);
  const rows = [];

  for (let i = 0; i < entries.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < entries.length; j++) {
      const [code, info] = entries[j];
      const prefix = code === activeCode ? "✅ " : "";
      row.push({
        text: `${prefix}${info.label}`,
        callback_data: `set_lang:${code}`,
      });
    }
    rows.push(row);
  }

  return { inline_keyboard: rows };
}

function parseLanguagePrefix(text) {
  const match = text.match(/^\/([a-z]+)\s+([\s\S]+)$/i);
  if (match) {
    const code = match[1].toLowerCase();
    if (LANGUAGES[code]) {
      return { langCode: code, cleanText: match[2].trim() };
    }
  }
  return { langCode: DEFAULT_LANG, cleanText: text };
}

async function handleCallbackQuery(callbackQuery, token) {
  const callbackId = callbackQuery.id;
  const data = callbackQuery.data || "";
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  if (!data.startsWith("set_lang:")) {
    await answerCallbackQuery(token, callbackId, "Updated.");
    return;
  }

  const chosenCode = data.replace("set_lang:", "");
  const chosenLang = LANGUAGES[chosenCode] || LANGUAGES[DEFAULT_LANG];

  await answerCallbackQuery(token, callbackId, `Selected: ${chosenLang.label}`);

  if (chatId && messageId) {
    await editMessageReplyMarkup(
      token,
      chatId,
      messageId,
      buildLanguageKeyboard(chosenCode)
    );
    await sendTelegramMessage(
      token,
      chatId,
      `Target language set to ${chosenLang.label}. Send text or use /<code> <text> (for example: /mr Kal milte hain).`
    );
  }
}

async function handleMessage(chatId, text, token, apiKey) {
  try {
    if (text === "/start" || text === "/lang") {
      const welcomeText = [
        "Translator bot ready.",
        "",
        "Send any text to translate, or tap a language button below.",
        "Per-message override example: /mr Aaj mausam accha hai",
      ].join("\n");

      await sendTelegramMessageWithKeyboard(
        token,
        chatId,
        welcomeText,
        buildLanguageKeyboard(DEFAULT_LANG)
      );
      return;
    }

    if (text === "/help") {
      const helpText = [
        "Commands:",
        "/start or /lang - Show language buttons",
        "/help - Show commands",
        "",
        "Language codes: /en, /hi, /hinglish, /mr, /ta, /te, /kn, /ml, /bn, /gu, /pa",
      ].join("\n");

      await sendTelegramMessage(token, chatId, helpText);
      return;
    }

    const { langCode, cleanText } = parseLanguagePrefix(text);
    const translated = await translateText(cleanText, langCode, apiKey);
    await sendTelegramMessage(token, chatId, translated);
  } catch (err) {
    await sendTelegramMessage(
      token,
      chatId,
      "Translation mein problem aayi. Thodi der baad try karein."
    );
  }
}

async function translateText(text, langCode, apiKey) {
  const target = LANGUAGES[langCode] || LANGUAGES[DEFAULT_LANG];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemPrompt = [
    "You are a precise translation engine for English and Indian languages.",
    target.instruction,
    "Preserve names, numbers, handles, URLs, and line breaks.",
    "Output ONLY the translated text without explanations, notes, or quotes.",
  ].join(" ");

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Gemini API failed with status ${res.status}`);
  }

  const data = await res.json();
  const translated =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  if (!translated) {
    throw new Error("Empty translation output");
  }

  return translated;
}

async function sendTelegramMessage(token, chatId, text) {
  const chunks = splitMessage(text, 4000);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  for (const chunk of chunks) {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
      }),
    });
  }
}

async function sendTelegramMessageWithKeyboard(token, chatId, text, replyMarkup) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    }),
  });
}

async function answerCallbackQuery(token, callbackQueryId, text) {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  });
}

async function editMessageReplyMarkup(token, chatId, messageId, replyMarkup) {
  const url = `https://api.telegram.org/bot${token}/editMessageReplyMarkup`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    }),
  });
}

function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];
  const parts = [];
  for (let i = 0; i < text.length; i += maxLength) {
    parts.push(text.slice(i, i + maxLength));
  }
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");
  
  try {
    const update = req.body;
    if (!update?.message?.text) return res.status(200).send("OK");
    
    const chatId = update.message.chat.id;
    const userText = update.message.text;
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;
    
    if (userText.startsWith("/start")) {
      await sendTelegramMessage(telegramToken, chatId, "✦ Send me any text. I will auto-detect the language and provide a premium translation.");
      return res.status(200).send("OK");
    }
    
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });
    
    const sysInst = "You are an elite enterprise translation system.\nStrict rules:\n1. Absolutely NO emojis.\n2. Use premium typographical symbols (✦, ↬, ↳, ❖, ⚑, ◈).\n3. Auto-detect the source language. Translate to English if the source is an Indian language, or to Hindi if the source is English. If the user explicitly asks for a target language, follow it exactly.\n4. Output as a formatted text block.\nRequired Layout:\n⚑ Source: [Language] ↬ Target: [Language]\n✦ Translation: [Text]\n↳ Transliteration: [Text, or N/A]\n❖ Formality: [Level]\n◈ Nuance: [Context]";
    
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userText }] }],
        systemInstruction: { parts: [{ text: sysInst }] },
        generationConfig: { temperature: 0.1 }
      })
    });
    
    if (!geminiRes.ok) {
      await sendTelegramMessage(telegramToken, chatId, "◈ Error: Translation engine is currently unavailable.");
      return res.status(200).send("OK");
    }
    
    const data = await geminiRes.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "◈ Error: Failed to generate translation.";
    
    await sendTelegramMessage(telegramToken, chatId, replyText);
    return res.status(200).send("OK");
  } catch (error) {
    return res.status(200).send("OK");
  }
}

async function sendTelegramMessage(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true })
  });
}


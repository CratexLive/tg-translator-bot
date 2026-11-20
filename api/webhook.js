export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Auto-approve channel webhook is live.");
  }

  const telegramToken = (process.env.TELEGRAM_TOKEN || "").trim();
  const webhookSecret = (process.env.WEBHOOK_SECRET || "").trim();

  if (!telegramToken) {
    return res.status(500).send("Missing TELEGRAM_TOKEN");
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
    // 1. Channel / Group Join Request Auto-Approve
    if (update.chat_join_request) {
      const joinReq = update.chat_join_request;
      const chatId = joinReq.chat?.id;
      const userId = joinReq.from?.id;

      if (chatId && userId) {
        await tgApi(telegramToken, "approveChatJoinRequest", {
          chat_id: chatId,
          user_id: userId,
        });
      }

      return res.status(200).json({ ok: true });
    }

    // 2. Optional: Bot ko DM mein /start bhejne par confirmation
    const message = update.message || update.edited_message;
    if (message?.chat?.id && message?.text?.trim() === "/start") {
      await tgApi(telegramToken, "sendMessage", {
        chat_id: message.chat.id,
        text: "Auto-approve bot active hai. Channel mein admin + invite users permission dein.",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Auto-approve error:", err);
    // Telegram ko 200 bhejein taaki repeat retries na atakें
    return res.status(200).json({ ok: true });
  }
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

  return res.json();
}

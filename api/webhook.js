export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send("Bot webhook is running.");
    }

    const token = (process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
    const secret = (process.env.WEBHOOK_SECRET || "").trim();

    if (!token) {
      return res.status(200).json({ ok: true });
    }

    if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
      return res.status(401).send("Unauthorized");
    }

    let update = req.body;
    if (typeof update === "string") {
      try {
        update = JSON.parse(update);
      } catch {
        return res.status(200).json({ ok: true });
      }
    }

    if (update?.chat_join_request) {
      await handleJoinRequest(update.chat_join_request, token);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: true });
  }
}

async function handleJoinRequest(joinReq, token) {
  const chatId = joinReq.chat?.id;
  const user = joinReq.from;
  const userId = user?.id;

  if (!chatId || !userId) return;

  const approved = await tgApi(token, "approveChatJoinRequest", {
    chat_id: chatId,
    user_id: userId,
  });

  if (approved?.ok) {
    const chatTitle = escapeHtml(joinReq.chat?.title || "the group");

    await safeTgApi(token, "sendMessage", {
      chat_id: userId,
      text: [
        `Hᴇʏ ! Yᴏᴜʀ ᴊᴏɪɴ ʀᴇQᴜᴇꜱᴛ ꜰᴏʀ <b>${chatTitle}</b>  ʜᴀꜱ ʙᴇᴇɴ ᴀᴘᴘʀᴏᴠᴇᴅ.`,
        "",
        `Exᴘʟᴏʀᴇ ᴏᴜʀ ᴏꜰꜰɪᴄɪᴀʟ ᴄʜᴀɴɴᴇʟꜱ ʙᴇʟᴏᴡ👇🏻`,
      ].join("\n"),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "All Channels • Links & Updates",
              url: "https://t.me/addlist/BY7LjD-KUlwyMDY1",
            },
          ],
          [
            {
              text: "Football Channel",
              url: "https://t.me/+LQiE7McsrF44MTZl",
            },
          ],
        ],
      },
    });
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function safeTgApi(token, method, body) {
  try {
    return await tgApi(token, method, body);
  } catch {
    return null;
  }
}

async function tgApi(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data?.description || `Telegram ${method} HTTP ${res.status}`);
  }
  return data;
}


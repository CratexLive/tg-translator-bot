const CHANNELS = {
  all: "https://t.me/addlist/BY7LjD-KUlwyMDY1",
  football: "https://t.me/+LQiE7McsrF44MTZl",
};

const SMALL_CAPS = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ғ", g: "ɢ", h: "ʜ",
  i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ",
  q: "ǫ", r: "ʀ", s: "ꜱ", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x",
  y: "ʏ", z: "ᴢ",
  A: "ᴀ", B: "ʙ", C: "ᴄ", D: "ᴅ", E: "ᴇ", F: "ғ", G: "ɢ", H: "ʜ",
  I: "ɪ", J: "ᴊ", K: "ᴋ", L: "ʟ", M: "ᴍ", N: "ɴ", O: "ᴏ", P: "ᴘ",
  Q: "ǫ", R: "ʀ", S: "ꜱ", T: "ᴛ", U: "ᴜ", V: "ᴠ", W: "ᴡ", X: "x",
  Y: "ʏ", Z: "ᴢ",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Join Request Bot is running.", { status: 200 });
    }

    try {
      const update = await request.json();
      const token = (env.BOT_TOKEN || env.TELEGRAM_TOKEN || "").trim();

      if (!token) {
        return new Response("Missing bot token", { status: 200 });
      }

      if (update?.chat_join_request) {
        await handleJoinRequest(update.chat_join_request, token);
      } else if (update?.message?.text?.startsWith("/start")) {
        await handleStartCommand(update.message, token);
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Worker error:", err);
      return new Response("OK", { status: 200 });
    }
  },
};

async function handleJoinRequest(joinReq, token) {
  const chatId = joinReq.chat?.id;
  const user = joinReq.from;
  const userId = user?.id;

  if (!chatId || !userId) return;

  try {
    await tgApi(token, "approveChatJoinRequest", {
      chat_id: chatId,
      user_id: userId,
    });
  } catch (err) {
    console.error("approveChatJoinRequest failed:", err.message);
    return;
  }

  const chatTitle = escapeHtml(joinReq.chat?.title || "the group");
  const userName = escapeHtml(user.first_name || "there");

  const text = [
    `✦ <b>${sc("ACCESS GRANTED")}</b> ✦`,
    "━━━━━━━━━━━━━━━━━━━━━━",
    `Hᴇʏ <b>${userName}</b>! Yᴏᴜʀ ᴊᴏɪɴ ʀᴇQᴜᴇꜱᴛ ꜰᴏʀ <b>${chatTitle}</b> ʜᴀꜱ ʙᴇᴇɴ ᴀᴘᴘʀᴏᴠᴇᴅ.`,
    "",
    `Exᴘʟᴏʀᴇ ᴏᴜʀ ᴏꜰꜰɪᴄɪᴀʟ ᴄʜᴀɴɴᴇʟꜱ ʙᴇʟᴏᴡ👇🏻`,
    "━━━━━━━━━━━━━━━━━━━━━━",
    `<i>${sc("Instant links • Live updates • Official hubs")}</i>`,
  ].join("\n");

  try {
    await tgApi(token, "sendMessage", {
      chat_id: userId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: buildChannelKeyboard(),
    });
  } catch (err) {
    console.error("sendMessage DM failed:", err.message);
  }
}

async function handleStartCommand(message, token) {
  const chatId = message.chat?.id;
  const userName = escapeHtml(message.from?.first_name || "there");

  if (!chatId) return;

  const text = [
    `✦ <b>${sc("OFFICIAL GATEWAY")}</b> ✦`,
    "━━━━━━━━━━━━━━━━━━━━━━",
    `Hᴇʏ <b>${userName}</b>! Wᴇʟᴄᴏᴍᴇ ᴛᴏ ᴛʜᴇ ᴏꜰꜰɪᴄɪᴀʟ ᴄʜᴀɴɴᴇʟ ʜᴜʙ.`,
    "",
    `Exᴘʟᴏʀᴇ ᴏᴜʀ ᴏꜰꜰɪᴄɪᴀʟ ᴄʜᴀɴɴᴇʟꜱ ʙᴇʟᴏᴡ👇🏻`,
    "━━━━━━━━━━━━━━━━━━━━━━",
    `<i>${sc("Tap a button below to join instantly")}</i>`,
  ].join("\n");

  try {
    await tgApi(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: buildChannelKeyboard(),
    });
  } catch (err) {
    console.error("/start sendMessage failed:", err.message);
  }
}

function buildChannelKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: `❖ ${sc("All Channels • Links & Updates")}`,
          url: CHANNELS.all,
        },
      ],
      [
        {
          text: `⚽ ${sc("Football Channel")}`,
          url: CHANNELS.football,
        },
      ],
    ],
  };
}

function sc(str) {
  return String(str || "").replace(/[A-Za-z]/g, (ch) => SMALL_CAPS[ch] || ch);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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


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

const memoryStore = new Map();

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send("Bot webhook is running.");
    }

    const token = (process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
    const secret = (process.env.WEBHOOK_SECRET || "").trim();
    const logChatId = (process.env.LOG_CHAT_ID || "").trim();

    if (!token) {
      return res.status(200).json({ ok: true, error: "Missing bot token" });
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

    if (!update || typeof update !== "object") {
      return res.status(200).json({ ok: true });
    }

    if (update.chat_join_request) {
      await handleJoinRequest(update.chat_join_request, token, logChatId);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, token);
    } else if (update.message) {
      await handleMessage(update.message, token, logChatId);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: true });
  }
}

async function storeGet(key) {
  try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
      const data = await res.json().catch(() => ({}));
      if (typeof data?.result === "string") {
        try {
          return JSON.parse(data.result);
        } catch {
          return data.result;
        }
      }
      return data?.result ?? null;
    }
  } catch (err) {
    console.error("storeGet error:", err.message);
  }
  return memoryStore.get(key) ?? null;
}

async function storeSet(key, value) {
  memoryStore.set(key, value);
  try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}`;
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(value),
      });
    }
  } catch (err) {
    console.error("storeSet error:", err.message);
  }
}

function getDefaultSettings() {
  return {
    autoApprove: true,
    dmEnabled: true,
    channels: { ...CHANNELS },
    stats: {
      approvedCount: 0,
      dmSentCount: 0,
      dmFailedCount: 0,
      startsCount: 0,
    },
  };
}

async function getSettings() {
  const existing = (await storeGet("jr:settings")) || {};
  const base = getDefaultSettings();
  return {
    ...base,
    ...existing,
    channels: { ...base.channels, ...(existing.channels || {}) },
    stats: { ...base.stats, ...(existing.stats || {}) },
  };
}

async function saveSettings(settings) {
  await storeSet("jr:settings", settings);
}

async function handleJoinRequest(joinReq, token, logChatId) {
  const chatId = joinReq.chat?.id;
  const user = joinReq.from;
  const userId = user?.id;

  if (!chatId || !userId) return;

  const settings = await getSettings();
  let approved = false;

  if (settings.autoApprove) {
    const res = await safeTgApi(token, "approveChatJoinRequest", {
      chat_id: chatId,
      user_id: userId,
    });
    approved = Boolean(res?.ok);
  }

  if (approved) {
    settings.stats.approvedCount += 1;
    await saveSettings(settings);
  }

  if (approved && settings.dmEnabled) {
    const chatTitle = escapeHtml(joinReq.chat?.title || "the group");
    const userName = escapeHtml(user.first_name || "there");

    const sent = await safeTgApi(token, "sendMessage", {
      chat_id: userId,
      text: [
        `✦ <b>${sc("ACCESS GRANTED")}</b> ✦`,
        "━━━━━━━━━━━━━━━━━━━━━━",
        `Hᴇʏ <b>${userName}</b>! Yᴏᴜʀ ᴊᴏɪɴ ʀᴇQᴜᴇꜱᴛ ꜰᴏʀ <b>${chatTitle}</b> ʜᴀꜱ ʙᴇᴇɴ ᴀᴘᴘʀᴏᴠᴇᴅ.`,
        "",
        `Exᴘʟᴏʀᴇ ᴏᴜʀ ᴏꜰꜰɪᴄɪᴀʟ ᴄʜᴀɴɴᴇʟꜱ ʙᴇʟᴏᴡ👇🏻`,
        "━━━━━━━━━━━━━━━━━━━━━━",
        `<i>${sc("Instant links • Live updates • Official hubs")}</i>`,
      ].join("\n"),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: buildChannelKeyboard(settings.channels),
    });

    if (sent?.ok) {
      settings.stats.dmSentCount += 1;
    } else {
      settings.stats.dmFailedCount += 1;
    }
    await saveSettings(settings);
  }

  if (logChatId) {
    const who = user.username ? `@${escapeHtml(user.username)}` : `<code>${userId}</code>`;
    const title = escapeHtml(joinReq.chat?.title || String(chatId));
    await safeTgApi(token, "sendMessage", {
      chat_id: logChatId,
      text: [
        `<b>◆ ${sc("JOIN REQUEST LOG")}</b>`,
        `▸ <b>${sc("Chat:")}</b> ${title}`,
        `▸ <b>${sc("User:")}</b> ${who}`,
        `▸ <b>${sc("Approved:")}</b> <code>${approved ? "YES" : "NO"}</code>`,
      ].join("\n"),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }
}

async function handleMessage(msg, token, logChatId) {
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();
  if (!chatId || !text) return;

  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@[a-z0-9_]+$/i, "");
  const args = text.split(/\s+/).slice(1);
  const settings = await getSettings();

  if (cmd === "/start") {
    settings.stats.startsCount += 1;
    await saveSettings(settings);

    const userName = escapeHtml(msg.from?.first_name || "there");
    await safeTgApi(token, "sendMessage", {
      chat_id: chatId,
      text: [
        `✦ <b>${sc("HELLO")} ${userName}</b> ✦`,
        "━━━━━━━━━━━━━━━━━━━━━━",
        `Exᴘʟᴏʀᴇ ᴏᴜʀ ᴏꜰꜰɪᴄɪᴀʟ ᴄʜᴀɴɴᴇʟꜱ ʙᴇʟᴏᴡ👇🏻`,
        "━━━━━━━━━━━━━━━━━━━━━━",
        `<i>${sc("Auto-approve active • Official channel hub")}</i>`,
      ].join("\n"),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: buildChannelKeyboard(settings.channels),
    });
    return;
  }

  if (cmd === "/status" || cmd === "/stats") {
    await safeTgApi(token, "sendMessage", {
      chat_id: chatId,
      text: [
        `<b>◆ ${sc("BOT STATUS & STATS")}</b>`,
        "━━━━━━━━━━━━━━━━━━━━━━",
        `▸ <b>${sc("Auto-Approve:")}</b> <code>${settings.autoApprove ? "ON" : "OFF"}</code>`,
        `▸ <b>${sc("Welcome DM:")}</b> <code>${settings.dmEnabled ? "ON" : "OFF"}</code>`,
        `▸ <b>${sc("Approved:")}</b> <code>${settings.stats.approvedCount}</code>`,
        `▸ <b>${sc("DMs Sent:")}</b> <code>${settings.stats.dmSentCount}</code> • <b>${sc("Failed:")}</b> <code>${settings.stats.dmFailedCount}</code>`,
        `▸ <b>${sc("Total /start:")}</b> <code>${settings.stats.startsCount}</code>`,
      ].join("\n"),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: buildAdminKeyboard(settings),
    });
    return;
  }

  if (cmd === "/autoapprove") {
    const val = (args[0] || "").toLowerCase();
    if (!["on", "off"].includes(val)) {
      await safeTgApi(token, "sendMessage", {
        chat_id: chatId,
        text: `<b>${sc("Usage:")}</b> <code>/autoapprove on|off</code>`,
        parse_mode: "HTML",
      });
      return;
    }
    settings.autoApprove = val === "on";
    await saveSettings(settings);
    await safeTgApi(token, "sendMessage", {
      chat_id: chatId,
      text: `<b>◆ ${sc("AUTO-APPROVE:")}</b> <code>${val.toUpperCase()}</code>`,
      parse_mode: "HTML",
    });
    return;
  }

  if (cmd === "/dm") {
    const val = (args[0] || "").toLowerCase();
    if (!["on", "off"].includes(val)) {
      await safeTgApi(token, "sendMessage", {
        chat_id: chatId,
        text: `<b>${sc("Usage:")}</b> <code>/dm on|off</code>`,
        parse_mode: "HTML",
      });
      return;
    }
    settings.dmEnabled = val === "on";
    await saveSettings(settings);
    await safeTgApi(token, "sendMessage", {
      chat_id: chatId,
      text: `<b>◆ ${sc("WELCOME DM:")}</b> <code>${val.toUpperCase()}</code>`,
      parse_mode: "HTML",
    });
    return;
  }

  if (cmd === "/setall" && args[0]) {
    settings.channels.all = args[0].trim();
    await saveSettings(settings);
    await safeTgApi(token, "sendMessage", {
      chat_id: chatId,
      text: `<b>◆ ${sc("ALL CHANNELS LINK UPDATED")}</b>`,
      parse_mode: "HTML",
    });
    return;
  }

  if (cmd === "/setfootball" && args[0]) {
    settings.channels.football = args[0].trim();
    await saveSettings(settings);
    await safeTgApi(token, "sendMessage", {
      chat_id: chatId,
      text: `<b>◆ ${sc("FOOTBALL CHANNEL LINK UPDATED")}</b>`,
      parse_mode: "HTML",
    });
    return;
  }

  if (cmd === "/id") {
    await safeTgApi(token, "sendMessage", {
      chat_id: chatId,
      text: `<b>▸ ${sc("Chat ID:")}</b> <code>${chatId}</code>\n<b>▸ ${sc("User ID:")}</b> <code>${msg.from?.id ?? "N/A"}</code>`,
      parse_mode: "HTML",
    });
  }
}

async function handleCallbackQuery(cq, token) {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const data = cq.data || "";
  const settings = await getSettings();

  if (data === "toggle:autoapprove") {
    settings.autoApprove = !settings.autoApprove;
    await saveSettings(settings);
    await safeTgApi(token, "answerCallbackQuery", {
      callback_query_id: cq.id,
      text: `Auto-Approve: ${settings.autoApprove ? "ON" : "OFF"}`,
    });
  } else if (data === "toggle:dm") {
    settings.dmEnabled = !settings.dmEnabled;
    await saveSettings(settings);
    await safeTgApi(token, "answerCallbackQuery", {
      callback_query_id: cq.id,
      text: `Welcome DM: ${settings.dmEnabled ? "ON" : "OFF"}`,
    });
  } else {
    await safeTgApi(token, "answerCallbackQuery", { callback_query_id: cq.id });
    return;
  }

  if (chatId && messageId) {
    await safeTgApi(token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: [
        `<b>◆ ${sc("BOT STATUS & STATS")}</b>`,
        "━━━━━━━━━━━━━━━━━━━━━━",
        `▸ <b>${sc("Auto-Approve:")}</b> <code>${settings.autoApprove ? "ON" : "OFF"}</code>`,
        `▸ <b>${sc("Welcome DM:")}</b> <code>${settings.dmEnabled ? "ON" : "OFF"}</code>`,
        `▸ <b>${sc("Approved:")}</b> <code>${settings.stats.approvedCount}</code>`,
        `▸ <b>${sc("DMs Sent:")}</b> <code>${settings.stats.dmSentCount}</code> • <b>${sc("Failed:")}</b> <code>${settings.stats.dmFailedCount}</code>`,
        `▸ <b>${sc("Total /start:")}</b> <code>${settings.stats.startsCount}</code>`,
      ].join("\n"),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: buildAdminKeyboard(settings),
    });
  }
}

function buildChannelKeyboard(channels = CHANNELS) {
  return {
    inline_keyboard: [
      [
        {
          text: `❖ ${sc("All Channels • Links & Updates")}`,
          url: channels.all || CHANNELS.all,
        },
      ],
      [
        {
          text: `⚽ ${sc("Football Channel")}`,
          url: channels.football || CHANNELS.football,
        },
      ],
    ],
  };
}

function buildAdminKeyboard(settings) {
  return {
    inline_keyboard: [
      [
        {
          text: `${sc("Auto-Approve:")} ${settings.autoApprove ? "ON" : "OFF"}`,
          callback_data: "toggle:autoapprove",
        },
        {
          text: `${sc("DM:")} ${settings.dmEnabled ? "ON" : "OFF"}`,
          callback_data: "toggle:dm",
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

async function safeTgApi(token, method, body) {
  try {
    return await tgApi(token, method, body);
  } catch (err) {
    console.error(`Telegram ${method} failed:`, err.message);
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


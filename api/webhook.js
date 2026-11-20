export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Telegram Group Manager Bot webhook is live.");
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
    if (update.chat_join_request) {
      const chatId = update.chat_join_request.chat?.id;
      const userId = update.chat_join_request.from?.id;
      if (chatId && userId) {
        await tgApi(telegramToken, "approveChatJoinRequest", {
          chat_id: chatId,
          user_id: userId,
        });
      }
      return res.status(200).json({ ok: true });
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query, telegramToken);
      return res.status(200).json({ ok: true });
    }

    const message = update.message || update.edited_message;
    if (!message || !message.chat || !message.chat.id) {
      return res.status(200).json({ ok: true });
    }

    await handleMessage(message, telegramToken);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: true });
  }
}

function hasRedis() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

const memoryStore = new Map();

async function storeGet(key) {
  if (hasRedis()) {
    const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    });
    const data = await res.json().catch(() => ({}));
    return data?.result ? JSON.parse(data.result) : null;
  }
  return memoryStore.get(key) ?? null;
}

async function storeSet(key, value) {
  if (hasRedis()) {
    const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
      key
    )}/${encodeURIComponent(JSON.stringify(value))}`;
    await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    });
    return;
  }
  memoryStore.set(key, value);
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Moderation", callback_data: "help:mod" },
        { text: "Warnings", callback_data: "help:warn" },
      ],
      [
        { text: "Filters & Notes", callback_data: "help:fn" },
        { text: "Auto-Approve", callback_data: "help:approve" },
      ],
    ],
  };
}

async function handleCallback(cq, token) {
  const chatId = cq.message?.chat?.id;
  const data = cq.data || "";

  const helpMap = {
    "help:mod":
      "Moderation:\n/ban [id|reply] [reason]\n/tban [id|reply] 2d [reason]\n/unban [id|reply]\n/mute [id|reply] [reason]\n/tmute [id|reply] 2h [reason]\n/unmute [id|reply]\n/kick [id|reply] [reason]\n/pin (reply)\n/unpin",
    "help:warn":
      "Warnings:\n/warn [id|reply] [reason]\n/warns [id|reply]\n/rmwarn [id|reply]\n/resetwarn [id|reply]\n(Automatic ban at 3 warnings)",
    "help:fn":
      "Filters & Notes:\n/filter <keyword> <reply>\n/filters\n/stop <keyword>\n/save <name> <content>\n/get <name> or #<name>\n/notes\n/clear <name>",
    "help:approve":
      "Auto-Approve:\nEnable Request Admin Approval on the invite link and grant the bot Invite Users admin permission.",
  };

  await tgApi(token, "answerCallbackQuery", {
    callback_query_id: cq.id,
    text: "Opened",
  });

  if (chatId && helpMap[data]) {
    await sendText(token, chatId, helpMap[data]);
  }
}

async function handleMessage(message, token) {
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const senderId = message.from?.id;
  const rawText = (message.text || "").trim();
  if (!rawText) return;

  const cleanLine = rawText.replace(/^(\/[a-zA-Z0-9_]+)@\S+/, "$1");
  const parts = cleanLine.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    await tgApi(token, "sendMessage", {
      chat_id: chatId,
      text: "Group Manager Bot is ready. Select a category below to view commands.",
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  if (cmd === "/id") {
    const lines = [`Chat ID: ${chatId}`, `Your ID: ${senderId ?? "N/A"}`];
    if (message.reply_to_message?.from?.id) {
      lines.push(`Replied User ID: ${message.reply_to_message.from.id}`);
    }
    await sendText(token, chatId, lines.join("\n"));
    return;
  }

  if (/^#[a-zA-Z0-9_-]+$/.test(cleanLine)) {
    const noteName = cleanLine.slice(1).toLowerCase();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    if (notes[noteName]) {
      await sendText(token, chatId, notes[noteName]);
    }
    return;
  }

  if (cmd === "/get") {
    const noteName = (parts[1] || "").toLowerCase();
    if (!noteName) {
      await sendText(token, chatId, "Usage: /get <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    await sendText(token, chatId, notes[noteName] || "Note not found.");
    return;
  }

  if (cmd === "/notes") {
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    const keys = Object.keys(notes);
    await sendText(
      token,
      chatId,
      keys.length ? `Saved notes:\n${keys.map((k) => `#${k}`).join(", ")}` : "No saved notes."
    );
    return;
  }

  const adminCmds = [
    "/ban",
    "/tban",
    "/unban",
    "/mute",
    "/tmute",
    "/unmute",
    "/kick",
    "/pin",
    "/unpin",
    "/warn",
    "/warns",
    "/rmwarn",
    "/resetwarn",
    "/filter",
    "/filters",
    "/stop",
    "/save",
    "/clear",
  ];

  if (adminCmds.includes(cmd)) {
    if (chatType === "private") {
      await sendText(token, chatId, "These commands only work in groups or supergroups.");
      return;
    }
    if (!senderId || !(await isAdmin(token, chatId, senderId))) {
      await sendText(token, chatId, "Only group administrators can use this command.");
      return;
    }
    await handleAdminCommand(message, token, cmd, parts, cleanLine);
    return;
  }

  if (chatType !== "private") {
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    const lowerText = rawText.toLowerCase();
    for (const [trigger, reply] of Object.entries(filters)) {
      if (lowerText.includes(trigger)) {
        await sendText(token, chatId, reply);
        break;
      }
    }
  }
}

async function handleAdminCommand(message, token, cmd, parts, cleanLine) {
  const chatId = message.chat.id;

  if (cmd === "/pin") {
    const msgId = message.reply_to_message?.message_id;
    if (!msgId) {
      await sendText(token, chatId, "Reply to a message with /pin to pin it.");
      return;
    }
    await tgApi(token, "pinChatMessage", { chat_id: chatId, message_id: msgId });
    await sendText(token, chatId, "Message pinned.");
    return;
  }

  if (cmd === "/unpin") {
    const msgId = message.reply_to_message?.message_id;
    const body = { chat_id: chatId };
    if (msgId) body.message_id = msgId;
    await tgApi(token, "unpinChatMessage", body);
    await sendText(token, chatId, "Message unpinned.");
    return;
  }

  if (cmd === "/filter") {
    const rest = cleanLine.replace(/^\/filter\s+/i, "");
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx <= 0) {
      await sendText(token, chatId, "Usage: /filter <keyword> <reply text>");
      return;
    }
    const trigger = rest.slice(0, spaceIdx).trim().toLowerCase();
    const reply = rest.slice(spaceIdx + 1).trim();
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    filters[trigger] = reply;
    await storeSet(`filters:${chatId}`, filters);
    await sendText(token, chatId, `Filter saved: "${trigger}"`);
    return;
  }

  if (cmd === "/filters") {
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    const keys = Object.keys(filters);
    await sendText(
      token,
      chatId,
      keys.length ? `Active filters:\n${keys.join(", ")}` : "No filters configured."
    );
    return;
  }

  if (cmd === "/stop") {
    const trigger = (parts[1] || "").toLowerCase();
    if (!trigger) {
      await sendText(token, chatId, "Usage: /stop <keyword>");
      return;
    }
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    delete filters[trigger];
    await storeSet(`filters:${chatId}`, filters);
    await sendText(token, chatId, `Filter removed: "${trigger}"`);
    return;
  }

  if (cmd === "/save") {
    const rest = cleanLine.replace(/^\/save\s+/i, "");
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx <= 0) {
      await sendText(token, chatId, "Usage: /save <note_name> <content>");
      return;
    }
    const noteName = rest.slice(0, spaceIdx).trim().toLowerCase();
    const content = rest.slice(spaceIdx + 1).trim();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    notes[noteName] = content;
    await storeSet(`notes:${chatId}`, notes);
    await sendText(token, chatId, `Note saved as #${noteName}`);
    return;
  }

  if (cmd === "/clear") {
    const noteName = (parts[1] || "").toLowerCase();
    if (!noteName) {
      await sendText(token, chatId, "Usage: /clear <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    delete notes[noteName];
    await storeSet(`notes:${chatId}`, notes);
    await sendText(token, chatId, `Note #${noteName} deleted.`);
    return;
  }

  const { targetId, restArgs } = resolveTarget(message, parts);
  if (!targetId) {
    await sendText(
      token,
      chatId,
      `Reply to a user's message with ${cmd} or use ${cmd} <user_id>.`
    );
    return;
  }

  if (cmd === "/ban" || cmd === "/tban") {
    const durationSec = cmd === "/tban" ? parseDuration(restArgs[0]) : null;
    const reasonParts = cmd === "/tban" && durationSec ? restArgs.slice(1) : restArgs;
    const reason = reasonParts.join(" ") || "No reason given";
    const body = { chat_id: chatId, user_id: targetId };
    if (durationSec) {
      body.until_date = Math.floor(Date.now() / 1000) + durationSec;
    }
    await tgApi(token, "banChatMember", body);
    await sendText(
      token,
      chatId,
      `User ${targetId} ${cmd === "/tban" ? "temporarily " : ""}banned.\nReason: ${reason}`
    );
    return;
  }

  if (cmd === "/unban") {
    await tgApi(token, "unbanChatMember", {
      chat_id: chatId,
      user_id: targetId,
      only_if_banned: true,
    });
    await sendText(token, chatId, `User ${targetId} unbanned.`);
    return;
  }

  if (cmd === "/kick") {
    const reason = restArgs.join(" ") || "No reason given";
    await tgApi(token, "banChatMember", { chat_id: chatId, user_id: targetId });
    await tgApi(token, "unbanChatMember", {
      chat_id: chatId,
      user_id: targetId,
      only_if_banned: true,
    });
    await sendText(token, chatId, `User ${targetId} kicked.\nReason: ${reason}`);
    return;
  }

  if (cmd === "/mute" || cmd === "/tmute") {
    const durationSec =
      cmd === "/tmute" ? parseDuration(restArgs[0]) ?? 600 : null;
    const reasonParts =
      cmd === "/tmute" && parseDuration(restArgs[0]) ? restArgs.slice(1) : restArgs;
    const reason = reasonParts.join(" ") || "No reason given";
    const body = {
      chat_id: chatId,
      user_id: targetId,
      permissions: { can_send_messages: false },
    };
    if (durationSec) {
      body.until_date = Math.floor(Date.now() / 1000) + durationSec;
    }
    await tgApi(token, "restrictChatMember", body);
    await sendText(
      token,
      chatId,
      `User ${targetId} muted${durationSec ? ` (${durationSec}s)` : ""}.\nReason: ${reason}`
    );
    return;
  }

  if (cmd === "/unmute") {
    await tgApi(token, "restrictChatMember", {
      chat_id: chatId,
      user_id: targetId,
      permissions: {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      },
    });
    await sendText(token, chatId, `User ${targetId} unmuted.`);
    return;
  }

  const warnKey = `warns:${chatId}:${targetId}`;
  const warns = (await storeGet(warnKey)) || [];

  if (cmd === "/warn") {
    const reason = restArgs.join(" ") || "Warning";
    warns.push({ reason, at: Date.now() });
    await storeSet(warnKey, warns);

    if (warns.length >= 3) {
      await tgApi(token, "banChatMember", { chat_id: chatId, user_id: targetId });
      await storeSet(warnKey, []);
      await sendText(
        token,
        chatId,
        `User ${targetId} banned after reaching 3/3 warnings.`
      );
      return;
    }

    await sendText(
      token,
      chatId,
      `Warning (${warns.length}/3) issued to ${targetId}.\nReason: ${reason}`
    );
    return;
  }

  if (cmd === "/warns") {
    if (!warns.length) {
      await sendText(token, chatId, `User ${targetId} has no warnings.`);
      return;
    }
    const list = warns.map((w, i) => `${i + 1}. ${w.reason}`).join("\n");
    await sendText(token, chatId, `Warnings for ${targetId} (${warns.length}/3):\n${list}`);
    return;
  }

  if (cmd === "/rmwarn") {
    warns.pop();
    await storeSet(warnKey, warns);
    await sendText(token, chatId, `Latest warning removed (${warns.length}/3).`);
    return;
  }

  if (cmd === "/resetwarn") {
    await storeSet(warnKey, []);
    await sendText(token, chatId, `All warnings cleared for user ${targetId}.`);
  }
}

function resolveTarget(message, parts) {
  const repliedId = message.reply_to_message?.from?.id;
  if (repliedId) {
    return { targetId: repliedId, restArgs: parts.slice(1) };
  }
  if (parts[1] && /^\d+$/.test(parts[1])) {
    return { targetId: Number(parts[1]), restArgs: parts.slice(2) };
  }
  return { targetId: null, restArgs: parts.slice(1) };
}

function parseDuration(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+)([smhdw])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return n * (mult[unit] || 0);
}

async function isAdmin(token, chatId, userId) {
  const data = await tgApi(token, "getChatMember", {
    chat_id: chatId,
    user_id: userId,
  });
  const status = data?.result?.status;
  return status === "creator" || status === "administrator";
}

async function sendText(token, chatId, text) {
  await tgApi(token, "sendMessage", {
    chat_id: chatId,
    text,
  });
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


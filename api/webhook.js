const BOT_NAME = "CricxCrate";
const memoryStore = new Map();

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send(`${BOT_NAME} webhook is running.`);
    }

    const token = (process.env.TELEGRAM_TOKEN || "").trim();
    const secret = (process.env.WEBHOOK_SECRET || "").trim();
    const logChatId = (process.env.LOG_CHAT_ID || "").trim();

    if (!token) {
      return res.status(200).json({ ok: true, error: "Missing TELEGRAM_TOKEN" });
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

    // 1. Notify if CricxCrate is banned, kicked, removed, demoted, or promoted
    if (update.my_chat_member) {
      await handleBotMembershipChange(update.my_chat_member, token, logChatId);
      return res.status(200).json({ ok: true });
    }

    // 2. Auto-approve channel / group join requests
    if (update.chat_join_request) {
      await handleJoinRequest(update.chat_join_request, token, logChatId);
      return res.status(200).json({ ok: true });
    }

    // 3. Inline menu buttons
    if (update.callback_query) {
      await handleCallback(update.callback_query, token);
      return res.status(200).json({ ok: true });
    }

    // 4. Messages & commands
    const message = update.message || update.edited_message;
    if (message?.chat?.id && typeof message.text === "string" && message.text.trim()) {
      await handleMessage(message, token);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`${BOT_NAME} top-level error:`, err);
    return res.status(200).json({ ok: true });
  }
}

// --- Storage (Upstash Redis if configured, else in-memory fallback) ---
function hasRedis() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function storeGet(key) {
  try {
    if (hasRedis()) {
      const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
      const data = await res.json().catch(() => ({}));
      if (typeof data?.result === "string") {
        return JSON.parse(data.result);
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
    if (hasRedis()) {
      const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
        key
      )}/${encodeURIComponent(JSON.stringify(value))}`;
      await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
    }
  } catch (err) {
    console.error("storeSet error:", err.message);
  }
}

// --- Bot Status Notification ---
async function handleBotMembershipChange(mcm, token, logChatId) {
  const chat = mcm.chat;
  const actor = mcm.from;
  const oldStatus = mcm.old_chat_member?.status;
  const newStatus = mcm.new_chat_member?.status;

  if (!chat?.id || oldStatus === newStatus) return;

  const title = chat.title || String(chat.id);
  const actorLabel = actor?.username
    ? `@${actor.username}`
    : actor?.first_name || actor?.id || "Admin";

  let alertMsg = "";
  if (newStatus === "kicked" || newStatus === "left") {
    const mode = newStatus === "kicked" ? "BANNED / KICKED" : "REMOVED / LEFT";
    alertMsg = `${BOT_NAME} Alert: Mujhe "${title}" (${chat.id}) se ${mode} kar diya gaya hai. By: ${actorLabel}.`;
  } else if (oldStatus === "administrator" && newStatus === "member") {
    alertMsg = `${BOT_NAME} Alert: "${title}" (${chat.id}) mein meri ADMIN power hata di gayi hai. By: ${actorLabel}.`;
  } else if (newStatus === "administrator") {
    alertMsg = `${BOT_NAME} Info: Mujhe "${title}" (${chat.id}) mein ADMIN bana diya gaya hai. By: ${actorLabel}.`;
  }

  if (!alertMsg) return;

  if (actor?.id) {
    await safeSend(token, actor.id, alertMsg);
  }
  if (logChatId) {
    await safeSend(token, logChatId, alertMsg);
  }
}

// --- Auto-Approve Channel / Group Join Requests ---
async function handleJoinRequest(joinReq, token, logChatId) {
  const chatId = joinReq.chat?.id;
  const userId = joinReq.from?.id;
  const title = joinReq.chat?.title || String(chatId);

  if (!chatId || !userId) return;

  try {
    await tgApi(token, "approveChatJoinRequest", {
      chat_id: chatId,
      user_id: userId,
    });
  } catch (err) {
    if (logChatId) {
      await safeSend(
        token,
        logChatId,
        `${BOT_NAME} auto-approve failed in "${title}" (${chatId}) for ${userId}: ${err.message}`
      );
    }
  }
}

// --- Inline Menu & Callbacks ---
function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Moderation & Pin", callback_data: "cc:mod" },
        { text: "Filters & Notes", callback_data: "cc:fn" },
      ],
      [
        { text: "Warnings", callback_data: "cc:warn" },
        { text: "Auto-Approve & Rights", callback_data: "cc:rights" },
      ],
    ],
  };
}

async function handleCallback(cq, token) {
  const chatId = cq.message?.chat?.id;
  const data = cq.data || "";

  const textMap = {
    "cc:mod": `${BOT_NAME} Moderation & Pin (Group mein):\n/pin (kisi message ke reply mein)\n/unpin (reply ya latest pin)\n/ban [@user|id|reply] [reason]\n/tban [@user|id|reply] 2d [reason]\n/unban [@user|id|reply]\n/mute [@user|id|reply] [reason]\n/tmute [@user|id|reply] 2h [reason]\n/unmute [@user|id|reply]\n/kick [@user|id|reply] [reason]`,
    "cc:fn": `${BOT_NAME} Filters & Notes (Group mein):\n/filter <word> <reply text>\n/filters\n/stop <word>\n/save <name> <content>\n/get <name> ya #<name>\n/notes\n/clear <name>`,
    "cc:warn": `${BOT_NAME} Warnings (3 warnings par auto-ban):\n/warn [@user|id|reply] [reason]\n/warns [@user|id|reply]\n/rmwarn [@user|id|reply]\n/resetwarn [@user|id|reply]`,
    "cc:rights": `${BOT_NAME} Auto-Approve & Rights:\n- Join request ke liye invite link mein Request Admin Approval ON rakhein aur bot ko Invite Users right dein.\n- Zaroori right na ho to bot batayega, aur ban/demote hone par notify karega.`,
  };

  await safeTgApi(token, "answerCallbackQuery", { callback_query_id: cq.id });
  if (chatId && textMap[data]) {
    await safeSend(token, chatId, textMap[data]);
  }
}

// --- Message & Command Handler ---
async function handleMessage(message, token) {
  const chatId = message.chat.id;
  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  const senderId = message.from?.id;

  // Normalize "/cmd@BotUsername" -> "/cmd" while preserving the rest of the text
  const rawText = message.text.trim();
  const normalizedText = rawText.replace(/^(\/[a-zA-Z0-9_]+)@[a-zA-Z0-9_]+/i, "$1");
  const parts = normalizedText.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    await safeSend(
      token,
      chatId,
      `${BOT_NAME} ready hai! Group mein /pin, /filter, /ban, /mute, /warn aur channel/group mein join request auto-approve active hain.`,
      mainKeyboard()
    );
    return;
  }

  if (cmd === "/id") {
    const replyId = message.reply_to_message?.from?.id;
    await safeSend(
      token,
      chatId,
      `Chat ID: ${chatId}\nYour ID: ${senderId ?? "N/A"}${replyId ? `\nReplied User ID: ${replyId}` : ""}`
    );
    return;
  }

  // Note shortcut: #notename
  if (/^#[a-zA-Z0-9_-]+$/.test(normalizedText)) {
    const noteName = normalizedText.slice(1).toLowerCase();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    if (notes[noteName]) {
      await safeSend(token, chatId, notes[noteName]);
    }
    return;
  }

  if (cmd === "/get") {
    const noteName = (parts[1] || "").toLowerCase();
    if (!noteName) {
      await safeSend(token, chatId, "Usage: /get <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    await safeSend(token, chatId, notes[noteName] || "Note nahi mila.");
    return;
  }

  if (cmd === "/notes") {
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    const keys = Object.keys(notes);
    await safeSend(
      token,
      chatId,
      keys.length ? `Saved notes:\n${keys.map((k) => `#${k}`).join(", ")}` : "Koi note saved nahi hai."
    );
    return;
  }

  const adminCommands = new Set([
    "/pin",
    "/unpin",
    "/filter",
    "/filters",
    "/stop",
    "/save",
    "/clear",
    "/ban",
    "/tban",
    "/unban",
    "/mute",
    "/tmute",
    "/unmute",
    "/kick",
    "/warn",
    "/warns",
    "/rmwarn",
    "/resetwarn",
  ]);

  if (adminCommands.has(cmd)) {
    if (!isGroup) {
      await safeSend(
        token,
        chatId,
        `${cmd} group ya supergroup mein use karein (DM mein nahi).`
      );
      return;
    }

    if (!senderId || !(await isChatAdmin(token, chatId, senderId))) {
      await safeSend(token, chatId, "Sirf group admins is command ko chala sakte hain.");
      return;
    }

    await runAdminCommand(message, token, cmd, parts, normalizedText);
    return;
  }

  // Trigger matching keyword filters in group messages
  if (isGroup) {
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    const lowerMsg = rawText.toLowerCase();
    for (const [keyword, replyText] of Object.entries(filters)) {
      if (keyword && lowerMsg.includes(keyword)) {
        await safeSend(token, chatId, replyText);
        break;
      }
    }
  }
}

// --- Bot Permission Check ---
async function checkBotPermission(token, chatId, requiredPerm) {
  try {
    const me = await tgApi(token, "getMe", {});
    const botId = me?.result?.id;
    if (!botId) {
      return { ok: false, message: `${BOT_NAME} bot ID check nahi ho paaya.` };
    }

    const memberRes = await tgApi(token, "getChatMember", {
      chat_id: chatId,
      user_id: botId,
    });
    const member = memberRes?.result;

    if (!member || (member.status !== "administrator" && member.status !== "creator")) {
      return {
        ok: false,
        message: `${BOT_NAME} ke paas is group mein ADMIN rights nahi hain. Pehle mujhe admin banayein.`,
      };
    }

    if (member.status === "creator") return { ok: true };

    if (requiredPerm && !member[requiredPerm]) {
      const permLabels = {
        can_pin_messages: "Pin Messages",
        can_restrict_members: "Ban / Restrict Members",
        can_invite_users: "Invite Users",
        can_delete_messages: "Delete Messages",
      };
      return {
        ok: false,
        message: `${BOT_NAME} ke paas "${permLabels[requiredPerm] || requiredPerm}" permission nahi hai.`,
      };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Permission check failed: ${err.message}` };
  }
}

// --- Admin Commands Execution ---
async function runAdminCommand(message, token, cmd, parts, cleanLine) {
  const chatId = message.chat.id;

  // 1. PIN & UNPIN
  if (cmd === "/pin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }

    const targetMsgId = message.reply_to_message?.message_id;
    if (!targetMsgId) {
      await safeSend(token, chatId, "Jis message ko pin karna hai, uske reply mein /pin bhejein.");
      return;
    }

    try {
      await tgApi(token, "pinChatMessage", {
        chat_id: chatId,
        message_id: targetMsgId,
        disable_notification: false,
      });
      await safeSend(token, chatId, "Message pin kar diya gaya.");
    } catch (err) {
      await safeSend(token, chatId, `Pin fail hua: ${err.message}`);
    }
    return;
  }

  if (cmd === "/unpin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }

    const targetMsgId = message.reply_to_message?.message_id;
    try {
      await tgApi(
        token,
        "unpinChatMessage",
        targetMsgId ? { chat_id: chatId, message_id: targetMsgId } : { chat_id: chatId }
      );
      await safeSend(token, chatId, "Message unpin kar diya gaya.");
    } catch (err) {
      await safeSend(token, chatId, `Unpin fail hua: ${err.message}`);
    }
    return;
  }

  // 2. FILTERS (/filter, /filters, /stop)
  if (cmd === "/filter") {
    const match = cleanLine.match(/^\/filter\s+(\S+)\s+([\s\S]+)$/i);
    if (!match) {
      await safeSend(token, chatId, "Usage: /filter <keyword> <reply text>");
      return;
    }

    const keyword = match[1].trim().toLowerCase();
    const replyText = match[2].trim();
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    filters[keyword] = replyText;
    await storeSet(`filters:${chatId}`, filters);
    await safeSend(token, chatId, `Filter save ho gaya: "${keyword}"`);
    return;
  }

  if (cmd === "/filters") {
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    const keys = Object.keys(filters);
    await safeSend(
      token,
      chatId,
      keys.length ? `Active filters:\n${keys.map((k) => `• ${k}`).join("\n")}` : "Koi filter set nahi hai."
    );
    return;
  }

  if (cmd === "/stop") {
    const keyword = (parts[1] || "").trim().toLowerCase();
    if (!keyword) {
      await safeSend(token, chatId, "Usage: /stop <keyword>");
      return;
    }
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    delete filters[keyword];
    await storeSet(`filters:${chatId}`, filters);
    await safeSend(token, chatId, `Filter remove ho gaya: "${keyword}"`);
    return;
  }

  // 3. NOTES (/save, /clear)
  if (cmd === "/save") {
    const match = cleanLine.match(/^\/save\s+([a-zA-Z0-9_-]+)\s+([\s\S]+)$/i);
    if (!match) {
      await safeSend(token, chatId, "Usage: /save <note_name> <content>");
      return;
    }
    const noteName = match[1].trim().toLowerCase();
    const content = match[2].trim();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    notes[noteName] = content;
    await storeSet(`notes:${chatId}`, notes);
    await safeSend(token, chatId, `Note save ho gaya: #${noteName}`);
    return;
  }

  if (cmd === "/clear") {
    const noteName = (parts[1] || "").trim().toLowerCase();
    if (!noteName) {
      await safeSend(token, chatId, "Usage: /clear <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    delete notes[noteName];
    await storeSet(`notes:${chatId}`, notes);
    await safeSend(token, chatId, `Note #${noteName} delete ho gaya.`);
    return;
  }

  // 4. USER MODERATION & WARNINGS
  const needsRestrictRight = new Set([
    "/ban",
    "/tban",
    "/unban",
    "/mute",
    "/tmute",
    "/unmute",
    "/kick",
    "/warn",
  ]);

  if (needsRestrictRight.has(cmd)) {
    const right = await checkBotPermission(token, chatId, "can_restrict_members");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
  }

  const target = await resolveTargetUser(token, message, parts);
  if (!target.id) {
    await safeSend(
      token,
      chatId,
      `User specify karein: kisi user ke message ke reply mein ${cmd} likhein, ya ${cmd} @username / ${cmd} <user_id> bhejein.`
    );
    return;
  }

  if (await isChatAdmin(token, chatId, target.id)) {
    await safeSend(
      token,
      chatId,
      `${target.label} group admin hai, main kisi admin par ${cmd} nahi kar sakta.`
    );
    return;
  }

  try {
    if (cmd === "/ban" || cmd === "/tban") {
      const durSec = cmd === "/tban" ? parseDurationSeconds(target.args[0]) : null;
      const reason = (durSec ? target.args.slice(1) : target.args).join(" ") || "No reason";
      const body = { chat_id: chatId, user_id: target.id };
      if (durSec) {
        body.until_date = Math.floor(Date.now() / 1000) + durSec;
      }
      await tgApi(token, "banChatMember", body);
      await safeSend(
        token,
        chatId,
        `${target.label} ${durSec ? "temporarily " : ""}banned.\nReason: ${reason}`
      );
      return;
    }

    if (cmd === "/unban") {
      await tgApi(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: target.id,
        only_if_banned: true,
      });
      await safeSend(token, chatId, `${target.label} unbanned.`);
      return;
    }

    if (cmd === "/kick") {
      const reason = target.args.join(" ") || "No reason";
      await tgApi(token, "banChatMember", { chat_id: chatId, user_id: target.id });
      await tgApi(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: target.id,
        only_if_banned: true,
      });
      await safeSend(token, chatId, `${target.label} kicked.\nReason: ${reason}`);
      return;
    }

    if (cmd === "/mute" || cmd === "/tmute") {
      const parsedDur = cmd === "/tmute" ? parseDurationSeconds(target.args[0]) : null;
      const durSec = cmd === "/tmute" ? parsedDur ?? 600 : null;
      const reason =
        (parsedDur ? target.args.slice(1) : target.args).join(" ") || "No reason";
      const body = {
        chat_id: chatId,
        user_id: target.id,
        permissions: { can_send_messages: false },
      };
      if (durSec) {
        body.until_date = Math.floor(Date.now() / 1000) + durSec;
      }
      await tgApi(token, "restrictChatMember", body);
      await safeSend(
        token,
        chatId,
        `${target.label} muted${durSec ? ` (${durSec}s)` : ""}.\nReason: ${reason}`
      );
      return;
    }

    if (cmd === "/unmute") {
      await tgApi(token, "restrictChatMember", {
        chat_id: chatId,
        user_id: target.id,
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
      await safeSend(token, chatId, `${target.label} unmuted.`);
      return;
    }

    // Warnings (3 warnings -> auto-ban)
    const warnKey = `warns:${chatId}:${target.id}`;
    const warns = (await storeGet(warnKey)) || [];

    if (cmd === "/warn") {
      const reason = target.args.join(" ") || "Warning";
      warns.push({ reason, at: Date.now() });
      await storeSet(warnKey, warns);

      if (warns.length >= 3) {
        await tgApi(token, "banChatMember", { chat_id: chatId, user_id: target.id });
        await storeSet(warnKey, []);
        await safeSend(
          token,
          chatId,
          `${target.label} ko 3/3 warnings poori hone par ban kar diya gaya.`
        );
        return;
      }

      await safeSend(
        token,
        chatId,
        `Warning (${warns.length}/3) given to ${target.label}.\nReason: ${reason}`
      );
      return;
    }

    if (cmd === "/warns") {
      if (!warns.length) {
        await safeSend(token, chatId, `${target.label} ke paas koi warning nahi hai.`);
        return;
      }
      const list = warns.map((w, idx) => `${idx + 1}. ${w.reason}`).join("\n");
      await safeSend(token, chatId, `Warnings for ${target.label} (${warns.length}/3):\n${list}`);
      return;
    }

    if (cmd === "/rmwarn") {
      warns.pop();
      await storeSet(warnKey, warns);
      await safeSend(token, chatId, `Latest warning removed (${warns.length}/3).`);
      return;
    }

    if (cmd === "/resetwarn") {
      await storeSet(warnKey, []);
      await safeSend(token, chatId, `${target.label} ki sabhi warnings reset kar di gayi.`);
    }
  } catch (err) {
    await safeSend(token, chatId, `Action failed: ${err.message}`);
  }
}

// --- Helpers ---
async function resolveTargetUser(token, message, parts) {
  const replied = message.reply_to_message?.from;
  if (replied?.id) {
    return {
      id: replied.id,
      label: replied.username ? `@${replied.username}` : `${replied.id}`,
      args: parts.slice(1),
    };
  }

  const firstArg = (parts[1] || "").trim();
  if (/^\d+$/.test(firstArg)) {
    return { id: Number(firstArg), label: firstArg, args: parts.slice(2) };
  }

  if (/^@[a-zA-Z0-9_]{3,}$/.test(firstArg)) {
    try {
      const chatRes = await tgApi(token, "getChat", { chat_id: firstArg });
      if (chatRes?.result?.id) {
        return { id: chatRes.result.id, label: firstArg, args: parts.slice(2) };
      }
    } catch {}
  }

  return { id: null, label: "", args: parts.slice(1) };
}

function parseDurationSeconds(raw) {
  const match = String(raw || "").trim().match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Number(match[1]) * mult[match[2].toLowerCase()];
}

async function isChatAdmin(token, chatId, userId) {
  try {
    const res = await tgApi(token, "getChatMember", { chat_id: chatId, user_id: userId });
    return res?.result?.status === "creator" || res?.result?.status === "administrator";
  } catch {
    return false;
  }
}

async function safeSend(token, chatId, text, replyMarkup) {
  try {
    const payload = { chat_id: chatId, text };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await tgApi(token, "sendMessage", payload);
  } catch (err) {
    console.error("safeSend failed:", err.message);
  }
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

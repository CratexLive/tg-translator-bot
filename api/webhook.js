const BOT_NAME = "CricxCrate";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send(`${BOT_NAME} webhook is live.`);
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

    if (update.my_chat_member) {
      await handleBotStatusChange(update.my_chat_member, token, logChatId);
      return res.status(200).json({ ok: true });
    }

    if (update.chat_join_request) {
      await handleJoinRequest(update.chat_join_request, token, logChatId);
      return res.status(200).json({ ok: true });
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query, token);
      return res.status(200).json({ ok: true });
    }

    const message = update.message || update.edited_message;
    if (message?.chat?.id && typeof message.text === "string" && message.text.trim()) {
      await handleMessage(message, token);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`${BOT_NAME} webhook error:`, err);
    return res.status(200).json({ ok: true });
  }
}

// --- Storage (Upstash Redis if configured, else in-memory fallback) ---
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

// --- Bot Status Alerts (Banned / Kicked / Demoted / Promoted) ---
async function handleBotStatusChange(mcm, token, logChatId) {
  const chat = mcm.chat;
  const actor = mcm.from;
  const oldStatus = mcm.old_chat_member?.status;
  const newStatus = mcm.new_chat_member?.status;

  if (!chat?.id || oldStatus === newStatus) return;

  const chatTitle = chat.title || String(chat.id);
  const actorName = actor?.username
    ? `@${actor.username}`
    : actor?.first_name || actor?.id || "Admin";

  let notice = "";

  if (newStatus === "kicked" || newStatus === "left") {
    const action = newStatus === "kicked" ? "BANNED / KICKED" : "REMOVED / LEFT";
    notice = `${BOT_NAME} Alert: Mujhe "${chatTitle}" (${chat.id}) se ${action} kar diya gaya hai. By: ${actorName}.`;
  } else if (oldStatus === "administrator" && newStatus === "member") {
    notice = `${BOT_NAME} Alert: "${chatTitle}" (${chat.id}) mein meri ADMIN power hata di gayi hai. By: ${actorName}.`;
  } else if (newStatus === "administrator") {
    notice = `${BOT_NAME} Info: Mujhe "${chatTitle}" (${chat.id}) mein ADMIN bana diya gaya hai. By: ${actorName}.`;
  }

  if (!notice) return;

  if (actor?.id) {
    await safeSendMessage(token, actor.id, notice);
  }
  if (logChatId) {
    await safeSendMessage(token, logChatId, notice);
  }
}

// --- Auto-Approve Join Requests ---
async function handleJoinRequest(joinReq, token, logChatId) {
  const chatId = joinReq.chat?.id;
  const userId = joinReq.from?.id;
  const chatTitle = joinReq.chat?.title || String(chatId);

  if (!chatId || !userId) return;

  try {
    await tgApi(token, "approveChatJoinRequest", {
      chat_id: chatId,
      user_id: userId,
    });
  } catch (err) {
    const msg = `${BOT_NAME} auto-approve failed in "${chatTitle}" (${chatId}) for user ${userId}: ${err.message}`;
    if (logChatId) {
      await safeSendMessage(token, logChatId, msg);
    }
  }
}

// --- Menu & Callbacks ---
function buildMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Moderation", callback_data: "cc:mod" },
        { text: "Warnings", callback_data: "cc:warn" },
      ],
      [
        { text: "Filters & Notes", callback_data: "cc:fn" },
        { text: "Auto-Approve & Rights", callback_data: "cc:rights" },
      ],
    ],
  };
}

async function handleCallback(cq, token) {
  const chatId = cq.message?.chat?.id;
  const data = cq.data || "";

  const guides = {
    "cc:mod": `${BOT_NAME} Moderation (reply, @username, ya user_id):\n/ban [@user|id|reply] [reason]\n/tban [@user|id|reply] 2d [reason]\n/unban [@user|id|reply]\n/mute [@user|id|reply] [reason]\n/tmute [@user|id|reply] 2h [reason]\n/unmute [@user|id|reply]\n/kick [@user|id|reply] [reason]\n/pin (reply)\n/unpin`,
    "cc:warn": `${BOT_NAME} Warnings (3 warnings par auto-ban):\n/warn [@user|id|reply] [reason]\n/warns [@user|id|reply]\n/rmwarn [@user|id|reply]\n/resetwarn [@user|id|reply]`,
    "cc:fn": `${BOT_NAME} Filters & Notes:\n/filter <keyword> <reply>\n/filters\n/stop <keyword>\n/save <name> <content>\n/get <name> ya #<name>\n/notes\n/clear <name>`,
    "cc:rights": `${BOT_NAME} Auto-Approve & Rights:\n- Channel/group invite link mein Request Admin Approval ON rakhein aur bot ko Invite Users right dein.\n- Zaroori right na ho to bot batayega, aur ban/demote hone par notify karega.`,
  };

  await safeTgApi(token, "answerCallbackQuery", { callback_query_id: cq.id });
  if (chatId && guides[data]) {
    await safeSendMessage(token, chatId, guides[data]);
  }
}

// --- Message Router ---
async function handleMessage(message, token) {
  const chatId = message.chat.id;
  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  const senderId = message.from?.id;
  const normalizedText = message.text.trim().replace(/^(\/[a-zA-Z0-9_]+)@\S+/, "$1");
  const parts = normalizedText.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    await safeSendMessage(
      token,
      chatId,
      `${BOT_NAME} ready hai! Group moderation, warnings, filters, notes aur channel/group auto-approve active hain.`,
      buildMenuKeyboard()
    );
    return;
  }

  if (cmd === "/id") {
    const repliedId = message.reply_to_message?.from?.id;
    await safeSendMessage(
      token,
      chatId,
      `Chat ID: ${chatId}\nYour ID: ${senderId ?? "N/A"}${repliedId ? `\nReplied User ID: ${repliedId}` : ""}`
    );
    return;
  }

  if (/^#[a-zA-Z0-9_-]+$/.test(normalizedText)) {
    const noteName = normalizedText.slice(1).toLowerCase();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    if (notes[noteName]) {
      await safeSendMessage(token, chatId, notes[noteName]);
    }
    return;
  }

  if (cmd === "/get") {
    const noteName = (parts[1] || "").toLowerCase();
    if (!noteName) {
      await safeSendMessage(token, chatId, "Usage: /get <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    await safeSendMessage(token, chatId, notes[noteName] || "Note nahi mila.");
    return;
  }

  if (cmd === "/notes") {
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    const keys = Object.keys(notes);
    await safeSendMessage(
      token,
      chatId,
      keys.length ? `Saved notes:\n${keys.map((k) => `#${k}`).join(", ")}` : "Koi note saved nahi hai."
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
    if (!isGroup) {
      await safeSendMessage(token, chatId, "Ye commands group ya supergroup mein chalate hain.");
      return;
    }

    if (!senderId || !(await isChatAdmin(token, chatId, senderId))) {
      await safeSendMessage(token, chatId, "Sirf group admins is command ka use kar sakte hain.");
      return;
    }

    await handleAdminCommand(message, token, cmd, parts, normalizedText);
    return;
  }

  if (isGroup) {
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    const lowerText = message.text.toLowerCase();
    for (const [trigger, reply] of Object.entries(filters)) {
      if (lowerText.includes(trigger)) {
        await safeSendMessage(token, chatId, reply);
        break;
      }
    }
  }
}

// --- Bot Permission Check ---
async function checkBotPermission(token, chatId, permField) {
  try {
    const me = await tgApi(token, "getMe", {});
    const botId = me?.result?.id;
    if (!botId) {
      return { ok: false, message: `${BOT_NAME} ki ID verify nahi ho paayi.` };
    }

    const memberRes = await tgApi(token, "getChatMember", {
      chat_id: chatId,
      user_id: botId,
    });
    const member = memberRes?.result;

    if (!member || (member.status !== "administrator" && member.status !== "creator")) {
      return {
        ok: false,
        message: `${BOT_NAME} ke paas is group mein ADMIN rights nahi hain. Pehle admin banayein.`,
      };
    }

    if (member.status === "creator") return { ok: true };

    if (permField && !member[permField]) {
      const labels = {
        can_restrict_members: "Ban / Restrict Members",
        can_pin_messages: "Pin Messages",
        can_invite_users: "Invite Users",
      };
      return {
        ok: false,
        message: `${BOT_NAME} ke paas "${labels[permField] || permField}" permission nahi hai.`,
      };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Permission check error: ${err.message}` };
  }
}

// --- Admin Commands ---
async function handleAdminCommand(message, token, cmd, parts, cleanLine) {
  const chatId = message.chat.id;

  if (cmd === "/pin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSendMessage(token, chatId, right.message);
      return;
    }
    const replyMsgId = message.reply_to_message?.message_id;
    if (!replyMsgId) {
      await safeSendMessage(token, chatId, "Jis message ko pin karna hai, uske reply mein /pin likhein.");
      return;
    }
    try {
      await tgApi(token, "pinChatMessage", { chat_id: chatId, message_id: replyMsgId });
      await safeSendMessage(token, chatId, "Message pin kar diya gaya.");
    } catch (err) {
      await safeSendMessage(token, chatId, `Pin failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/unpin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSendMessage(token, chatId, right.message);
      return;
    }
    const replyMsgId = message.reply_to_message?.message_id;
    try {
      await tgApi(
        token,
        "unpinChatMessage",
        replyMsgId ? { chat_id: chatId, message_id: replyMsgId } : { chat_id: chatId }
      );
      await safeSendMessage(token, chatId, "Message unpin kar diya gaya.");
    } catch (err) {
      await safeSendMessage(token, chatId, `Unpin failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/filter") {
    const rest = cleanLine.replace(/^\/filter\s+/i, "");
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx <= 0) {
      await safeSendMessage(token, chatId, "Usage: /filter <keyword> <reply text>");
      return;
    }
    const trigger = rest.slice(0, spaceIdx).trim().toLowerCase();
    const reply = rest.slice(spaceIdx + 1).trim();
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    filters[trigger] = reply;
    await storeSet(`filters:${chatId}`, filters);
    await safeSendMessage(token, chatId, `Filter saved: "${trigger}"`);
    return;
  }

  if (cmd === "/filters") {
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    const keys = Object.keys(filters);
    await safeSendMessage(
      token,
      chatId,
      keys.length ? `Active filters:\n${keys.join(", ")}` : "Koi filter set nahi hai."
    );
    return;
  }

  if (cmd === "/stop") {
    const trigger = (parts[1] || "").toLowerCase();
    if (!trigger) {
      await safeSendMessage(token, chatId, "Usage: /stop <keyword>");
      return;
    }
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    delete filters[trigger];
    await storeSet(`filters:${chatId}`, filters);
    await safeSendMessage(token, chatId, `Filter removed: "${trigger}"`);
    return;
  }

  if (cmd === "/save") {
    const rest = cleanLine.replace(/^\/save\s+/i, "");
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx <= 0) {
      await safeSendMessage(token, chatId, "Usage: /save <note_name> <content>");
      return;
    }
    const noteName = rest.slice(0, spaceIdx).trim().toLowerCase();
    const content = rest.slice(spaceIdx + 1).trim();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    notes[noteName] = content;
    await storeSet(`notes:${chatId}`, notes);
    await safeSendMessage(token, chatId, `Note saved as #${noteName}`);
    return;
  }

  if (cmd === "/clear") {
    const noteName = (parts[1] || "").toLowerCase();
    if (!noteName) {
      await safeSendMessage(token, chatId, "Usage: /clear <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    delete notes[noteName];
    await storeSet(`notes:${chatId}`, notes);
    await safeSendMessage(token, chatId, `Note #${noteName} delete kar diya gaya.`);
    return;
  }

  const needsRestrict = [
    "/ban",
    "/tban",
    "/unban",
    "/mute",
    "/tmute",
    "/unmute",
    "/kick",
    "/warn",
  ].includes(cmd);

  if (needsRestrict) {
    const right = await checkBotPermission(token, chatId, "can_restrict_members");
    if (!right.ok) {
      await safeSendMessage(token, chatId, right.message);
      return;
    }
  }

  const target = await resolveTarget(token, message, parts);
  if (!target.id) {
    await safeSendMessage(
      token,
      chatId,
      `Reply karein ya ${cmd} @username / ${cmd} <user_id> likhein.`
    );
    return;
  }

  if (await isChatAdmin(token, chatId, target.id)) {
    await safeSendMessage(
      token,
      chatId,
      `${target.label} ek admin hai, main kisi admin par ${cmd} nahi kar sakta.`
    );
    return;
  }

  try {
    if (cmd === "/ban" || cmd === "/tban") {
      const dur = cmd === "/tban" ? parseDurationSeconds(target.args[0]) : null;
      const reason = (dur ? target.args.slice(1) : target.args).join(" ") || "No reason";
      const payload = { chat_id: chatId, user_id: target.id };
      if (dur) payload.until_date = Math.floor(Date.now() / 1000) + dur;
      await tgApi(token, "banChatMember", payload);
      await safeSendMessage(
        token,
        chatId,
        `${target.label} ${dur ? "temporarily " : ""}banned. Reason: ${reason}`
      );
    } else if (cmd === "/unban") {
      await tgApi(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: target.id,
        only_if_banned: true,
      });
      await safeSendMessage(token, chatId, `${target.label} unbanned.`);
    } else if (cmd === "/kick") {
      const reason = target.args.join(" ") || "No reason";
      await tgApi(token, "banChatMember", { chat_id: chatId, user_id: target.id });
      await tgApi(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: target.id,
        only_if_banned: true,
      });
      await safeSendMessage(token, chatId, `${target.label} kicked. Reason: ${reason}`);
    } else if (cmd === "/mute" || cmd === "/tmute") {
      const parsed = cmd === "/tmute" ? parseDurationSeconds(target.args[0]) : null;
      const dur = cmd === "/tmute" ? parsed ?? 600 : null;
      const reason = (parsed ? target.args.slice(1) : target.args).join(" ") || "No reason";
      const payload = {
        chat_id: chatId,
        user_id: target.id,
        permissions: { can_send_messages: false },
      };
      if (dur) payload.until_date = Math.floor(Date.now() / 1000) + dur;
      await tgApi(token, "restrictChatMember", payload);
      await safeSendMessage(
        token,
        chatId,
        `${target.label} muted${dur ? ` (${dur}s)` : ""}. Reason: ${reason}`
      );
    } else if (cmd === "/unmute") {
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
      await safeSendMessage(token, chatId, `${target.label} unmuted.`);
    } else if (cmd === "/warn" || cmd === "/warns" || cmd === "/rmwarn" || cmd === "/resetwarn") {
      const warnKey = `warns:${chatId}:${target.id}`;
      const warns = (await storeGet(warnKey)) || [];

      if (cmd === "/warn") {
        const reason = target.args.join(" ") || "Warning";
        warns.push({ reason, at: Date.now() });
        await storeSet(warnKey, warns);

        if (warns.length >= 3) {
          await tgApi(token, "banChatMember", { chat_id: chatId, user_id: target.id });
          await storeSet(warnKey, []);
          await safeSendMessage(
            token,
            chatId,
            `${target.label} ko 3/3 warnings poori hone par ban kar diya gaya.`
          );
          return;
        }
        await safeSendMessage(
          token,
          chatId,
          `Warning (${warns.length}/3) given to ${target.label}.\nReason: ${reason}`
        );
      } else if (cmd === "/warns") {
        if (!warns.length) {
          await safeSendMessage(token, chatId, `${target.label} ke paas koi warning nahi hai.`);
          return;
        }
        const list = warns.map((w, i) => `${i + 1}. ${w.reason}`).join("\n");
        await safeSendMessage(token, chatId, `Warnings for ${target.label} (${warns.length}/3):\n${list}`);
      } else if (cmd === "/rmwarn") {
        warns.pop();
        await storeSet(warnKey, warns);
        await safeSendMessage(token, chatId, `Latest warning removed (${warns.length}/3).`);
      } else if (cmd === "/resetwarn") {
        await storeSet(warnKey, []);
        await safeSendMessage(token, chatId, `${target.label} ki warnings reset kar di gayi.`);
      }
    }
  } catch (err) {
    await safeSendMessage(token, chatId, `Action failed: ${err.message}`);
  }
}

async function resolveTarget(token, message, parts) {
  const rUser = message.reply_to_message?.from;
  if (rUser?.id) {
    return {
      id: rUser.id,
      label: rUser.username ? `@${rUser.username}` : `${rUser.id}`,
      args: parts.slice(1),
    };
  }

  const arg1 = (parts[1] || "").trim();
  if (/^\d+$/.test(arg1)) {
    return { id: Number(arg1), label: arg1, args: parts.slice(2) };
  }

  if (/^@[a-zA-Z0-9_]{3,}$/.test(arg1)) {
    try {
      const c = await tgApi(token, "getChat", { chat_id: arg1 });
      if (c?.result?.id) {
        return { id: c.result.id, label: arg1, args: parts.slice(2) };
      }
    } catch {}
  }

  return { id: null, label: "", args: parts.slice(1) };
}

function parseDurationSeconds(value) {
  const m = String(value || "").trim().match(/^(\d+)([smhdw])$/i);
  if (!m) return null;
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Number(m[1]) * mult[m[2].toLowerCase()];
}

async function isChatAdmin(token, chatId, userId) {
  try {
    const r = await tgApi(token, "getChatMember", { chat_id: chatId, user_id: userId });
    return r?.result?.status === "creator" || r?.result?.status === "administrator";
  } catch {
    return false;
  }
}

async function safeSendMessage(token, chatId, text, replyMarkup) {
  try {
    const body = { chat_id: chatId, text };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await tgApi(token, "sendMessage", body);
  } catch {}
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

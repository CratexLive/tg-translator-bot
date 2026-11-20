export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Telegram Group Manager Bot is live.");
  }

  const telegramToken = (process.env.TELEGRAM_TOKEN || "").trim();
  const webhookSecret = (process.env.WEBHOOK_SECRET || "").trim();
  const logChatId = (process.env.LOG_CHAT_ID || "").trim();

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
    // 1. Notify when the bot itself is banned, kicked, demoted, or added
    if (update.my_chat_member) {
      await handleBotMembershipUpdate(update.my_chat_member, telegramToken, logChatId);
      return res.status(200).json({ ok: true });
    }

    // 2. Auto-approve channel / group join requests
    if (update.chat_join_request) {
      await handleJoinRequest(update.chat_join_request, telegramToken, logChatId);
      return res.status(200).json({ ok: true });
    }

    // 3. Inline menu callbacks
    if (update.callback_query) {
      await handleCallback(update.callback_query, telegramToken);
      return res.status(200).json({ ok: true });
    }

    // 4. Messages & commands
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

// --- Bot Ban / Status Notification ---
async function handleBotMembershipUpdate(mcm, token, logChatId) {
  const chat = mcm.chat;
  const actor = mcm.from;
  const oldStatus = mcm.old_chat_member?.status;
  const newStatus = mcm.new_chat_member?.status;

  if (oldStatus === newStatus) return;

  const chatTitle = chat?.title || `Chat ${chat?.id}`;
  const actorName = actor?.username
    ? `@${actor.username}`
    : actor?.first_name || `User ${actor?.id || "Unknown"}`;

  let alertText = "";

  if (newStatus === "kicked" || newStatus === "left") {
    const actionWord = newStatus === "kicked" ? "BANNED / KICKED" : "REMOVED / LEFT";
    alertText = `Alert: Mujhe "${chatTitle}" (${chat?.id}) se ${actionWord} kar diya gaya hai.\nAction by: ${actorName} (${actor?.id || "N/A"})`;
  } else if (oldStatus === "administrator" && newStatus === "member") {
    alertText = `Alert: "${chatTitle}" (${chat?.id}) mein meri ADMIN power hata di gayi hai (ab main sirf normal member hoon).\nAction by: ${actorName} (${actor?.id || "N/A"})`;
  } else if (newStatus === "administrator") {
    const perms = mcm.new_chat_member;
    const rightsList = [
      perms.can_restrict_members ? "Ban/Mute" : null,
      perms.can_pin_messages ? "Pin" : null,
      perms.can_invite_users ? "Invite/Approve" : null,
      perms.can_delete_messages ? "Delete" : null,
    ]
      .filter(Boolean)
      .join(", ");

    alertText = `Info: Mujhe "${chatTitle}" (${chat?.id}) mein ADMIN bana diya gaya hai.\nRights: ${rightsList || "Basic admin"}`;
  }

  if (!alertText) return;

  // Notify actor in DM (if bot is banned from the group, group sendMessage will fail, so DM is essential)
  if (actor?.id) {
    await safeSendText(token, actor.id, alertText);
  }

  // Optional separate log channel/group
  if (logChatId) {
    await safeSendText(token, logChatId, alertText);
  }
}

// --- Auto-Approve Channel / Group Join Requests ---
async function handleJoinRequest(joinReq, token, logChatId) {
  const chatId = joinReq.chat?.id;
  const chatTitle = joinReq.chat?.title || `Chat ${chatId}`;
  const user = joinReq.from;
  const userId = user?.id;

  if (!chatId || !userId) return;

  try {
    await tgApi(token, "approveChatJoinRequest", {
      chat_id: chatId,
      user_id: userId,
    });
  } catch (err) {
    const msg = `Auto-approve failed in "${chatTitle}" (${chatId}) for user ${userId}: ${err.message}`;
    if (logChatId) {
      await safeSendText(token, logChatId, msg);
    }
  }
}

// --- Inline Help Menu ---
function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Moderation", callback_data: "help:mod" },
        { text: "Warnings", callback_data: "help:warn" },
      ],
      [
        { text: "Filters & Notes", callback_data: "help:fn" },
        { text: "Rights & Alerts", callback_data: "help:rights" },
      ],
    ],
  };
}

async function handleCallback(cq, token) {
  const chatId = cq.message?.chat?.id;
  const data = cq.data || "";

  const helpMap = {
    "help:mod":
      "Moderation (Reply, @username, ya user_id):\n/ban [@user|id|reply] [reason]\n/tban [@user|id|reply] 2d [reason]\n/unban [@user|id|reply]\n/mute [@user|id|reply] [reason]\n/tmute [@user|id|reply] 2h [reason]\n/unmute [@user|id|reply]\n/kick [@user|id|reply] [reason]\n/pin (reply)\n/unpin",
    "help:warn":
      "Warnings:\n/warn [@user|id|reply] [reason]\n/warns [@user|id|reply]\n/rmwarn [@user|id|reply]\n/resetwarn [@user|id|reply]\n(3 warnings par auto-ban)",
    "help:fn":
      "Filters & Notes:\n/filter <word> <reply>\n/filters\n/stop <word>\n/save <name> <content>\n/get <name> ya #<name>\n/notes\n/clear <name>",
    "help:rights":
      "Rights & Alerts:\n- Agar mere paas right nahi hoga to main batunga.\n- Agar main ban ya demote hua to notify karunga.\n- Join request ke liye Invite Users right zaroori hai.",
  };

  await tgApi(token, "answerCallbackQuery", {
    callback_query_id: cq.id,
    text: "Opened",
  });

  if (chatId && helpMap[data]) {
    await safeSendText(token, chatId, helpMap[data]);
  }
}

// --- Message Router ---
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
      text: "Group Manager Bot ready hai. Kisi bhi section ki detail ke liye button dabayein.",
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  if (cmd === "/id") {
    const lines = [`Chat ID: ${chatId}`, `Your ID: ${senderId ?? "N/A"}`];
    if (message.reply_to_message?.from?.id) {
      lines.push(`Replied User ID: ${message.reply_to_message.from.id}`);
    }
    await safeSendText(token, chatId, lines.join("\n"));
    return;
  }

  // Note shortcut: #notename
  if (/^#[a-zA-Z0-9_-]+$/.test(cleanLine)) {
    const noteName = cleanLine.slice(1).toLowerCase();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    if (notes[noteName]) {
      await safeSendText(token, chatId, notes[noteName]);
    }
    return;
  }

  if (cmd === "/get") {
    const noteName = (parts[1] || "").toLowerCase();
    if (!noteName) {
      await safeSendText(token, chatId, "Usage: /get <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    await safeSendText(token, chatId, notes[noteName] || "Note nahi mila.");
    return;
  }

  if (cmd === "/notes") {
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    const keys = Object.keys(notes);
    await safeSendText(
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
    if (chatType === "private") {
      await safeSendText(token, chatId, "Ye commands group ya supergroup ke liye hain.");
      return;
    }

    if (!senderId || !(await isUserAdmin(token, chatId, senderId))) {
      await safeSendText(token, chatId, "Sirf group admins is command ka use kar sakte hain.");
      return;
    }

    await handleAdminCommand(message, token, cmd, parts, cleanLine);
    return;
  }

  // Keyword filters in group
  if (chatType !== "private") {
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    const lowerText = rawText.toLowerCase();
    for (const [trigger, reply] of Object.entries(filters)) {
      if (lowerText.includes(trigger)) {
        await safeSendText(token, chatId, reply);
        break;
      }
    }
  }
}

// --- Bot Permission Verification ---
async function checkBotRight(token, chatId, requiredField) {
  const me = await tgApi(token, "getMe", {});
  const botId = me?.result?.id;
  if (!botId) {
    return { ok: false, reason: "Bot ki identity verify nahi ho paayi." };
  }

  const memberRes = await tgApi(token, "getChatMember", {
    chat_id: chatId,
    user_id: botId,
  });
  const member = memberRes?.result;

  if (!member || (member.status !== "administrator" && member.status !== "creator")) {
    return {
      ok: false,
      reason: "Mere paas is group mein ADMIN rights nahi hain. Pehle mujhe admin banayein.",
    };
  }

  if (member.status === "creator") {
    return { ok: true };
  }

  if (requiredField && !member[requiredField]) {
    const labelMap = {
      can_restrict_members: "Ban / Restrict Members",
      can_pin_messages: "Pin Messages",
      can_invite_users: "Invite Users / Join Requests",
      can_delete_messages: "Delete Messages",
    };
    const readable = labelMap[requiredField] || requiredField;
    return {
      ok: false,
      reason: `Mere paas "${readable}" permission nahi hai. Admin settings mein ye right ON karein.`,
    };
  }

  return { ok: true };
}

// --- Admin Command Handler ---
async function handleAdminCommand(message, token, cmd, parts, cleanLine) {
  const chatId = message.chat.id;

  if (cmd === "/pin") {
    const right = await checkBotRight(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSendText(token, chatId, right.reason);
      return;
    }

    const msgId = message.reply_to_message?.message_id;
    if (!msgId) {
      await safeSendText(token, chatId, "Jis message ko pin karna hai, uske reply mein /pin likhein.");
      return;
    }

    await tgApi(token, "pinChatMessage", { chat_id: chatId, message_id: msgId });
    await safeSendText(token, chatId, "Message pin kar diya gaya.");
    return;
  }

  if (cmd === "/unpin") {
    const right = await checkBotRight(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSendText(token, chatId, right.reason);
      return;
    }

    const msgId = message.reply_to_message?.message_id;
    const body = { chat_id: chatId };
    if (msgId) body.message_id = msgId;
    await tgApi(token, "unpinChatMessage", body);
    await safeSendText(token, chatId, "Message unpin kar diya gaya.");
    return;
  }

  // Filters & Notes
  if (cmd === "/filter") {
    const rest = cleanLine.replace(/^\/filter\s+/i, "");
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx <= 0) {
      await safeSendText(token, chatId, "Usage: /filter <keyword> <reply text>");
      return;
    }
    const trigger = rest.slice(0, spaceIdx).trim().toLowerCase();
    const reply = rest.slice(spaceIdx + 1).trim();
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    filters[trigger] = reply;
    await storeSet(`filters:${chatId}`, filters);
    await safeSendText(token, chatId, `Filter saved: "${trigger}"`);
    return;
  }

  if (cmd === "/filters") {
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    const keys = Object.keys(filters);
    await safeSendText(
      token,
      chatId,
      keys.length ? `Active filters:\n${keys.join(", ")}` : "Koi filter set nahi hai."
    );
    return;
  }

  if (cmd === "/stop") {
    const trigger = (parts[1] || "").toLowerCase();
    if (!trigger) {
      await safeSendText(token, chatId, "Usage: /stop <keyword>");
      return;
    }
    const filters = (await storeGet(`filters:${chatId}`)) || {};
    delete filters[trigger];
    await storeSet(`filters:${chatId}`, filters);
    await safeSendText(token, chatId, `Filter removed: "${trigger}"`);
    return;
  }

  if (cmd === "/save") {
    const rest = cleanLine.replace(/^\/save\s+/i, "");
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx <= 0) {
      await safeSendText(token, chatId, "Usage: /save <note_name> <content>");
      return;
    }
    const noteName = rest.slice(0, spaceIdx).trim().toLowerCase();
    const content = rest.slice(spaceIdx + 1).trim();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    notes[noteName] = content;
    await storeSet(`notes:${chatId}`, notes);
    await safeSendText(token, chatId, `Note saved as #${noteName}`);
    return;
  }

  if (cmd === "/clear") {
    const noteName = (parts[1] || "").toLowerCase();
    if (!noteName) {
      await safeSendText(token, chatId, "Usage: /clear <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    delete notes[noteName];
    await storeSet(`notes:${chatId}`, notes);
    await safeSendText(token, chatId, `Note #${noteName} deleted.`);
    return;
  }

  // Check bot restrict/ban permission before user moderation/warn actions
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
    const right = await checkBotRight(token, chatId, "can_restrict_members");
    if (!right.ok) {
      await safeSendText(token, chatId, right.reason);
      return;
    }
  }

  const { targetId, targetLabel, restArgs } = await resolveTarget(token, message, parts);
  if (!targetId) {
    await safeSendText(
      token,
      chatId,
      `User nahi mila. Kisi user ke message ke reply mein ${cmd} likhein, ya ${cmd} @username / ${cmd} <user_id> bhejein.`
    );
    return;
  }

  // Prevent acting on group admins/creator cleanly
  if (await isUserAdmin(token, chatId, targetId)) {
    await safeSendText(token, chatId, `${targetLabel} ek admin hai, main kisi admin par ${cmd} nahi kar sakta.`);
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

    try {
      await tgApi(token, "banChatMember", body);
      await safeSendText(
        token,
        chatId,
        `${targetLabel} ${cmd === "/tban" ? "temporarily " : ""}banned.\nReason: ${reason}`
      );
    } catch (err) {
      await safeSendText(token, chatId, `Ban nahi ho paya: ${err.message}`);
    }
    return;
  }

  if (cmd === "/unban") {
    try {
      await tgApi(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: targetId,
        only_if_banned: true,
      });
      await safeSendText(token, chatId, `${targetLabel} unbanned.`);
    } catch (err) {
      await safeSendText(token, chatId, `Unban nahi ho paya: ${err.message}`);
    }
    return;
  }

  if (cmd === "/kick") {
    const reason = restArgs.join(" ") || "No reason given";
    try {
      await tgApi(token, "banChatMember", { chat_id: chatId, user_id: targetId });
      await tgApi(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: targetId,
        only_if_banned: true,
      });
      await safeSendText(token, chatId, `${targetLabel} kicked.\nReason: ${reason}`);
    } catch (err) {
      await safeSendText(token, chatId, `Kick nahi ho paya: ${err.message}`);
    }
    return;
  }

  if (cmd === "/mute" || cmd === "/tmute") {
    const parsedDur = cmd === "/tmute" ? parseDuration(restArgs[0]) : null;
    const durationSec = cmd === "/tmute" ? parsedDur ?? 600 : null;
    const reasonParts = cmd === "/tmute" && parsedDur ? restArgs.slice(1) : restArgs;
    const reason = reasonParts.join(" ") || "No reason given";

    const body = {
      chat_id: chatId,
      user_id: targetId,
      permissions: { can_send_messages: false },
    };
    if (durationSec) {
      body.until_date = Math.floor(Date.now() / 1000) + durationSec;
    }

    try {
      await tgApi(token, "restrictChatMember", body);
      await safeSendText(
        token,
        chatId,
        `${targetLabel} muted${durationSec ? ` (${durationSec}s)` : ""}.\nReason: ${reason}`
      );
    } catch (err) {
      await safeSendText(token, chatId, `Mute nahi ho paya: ${err.message}`);
    }
    return;
  }

  if (cmd === "/unmute") {
    try {
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
      await safeSendText(token, chatId, `${targetLabel} unmuted.`);
    } catch (err) {
      await safeSendText(token, chatId, `Unmute nahi ho paya: ${err.message}`);
    }
    return;
  }

  // Warnings (limit = 3 -> auto-ban)
  const warnKey = `warns:${chatId}:${targetId}`;
  const warns = (await storeGet(warnKey)) || [];

  if (cmd === "/warn") {
    const reason = restArgs.join(" ") || "Warning";
    warns.push({ reason, at: Date.now() });
    await storeSet(warnKey, warns);

    if (warns.length >= 3) {
      try {
        await tgApi(token, "banChatMember", { chat_id: chatId, user_id: targetId });
        await storeSet(warnKey, []);
        await safeSendText(
          token,
          chatId,
          `${targetLabel} ko 3/3 warnings poori hone par ban kar diya gaya.`
        );
      } catch (err) {
        await safeSendText(
          token,
          chatId,
          `3/3 warnings ho gayi hain, lekin ban nahi ho paya: ${err.message}`
        );
      }
      return;
    }

    await safeSendText(
      token,
      chatId,
      `Warning (${warns.length}/3) given to ${targetLabel}.\nReason: ${reason}`
    );
    return;

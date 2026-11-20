export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Multi-feature Telegram bot webhook is live.");
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
    // 1. Auto-approve channel / group join requests
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

    // 2. Handle inline help menu buttons
    if (update.callback_query) {
      await handleCallback(update.callback_query, telegramToken);
      return res.status(200).json({ ok: true });
    }

    // 3. Handle messages and admin commands
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

function buildMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Admin Commands", callback_data: "menu:admin" },
        { text: "Auto-Approve", callback_data: "menu:approve" },
      ],
      [
        { text: "Moderation", callback_data: "menu:mod" },
        { text: "Pin & Info", callback_data: "menu:info" },
      ],
    ],
  };
}

async function handleCallback(cq, token) {
  const id = cq.id;
  const chatId = cq.message?.chat?.id;
  const data = cq.data || "";

  const texts = {
    "menu:admin":
      "Admin Commands (reply to user or pass user_id):\n/promote [user_id] — Admin banayein\n/demote [user_id] — Admin hatayein",
    "menu:approve":
      "Auto-Approve:\nChannel/group invite link mein 'Request Admin Approval' ON rakhein aur bot ko 'Invite Users' admin power dein.",
    "menu:mod":
      "Moderation Commands:\n/kick [user_id] — Group se nikalein\n/ban [user_id] — Permanently ban karein\n/unban [user_id] — Ban hatayein\n/mute [user_id] [10m|2h|1d] — Mute karein\n/unmute [user_id] — Unmute karein",
    "menu:info":
      "Pin & Info:\n/pin — Replied message pin karein\n/unpin — Pinned message unpin karein\n/id — Chat aur replied/sender ID dekhein",
  };

  await tgApi(token, "answerCallbackQuery", {
    callback_query_id: id,
    text: "Menu loaded",
  });

  if (chatId && texts[data]) {
    await sendText(token, chatId, texts[data]);
  }
}

async function handleMessage(message, token) {
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const senderId = message.from?.id;
  const rawText = (message.text || "").trim();

  if (!rawText) return;

  // Strip @botname if present in group commands like /kick@mybot
  const cleanCmdLine = rawText.replace(/^(\/[a-zA-Z0-9_]+)@\S+/, "$1");
  const parts = cleanCmdLine.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    await tgApi(token, "sendMessage", {
      chat_id: chatId,
      text: "Multi-Function Bot ready hai. Auto-approve active hai aur group mein admin moderation commands chal sakte hain.",
      reply_markup: buildMenuKeyboard(),
    });
    return;
  }

  if (cmd === "/id") {
    const replyUser = message.reply_to_message?.from;
    const lines = [
      `Chat ID: ${chatId}`,
      `Your ID: ${senderId ?? "N/A"}`,
    ];
    if (replyUser) {
      lines.push(`Replied User ID: ${replyUser.id}`);
    }
    await sendText(token, chatId, lines.join("\n"));
    return;
  }

  const adminCommands = [
    "/kick",
    "/ban",
    "/unban",
    "/mute",
    "/unmute",
    "/promote",
    "/demote",
    "/pin",
    "/unpin",
  ];

  if (!adminCommands.includes(cmd)) {
    return;
  }

  if (chatType === "private") {
    await sendText(token, chatId, "Ye moderation commands group ya supergroup mein kaam karte hain.");
    return;
  }

  if (!senderId) return;

  // Verify sender is admin or creator in the group
  const isSenderAdmin = await checkIsAdmin(token, chatId, senderId);
  if (!isSenderAdmin) {
    await sendText(token, chatId, "Sirf group admins is command ka use kar sakte hain.");
    return;
  }

  if (cmd === "/pin") {
    const targetMsgId = message.reply_to_message?.message_id;
    if (!targetMsgId) {
      await sendText(token, chatId, "Jis message ko pin karna hai, uske reply mein /pin likhein.");
      return;
    }
    await tgApi(token, "pinChatMessage", {
      chat_id: chatId,
      message_id: targetMsgId,
      disable_notification: false,
    });
    await sendText(token, chatId, "Message pin kar diya gaya.");
    return;
  }

  if (cmd === "/unpin") {
    const targetMsgId = message.reply_to_message?.message_id;
    const payload = { chat_id: chatId };
    if (targetMsgId) payload.message_id = targetMsgId;
    await tgApi(token, "unpinChatMessage", payload);
    await sendText(token, chatId, "Message unpin kar diya gaya.");
    return;
  }

  // Resolve target user from reply or argument
  const { userId: targetUserId, secondArg } = resolveTargetUser(message, parts);
  if (!targetUserId) {
    await sendText(
      token,
      chatId,
      `User specify karein: kisi user ke message ke reply mein ${cmd} likhein ya ${cmd} <user_id> bhejein.`
    );
    return;
  }

  if (cmd === "/kick") {
    // Ban then unban kicks the user without keeping them permanently banned
    await tgApi(token, "banChatMember", {
      chat_id: chatId,
      user_id: targetUserId,
    });
    await tgApi(token, "unbanChatMember", {
      chat_id: chatId,
      user_id: targetUserId,
      only_if_banned: true,
    });
    await sendText(token, chatId, `User ${targetUserId} ko group se kick kar diya gaya.`);
    return;
  }

  if (cmd === "/ban") {
    await tgApi(token, "banChatMember", {
      chat_id: chatId,
      user_id: targetUserId,
    });
    await sendText(token, chatId, `User ${targetUserId} ko ban kar diya gaya.`);
    return;
  }

  if (cmd === "/unban") {
    await tgApi(token, "unbanChatMember", {
      chat_id: chatId,
      user_id: targetUserId,
      only_if_banned: true,
    });
    await sendText(token, chatId, `User ${targetUserId} ka ban hata diya gaya.`);
    return;
  }

  if (cmd === "/mute") {
    const durationSec = parseDurationToSeconds(secondArg) ?? 600; // default 10 min
    const untilDate = Math.floor(Date.now() / 1000) + durationSec;

    await tgApi(token, "restrictChatMember", {
      chat_id: chatId,
      user_id: targetUserId,
      until_date: untilDate,
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
      },
    });
    await sendText(
      token,
      chatId,
      `User ${targetUserId} ko ${durationSec} seconds ke liye mute kar diya gaya.`
    );
    return;
  }

  if (cmd === "/unmute") {
    await tgApi(token, "restrictChatMember", {
      chat_id: chatId,
      user_id: targetUserId,
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
    await sendText(token, chatId, `User ${targetUserId} ko unmute kar diya gaya.`);
    return;
  }

  if (cmd === "/promote") {
    await tgApi(token, "promoteChatMember", {
      chat_id: chatId,
      user_id: targetUserId,
      can_manage_chat: true,
      can_delete_messages: true,
      can_restrict_members: true,
      can_invite_users: true,
      can_pin_messages: true,
      can_manage_topics: true,
    });
    await sendText(token, chatId, `User ${targetUserId} ko admin promote kar diya gaya.`);
    return;
  }

  if (cmd === "/demote") {
    await tgApi(token, "promoteChatMember", {
      chat_id: chatId,
      user_id: targetUserId,
      can_manage_chat: false,
      can_change_info: false,
      can_delete_messages: false,
      can_invite_users: false,
      can_restrict_members: false,
      can_pin_messages: false,
      can_manage_topics: false,
      can_promote_members: false,
    });
    await sendText(token, chatId, `User ${targetUserId} ki admin power hata di gayi.`);
  }
}

function resolveTargetUser(message, parts) {
  const repliedUserId = message.reply_to_message?.from?.id;
  if (repliedUserId) {
    return {
      userId: repliedUserId,
      secondArg: parts[1] || null,
    };
  }

  const arg1 = parts[1];
  if (arg1 && /^\d+$/.test(arg1)) {
    return {
      userId: Number(arg1),
      secondArg: parts[2] || null,
    };
  }

  return { userId: null, secondArg: null };
}

function parseDurationToSeconds(str) {
  if (!str) return null;
  const match = String(str).trim().match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const val = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "s") return val;
  if (unit === "m") return val * 60;
  if (unit === "h") return val * 3600;
  if (unit === "d") return val * 86400;
  return null;
}

async function checkIsAdmin(token, chatId, userId) {
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

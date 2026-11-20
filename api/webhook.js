export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send("Telegram Group Manager Bot webhook is live.");
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
    console.error("Unhandled webhook error:", err);
    return res.status(200).json({ ok: true });
  }
}

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
    notice = `Alert: I was ${action} from "${chatTitle}" (${chat.id}). Action by: ${actorName}.`;
  } else if (oldStatus === "administrator" && newStatus === "member") {
    notice = `Alert: My ADMIN rights were removed in "${chatTitle}" (${chat.id}). Action by: ${actorName}.`;
  } else if (newStatus === "administrator") {
    notice = `Info: I was promoted to ADMIN in "${chatTitle}" (${chat.id}). Action by: ${actorName}.`;
  }

  if (!notice) return;

  if (actor?.id) {
    await safeSendMessage(token, actor.id, notice);
  }
  if (logChatId) {
    await safeSendMessage(token, logChatId, notice);
  }
}

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
    const msg = `Auto-approve failed in "${chatTitle}" (${chatId}) for user ${userId}: ${err.message}`;
    if (logChatId) {
      await safeSendMessage(token, logChatId, msg);
    }
  }
}

async function handleCallback(cq, token) {
  const chatId = cq.message?.chat?.id;
  const guides = {
    "guide:mod":
      "Moderation Commands (reply, @username, or user_id):\n/ban [@user|id|reply] [reason]\n/tban [@user|id|reply] 2d [reason]\n/unban [@user|id|reply]\n/mute [@user|id|reply] [reason]\n/tmute [@user|id|reply] 2h [reason]\n/unmute [@user|id|reply]\n/kick [@user|id|reply] [reason]\n/pin (reply)\n/unpin",
    "guide:approve":
      "Auto-Approve Setup:\n1. Add the bot as an admin with Invite Users permission.\n2. Enable Request Admin Approval on your channel or group invite link.",
    "guide:rights":
      "Rights & Alerts:\n- I notify you if I lack admin rights or specific permissions.\n- I notify the acting user in DM (and LOG_CHAT_ID if set) if I am banned, kicked, or demoted.",
  };

  await safeTgApi(token, "answerCallbackQuery", { callback_query_id: cq.id });
  if (chatId && guides[cq.data]) {
    await safeSendMessage(token, chatId, guides[cq.data]);
  }
}

async function handleMessage(message, token) {
  const chatId = message.chat.id;
  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  const senderId = message.from?.id;
  const normalizedText = message.text.trim().replace(/^(\/[a-zA-Z0-9_]+)@\S+/, "$1");
  const parts = normalizedText.split(/\s+/);
  const command = parts[0].toLowerCase();

  if (command === "/start" || command === "/help") {
    await safeSendMessage(
      token,
      chatId,
      "Group Manager Bot is active. Use moderation commands in groups and auto-approve in channels or groups.",
      {
        inline_keyboard: [
          [
            { text: "Moderation", callback_data: "guide:mod" },
            { text: "Auto-Approve", callback_data: "guide:approve" },
          ],
          [{ text: "Rights & Alerts", callback_data: "guide:rights" }],
        ],
      }
    );
    return;
  }

  if (command === "/id") {
    const repliedId = message.reply_to_message?.from?.id;
    await safeSendMessage(
      token,
      chatId,
      `Chat ID: ${chatId}\nYour ID: ${senderId ?? "N/A"}${repliedId ? `\nReplied User ID: ${repliedId}` : ""}`
    );
    return;
  }

  const modCommands = [
    "/ban",
    "/tban",
    "/unban",
    "/mute",
    "/tmute",
    "/unmute",
    "/kick",
    "/pin",
    "/unpin",
  ];

  if (!modCommands.includes(command)) return;

  if (!isGroup) {
    await safeSendMessage(token, chatId, "Moderation commands only work in groups and supergroups.");
    return;
  }

  if (!senderId || !(await isChatAdmin(token, chatId, senderId))) {
    await safeSendMessage(token, chatId, "Only group administrators can run this command.");
    return;
  }

  const requiredPermission =
    command === "/pin" || command === "/unpin" ? "can_pin_messages" : "can_restrict_members";
  const rightCheck = await checkBotPermission(token, chatId, requiredPermission);
  if (!rightCheck.ok) {
    await safeSendMessage(token, chatId, rightCheck.message);
    return;
  }

  if (command === "/pin") {
    const replyMsgId = message.reply_to_message?.message_id;
    if (!replyMsgId) {
      await safeSendMessage(token, chatId, "Reply to the message you want to pin with /pin.");
      return;
    }
    try {
      await tgApi(token, "pinChatMessage", { chat_id: chatId, message_id: replyMsgId });
      await safeSendMessage(token, chatId, "Message pinned.");
    } catch (err) {
      await safeSendMessage(token, chatId, `Pin failed: ${err.message}`);
    }
    return;
  }

  if (command === "/unpin") {
    const replyMsgId = message.reply_to_message?.message_id;
    try {
      await tgApi(
        token,
        "unpinChatMessage",
        replyMsgId ? { chat_id: chatId, message_id: replyMsgId } : { chat_id: chatId }
      );
      await safeSendMessage(token, chatId, "Message unpinned.");
    } catch (err) {
      await safeSendMessage(token, chatId, `Unpin failed: ${err.message}`);
    }
    return;
  }

  const target = await resolveTarget(token, message, parts);
  if (!target.id) {
    await safeSendMessage(
      token,
      chatId,
      `Specify a target by replying to a message or using ${command} @username / ${command} <user_id>.`
    );
    return;
  }

  if (await isChatAdmin(token, chatId, target.id)) {
    await safeSendMessage(
      token,
      chatId,
      `${target.label} is an administrator; I cannot perform ${command} on an admin.`
    );
    return;
  }

  try {
    if (command === "/ban" || command === "/tban") {
      const durationSec = command === "/tban" ? parseDurationSeconds(target.args[0]) : null;
      const reason =
        (durationSec ? target.args.slice(1) : target.args).join(" ") || "No reason provided";
      const payload = { chat_id: chatId, user_id: target.id };
      if (durationSec) {
        payload.until_date = Math.floor(Date.now() / 1000) + durationSec;
      }
      await tgApi(token, "banChatMember", payload);
      await safeSendMessage(
        token,
        chatId,
        `${target.label} ${durationSec ? "temporarily " : ""}banned. Reason: ${reason}`
      );
    } else if (command === "/unban") {
      await tgApi(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: target.id,
        only_if_banned: true,
      });
      await safeSendMessage(token, chatId, `${target.label} unbanned.`);
    } else if (command === "/kick") {
      const reason = target.args.join(" ") || "No reason provided";
      await tgApi(token, "banChatMember", { chat_id: chatId, user_id: target.id });
      await tgApi(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: target.id,
        only_if_banned: true,
      });
      await safeSendMessage(token, chatId, `${target.label} kicked. Reason: ${reason}`);
    } else if (command === "/mute" || command === "/tmute") {
      const parsedDuration = command === "/tmute" ? parseDurationSeconds(target.args[0]) : null;
      const durationSec = command === "/tmute" ? parsedDuration ?? 600 : null;
      const reason =
        (parsedDuration ? target.args.slice(1) : target.args).join(" ") || "No reason provided";
      const payload = {
        chat_id: chatId,
        user_id: target.id,
        permissions: { can_send_messages: false },
      };
      if (durationSec) {
        payload.until_date = Math.floor(Date.now() / 1000) + durationSec;
      }
      await tgApi(token, "restrictChatMember", payload);
      await safeSendMessage(
        token,
        chatId,
        `${target.label} muted${durationSec ? ` (${durationSec}s)` : ""}. Reason: ${reason}`
      );
    } else if (command === "/unmute") {
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
    }
  } catch (err) {
    await safeSendMessage(token, chatId, `Action failed: ${err.message}`);
  }
}

async function checkBotPermission(token, chatId, permissionField) {
  try {
    const me = await tgApi(token, "getMe", {});
    const botId = me?.result?.id;
    if (!botId) {
      return { ok: false, message: "Could not verify bot account ID." };
    }

    const memberRes = await tgApi(token, "getChatMember", {
      chat_id: chatId,
      user_id: botId,
    });
    const member = memberRes?.result;

    if (!member || (member.status !== "administrator" && member.status !== "creator")) {
      return {
        ok: false,
        message: "I do not have ADMIN rights in this chat. Promote me to admin first.",
      };
    }

    if (member.status === "creator") {
      return { ok: true };
    }

    if (permissionField && !member[permissionField]) {
      const labels = {
        can_restrict_members: "Ban / Restrict Members",
        can_pin_messages: "Pin Messages",
        can_invite_users: "Invite Users",
      };
      return {
        ok: false,
        message: `I am missing the "${labels[permissionField] || permissionField}" permission.`,
      };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Permission check error: ${err.message}` };
  }
}

async function resolveTarget(token, message, parts) {
  const repliedUser = message.reply_to_message?.from;
  if (repliedUser?.id) {
    return {
      id: repliedUser.id,
      label: repliedUser.username ? `@${repliedUser.username}` : `${repliedUser.id}`,
      args: parts.slice(1),
    };
  }

  const arg1 = (parts[1] || "").trim();
  if (/^\d+$/.test(arg1)) {
    return { id: Number(arg1), label: arg1, args: parts.slice(2) };
  }

  if (/^@[a-zA-Z0-9_]{3,}$/.test(arg1)) {
    try {
      const chatRes = await tgApi(token, "getChat", { chat_id: arg1 });
      if (chatRes?.result?.id) {
        return { id: chatRes.result.id, label: arg1, args: parts.slice(2) };
      }
    } catch {}
  }

  return { id: null, label: "", args: parts.slice(1) };
}

function parseDurationSeconds(value) {
  const match = String(value || "").trim().match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Number(match[1]) * multipliers[match[2].toLowerCase()];
}

async function isChatAdmin(token, chatId, userId) {
  try {
    const res = await tgApi(token, "getChatMember", { chat_id: chatId, user_id: userId });
    return res?.result?.status === "creator" || res?.result?.status === "administrator";
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

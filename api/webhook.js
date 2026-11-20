export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const token = (process.env.TELEGRAM_TOKEN || "").trim();
  const secret = (process.env.WEBHOOK_SECRET || "").trim();
  const logChatId = (process.env.LOG_CHAT_ID || "").trim();

  if (!token) {
    return res.status(500).send("Missing TELEGRAM_TOKEN");
  }

  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).send("Unauthorized");
  }

  let update;
  try {
    update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).send("Bad JSON");
  }

  if (!update) {
    return res.status(200).json({ ok: true });
  }

  try {
    if (update.my_chat_member) {
      await onBotStatus(update.my_chat_member, token, logChatId);
      return res.status(200).json({ ok: true });
    }

    if (update.chat_join_request) {
      const jr = update.chat_join_request;
      if (jr.chat?.id && jr.from?.id) {
        try {
          await tg(token, "approveChatJoinRequest", {
            chat_id: jr.chat.id,
            user_id: jr.from.id,
          });
        } catch (err) {
          if (logChatId) {
            await safeSend(
              token,
              logChatId,
              `Auto-approve failed in ${jr.chat.id} for user ${jr.from.id}: ${err.message}`
            );
          }
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (update.callback_query) {
      await onCallback(update.callback_query, token);
      return res.status(200).json({ ok: true });
    }

    const msg = update.message || update.edited_message;
    if (msg?.chat?.id && msg?.text) {
      await onMessage(msg, token);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).json({ ok: true });
  }
}

async function onBotStatus(mcm, token, logChatId) {
  const chat = mcm.chat;
  const from = mcm.from;
  const prev = mcm.old_chat_member?.status;
  const curr = mcm.new_chat_member?.status;

  if (prev === curr) return;

  const title = chat?.title || chat?.id;
  const actor = from?.username
    ? `@${from.username}`
    : from?.first_name || from?.id || "Admin";

  let alert = "";

  if (curr === "kicked" || curr === "left") {
    const action = curr === "kicked" ? "BANNED / KICKED" : "REMOVED / LEFT";
    alert = `Alert: I was ${action} from "${title}" (${chat.id}) by ${actor}.`;
  } else if (prev === "administrator" && curr === "member") {
    alert = `Alert: My ADMIN permissions were removed in "${title}" (${chat.id}) by ${actor}.`;
  } else if (curr === "administrator") {
    alert = `Info: I was promoted to ADMIN in "${title}" (${chat.id}) by ${actor}.`;
  }

  if (!alert) return;

  if (from?.id) {
    await safeSend(token, from.id, alert);
  }
  if (logChatId) {
    await safeSend(token, logChatId, alert);
  }
}

async function onCallback(cq, token) {
  const chatId = cq.message?.chat?.id;
  const menuText = {
    "m:mod":
      "Group Moderation Commands:\n/ban [@user|id|reply] [reason]\n/tban [@user|id|reply] 2d [reason]\n/unban [@user|id|reply]\n/mute [@user|id|reply] [reason]\n/tmute [@user|id|reply] 2h [reason]\n/unmute [@user|id|reply]\n/kick [@user|id|reply] [reason]\n/pin (reply)\n/unpin",
    "m:approve":
      "Auto-Approve Setup:\n1. Make the bot an admin with Invite Users permission.\n2. Create an invite link with Request Admin Approval enabled.",
    "m:rights":
      "Permissions & Alerts:\n- I will notify you if I lack required admin rights.\n- I will notify you in DM (and LOG_CHAT_ID if set) if I am banned, kicked, or demoted.",
  };

  await tg(token, "answerCallbackQuery", { callback_query_id: cq.id });
  if (chatId && menuText[cq.data]) {
    await safeSend(token, chatId, menuText[cq.data]);
  }
}

async function onMessage(msg, token) {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const senderId = msg.from?.id;
  const cleanText = msg.text.trim().replace(/^(\/[a-zA-Z0-9_]+)@\S+/, "$1");
  const parts = cleanText.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: "Group Manager Bot is online. Use moderation commands in groups and auto-approve in channels or groups.",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Moderation", callback_data: "m:mod" },
            { text: "Auto-Approve", callback_data: "m:approve" },
          ],
          [{ text: "Rights & Alerts", callback_data: "m:rights" }],
        ],
      },
    });
    return;
  }

  if (cmd === "/id") {
    const replyId = msg.reply_to_message?.from?.id;
    await safeSend(
      token,
      chatId,
      `Chat ID: ${chatId}\nYour ID: ${senderId ?? "N/A"}${replyId ? `\nReplied User ID: ${replyId}` : ""}`
    );
    return;
  }

  const modCmds = [
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

  if (!modCmds.includes(cmd)) return;

  if (!isGroup) {
    await safeSend(token, chatId, "Moderation commands only work in groups and supergroups.");
    return;
  }

  if (!senderId || !(await checkMemberAdmin(token, chatId, senderId))) {
    await safeSend(token, chatId, "Only group administrators can use moderation commands.");
    return;
  }

  const neededRight =
    cmd === "/pin" || cmd === "/unpin" ? "can_pin_messages" : "can_restrict_members";
  const rightCheck = await checkBotRight(token, chatId, neededRight);
  if (!rightCheck.ok) {
    await safeSend(token, chatId, rightCheck.msg);
    return;
  }

  if (cmd === "/pin") {
    const replyId = msg.reply_to_message?.message_id;
    if (!replyId) {
      await safeSend(token, chatId, "Reply to the target message with /pin.");
      return;
    }
    await tg(token, "pinChatMessage", { chat_id: chatId, message_id: replyId });
    await safeSend(token, chatId, "Message pinned.");
    return;
  }

  if (cmd === "/unpin") {
    const replyId = msg.reply_to_message?.message_id;
    await tg(
      token,
      "unpinChatMessage",
      replyId ? { chat_id: chatId, message_id: replyId } : { chat_id: chatId }
    );
    await safeSend(token, chatId, "Message unpinned.");
    return;
  }

  const target = await getTarget(token, msg, parts);
  if (!target.id) {
    await safeSend(
      token,
      chatId,
      `Specify a user by replying to a message or using ${cmd} @username / ${cmd} <user_id>.`
    );
    return;
  }

  if (await checkMemberAdmin(token, chatId, target.id)) {
    await safeSend(
      token,
      chatId,
      `${target.label} is an administrator; I cannot run ${cmd} on an admin.`
    );
    return;
  }

  try {
    if (cmd === "/ban" || cmd === "/tban") {
      const dur = cmd === "/tban" ? parseSec(target.args[0]) : null;
      const reason = (dur ? target.args.slice(1) : target.args).join(" ") || "No reason";
      const body = { chat_id: chatId, user_id: target.id };
      if (dur) body.until_date = Math.floor(Date.now() / 1000) + dur;
      await tg(token, "banChatMember", body);
      await safeSend(
        token,
        chatId,
        `${target.label} ${dur ? "temporarily " : ""}banned. Reason: ${reason}`
      );
    } else if (cmd === "/unban") {
      await tg(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: target.id,
        only_if_banned: true,
      });
      await safeSend(token, chatId, `${target.label} unbanned.`);
    } else if (cmd === "/kick") {
      const reason = target.args.join(" ") || "No reason";
      await tg(token, "banChatMember", { chat_id: chatId, user_id: target.id });
      await tg(token, "unbanChatMember", {
        chat_id: chatId,
        user_id: target.id,
        only_if_banned: true,
      });
      await safeSend(token, chatId, `${target.label} kicked. Reason: ${reason}`);
    } else if (cmd === "/mute" || cmd === "/tmute") {
      const parsed = cmd === "/tmute" ? parseSec(target.args[0]) : null;
      const dur = cmd === "/tmute" ? parsed ?? 600 : null;
      const reason = (parsed ? target.args.slice(1) : target.args).join(" ") || "No reason";
      const body = {
        chat_id: chatId,
        user_id: target.id,
        permissions: { can_send_messages: false },
      };
      if (dur) body.until_date = Math.floor(Date.now() / 1000) + dur;
      await tg(token, "restrictChatMember", body);
      await safeSend(
        token,
        chatId,
        `${target.label} muted${dur ? ` (${dur}s)` : ""}. Reason: ${reason}`
      );
    } else if (cmd === "/unmute") {
      await tg(token, "restrictChatMember", {
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
    }
  } catch (err) {
    await safeSend(token, chatId, `Action failed: ${err.message}`);
  }
}

async function checkBotRight(token, chatId, permField) {
  const me = await tg(token, "getMe", {});
  const botId = me?.result?.id;
  if (!botId) return { ok: false, msg: "Unable to verify bot account." };

  const res = await tg(token, "getChatMember", { chat_id: chatId, user_id: botId });
  const m = res?.result;

  if (!m || (m.status !== "administrator" && m.status !== "creator")) {
    return {
      ok: false,
      msg: "I do not have ADMIN rights in this chat. Promote me to admin first.",
    };
  }

  if (m.status === "creator") return { ok: true };

  if (permField && !m[permField]) {
    const labels = {
      can_restrict_members: "Ban / Restrict Members",
      can_pin_messages: "Pin Messages",
      can_invite_users: "Invite Users",
    };
    return {
      ok: false,
      msg: `I am missing the "${labels[permField] || permField}" permission.`,
    };
  }

  return { ok: true };
}

async function getTarget(token, msg, parts) {
  const rUser = msg.reply_to_message?.from;
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
      const c = await tg(token, "getChat", { chat_id: arg1 });
      if (c?.result?.id) {
        return { id: c.result.id, label: arg1, args: parts.slice(2) };
      }
    } catch {}
  }

  return { id: null, label: "", args: parts.slice(1) };
}

function parseSec(v) {
  const m = String(v || "").trim().match(/^(\d+)([smhdw])$/i);
  if (!m) return null;
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Number(m[1]) * mult[m[2].toLowerCase()];
}

async function checkMemberAdmin(token, chatId, userId) {
  try {
    const r = await tg(token, "getChatMember", { chat_id: chatId, user_id: userId });
    return r?.result?.status === "creator" || r?.result?.status === "administrator";
  } catch {
    return false;
  }
}

async function safeSend(token, chatId, text) {
  try {
    await tg(token, "sendMessage", { chat_id: chatId, text });
  } catch {}
}

async function tg(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) {
    throw new Error(d?.description || `HTTP ${r.status}`);
  }
  return d;
}

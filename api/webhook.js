import crypto from "crypto";

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : "";
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "chat_join_request",
  "my_chat_member",
  "chat_member",
  "message_reaction"
];

const LOCK_TYPES = [
  "all", "album", "anonchannel", "audio", "bot", "botlink", "button",
  "cashtag", "checklist", "cjk", "collage", "command", "comment", "contact",
  "cyrillic", "document", "email", "emoji", "emojicustom", "emojigame",
  "emojionly", "externalreply", "forward", "forwardbot", "forwardchannel",
  "forwardstory", "forwarduser", "game", "gif", "guestbot", "inline",
  "invitelink", "location", "outsidereaction", "phone", "photo", "poll",
  "reaction", "richmessage", "rtl", "slideshow", "spoiler", "sticker",
  "stickeranimated", "stickerpremium", "text", "url", "video", "videonote",
  "voice", "widget", "zalgo"
];

const ALLOWLISTABLE_LOCKS = new Set([
  "anonchannel", "botlink", "cashtag", "command", "externalreply",
  "forward", "forwardbot", "forwardchannel", "forwardstory", "forwarduser",
  "guestbot", "inline", "invitelink", "sticker", "stickeranimated",
  "stickerpremium", "url"
]);

const PUNISHMENT_ACTIONS = new Set(["ban", "mute", "kick", "tban", "tmute"]);
const BLOCKLIST_ACTIONS = new Set(["nothing", "ban", "mute", "kick", "warn", "tban", "tmute"]);
const CLEAN_CMD_TYPES = new Set(["all", "admin", "user", "other"]);

const memoryStore = new Map();
const adminCache = new Map();
const floodState = new Map();
const purgeFromState = new Map();

function getDefaultChatConfig() {
  return {
    anonAdmin: false,
    adminError: true,
    flood: {
      limit: 0,
      timerCount: 0,
      timerSeconds: 0,
      action: "mute",
      durationSeconds: 0,
      clearFlood: false
    },
    approvedUsers: [],
    blocklists: [],
    blocklistMode: "nothing",
    blocklistDelete: true,
    blocklistReason: "",
    cleanCommands: [],
    locks: {},
    lockConfig: {},
    lockWarns: false,
    allowlist: [],
    filters: [],
    notes: {},
    greetings: {
      welcomeEnabled: false,
      goodbyeEnabled: false,
      welcomeText: "Welcome {first} to {chatname}!",
      goodbyeText: "Goodbye {first}!",
      cleanWelcome: false,
      lastWelcomeMsgId: null,
      lastWelcomeTs: 0
    },
    pin: {
      antiChannelPin: false,
      cleanLinked: false
    },
    rules: {
      text: "",
      privateRules: false,
      buttonText: "Rules"
    },
    warnings: {
      mode: "mute",
      limit: 3,
      timeSeconds: 0,
      durationSeconds: 0,
      users: {}
    }
  };
}

async function kvGet(key) {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result !== null && data.result !== undefined) {
        return typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      }
    }
  }
  return memoryStore.get(key) ?? null;
}

async function kvSet(key, value) {
  memoryStore.set(key, value);
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(JSON.stringify(value))
    });
  }
}

async function getChatConfig(chatId) {
  const key = `chat:${chatId}`;
  const existing = await kvGet(key);
  const base = getDefaultChatConfig();
  if (!existing) return base;
  return {
    ...base,
    ...existing,
    flood: { ...base.flood, ...(existing.flood || {}) },
    greetings: { ...base.greetings, ...(existing.greetings || {}) },
    pin: { ...base.pin, ...(existing.pin || {}) },
    rules: { ...base.rules, ...(existing.rules || {}) },
    warnings: { ...base.warnings, ...(existing.warnings || {}) }
  };
}

async function saveChatConfig(chatId, cfg) {
  await kvSet(`chat:${chatId}`, cfg);
}

async function tg(method, payload = {}) {
  if (!TELEGRAM_API) return null;
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

function parseBoolFlag(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (["yes", "on", "true", "1"].includes(v)) return true;
  if (["no", "off", "false", "0"].includes(v)) return false;
  return null;
}

function parseDuration(str) {
  if (!str) return null;
  const lower = str.toLowerCase();
  if (["off", "no", "none", "0"].includes(lower)) return 0;
  const m = lower.match(/^(\d+)([smhdw])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return n * mult[unit];
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardToRegex(pattern, allowSpaces = false) {
  let reStr = "^";
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      reStr += allowSpaces ? "[\\s\\S]*" : ".*";
      i++;
    } else if (pattern[i] === "*") {
      reStr += "\\S*";
    } else if (pattern[i] === "?") {
      reStr += "\\S";
    } else {
      reStr += escapeRegex(pattern[i]);
    }
  }
  reStr += "$";
  return new RegExp(reStr, "i");
}

function applyFillings(text, user, chat, extra = {}) {
  if (!text) return "";
  const first = user?.first_name || "User";
  const last = user?.last_name || "";
  const full = `${first}${last ? ` ${last}` : ""}`;
  const username = user?.username ? `@${user.username}` : full;
  const id = user?.id ?? "";
  const chatName = chat?.title || "Group";
  let out = text
    .replace(/\{first\}/g, first)
    .replace(/\{last\}/g, last)
    .replace(/\{fullname\}/g, full)
    .replace(/\{username\}/g, username)
    .replace(/\{id\}/g, String(id))
    .replace(/\{mention\}/g, id ? `<a href="tg://user?id=${id}">${escapeHtml(first)}</a>` : escapeHtml(first))
    .replace(/\{chatname\}/g, chatName);
  if (extra.rulesButton) {
    out = out.replace(/\{rules\}/g, extra.rulesButton);
  }
  return out;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractButtonsFromText(raw) {
  const buttons = [];
  const cleaned = raw.replace(/\[([^\]]+)\]\((buttonurl|buttonalert):\/\/([^)]+)\)/g, (_, label, kind, target) => {
    if (kind === "buttonurl") {
      const url = target.startsWith("http") || target.startsWith("https") || target.startsWith("t.me")
        ? (target.startsWith("t.me") ? `https://${target}` : target)
        : `https://${target}`;
      buttons.push([{ text: label.trim(), url }]);
    } else {
      buttons.push([{ text: label.trim(), callback_data: `alert:${target.slice(0, 55)}` }]);
    }
    return "";
  });
  return {
    text: cleaned.trim(),
    replyMarkup: buttons.length ? { inline_keyboard: buttons } : undefined
  };
}

async function getChatAdmins(chatId, force = false) {
  const now = Date.now();
  const cached = adminCache.get(chatId);
  if (!force && cached && now - cached.ts < 5 * 60 * 1000) {
    return cached.admins;
  }
  const res = await tg("getChatAdministrators", { chat_id: chatId });
  const admins = res?.ok && Array.isArray(res.result) ? res.result : [];
  adminCache.set(chatId, { ts: now, admins });
  return admins;
}

async function isUserAdmin(chatId, userId, senderChat = null, cfg = null) {
  if (senderChat && senderChat.id === chatId && cfg?.anonAdmin) {
    return true;
  }
  const admins = await getChatAdmins(chatId);
  return admins.some((a) => a.user?.id === userId);
}

async function hasBotPermission(chatId, perm) {
  const meRes = await tg("getMe");
  if (!meRes?.ok) return false;
  const botId = meRes.result.id;
  const memberRes = await tg("getChatMember", { chat_id: chatId, user_id: botId });
  if (!memberRes?.ok) return false;
  const m = memberRes.result;
  if (m.status === "administrator") {
    return Boolean(m[perm]);
  }
  return false;
}

async function resolveTargetUser(msg, args) {
  if (msg.reply_to_message?.from) {
    return { user: msg.reply_to_message.from, restArgs: args };
  }
  const first = args[0];
  if (!first) return { user: null, restArgs: args };
  if (/^\d+$/.test(first)) {
    const uid = parseInt(first, 10);
    const res = await tg("getChatMember", { chat_id: msg.chat.id, user_id: uid });
    return {
      user: res?.ok ? res.result.user : { id: uid, first_name: String(uid) },
      restArgs: args.slice(1)
    };
  }
  if (first.startsWith("@")) {
    const uname = first.slice(1).toLowerCase();
    const admins = await getChatAdmins(msg.chat.id);
    const found = admins.find((a) => a.user?.username?.toLowerCase() === uname);
    if (found) return { user: found.user, restArgs: args.slice(1) };
    const stored = await kvGet(`username:${uname}`);
    if (stored) return { user: stored, restArgs: args.slice(1) };
  }
  return { user: null, restArgs: args };
}

async function executePunishment(chatId, userId, action, durationSeconds = 0, reason = "") {
  const untilDate = durationSeconds > 0 ? Math.floor(Date.now() / 1000) + durationSeconds : undefined;
  if (action === "ban" || action === "tban") {
    const ok = await hasBotPermission(chatId, "can_restrict_members");
    if (!ok) return { ok: false, error: "I do not have permission to ban/restrict members in this chat." };
    await tg("banChatMember", { chat_id: chatId, user_id: userId, until_date: untilDate });
    return { ok: true };
  }
  if (action === "kick") {
    const ok = await hasBotPermission(chatId, "can_restrict_members");
    if (!ok) return { ok: false, error: "I do not have permission to kick/restrict members in this chat." };
    await tg("banChatMember", { chat_id: chatId, user_id: userId, until_date: Math.floor(Date.now() / 1000) + 35 });
    await tg("unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true });
    return { ok: true };
  }
  if (action === "mute" || action === "tmute") {
    const ok = await hasBotPermission(chatId, "can_restrict_members");
    if (!ok) return { ok: false, error: "I do not have permission to mute/restrict members in this chat." };
    await tg("restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
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
        can_add_web_page_previews: false
      }
    });
    return { ok: true };
  }
  return { ok: false, error: `Unknown punishment action: ${action}` };
}

async function unrestrictUser(chatId, userId, unban = false) {
  if (unban) {
    await tg("unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true });
  }
  await tg("restrictChatMember", {
    chat_id: chatId,
    user_id: userId,
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
      can_add_web_page_previews: true
    }
  });
}

async function addWarning(chatId, targetUser, reason, cfg, replyToMessageId = null) {
  const now = Date.now();
  const uid = String(targetUser.id);
  const wCfg = cfg.warnings;
  let userWarns = wCfg.users[uid] || [];
  if (wCfg.timeSeconds > 0) {
    userWarns = userWarns.filter((w) => now - w.ts < wCfg.timeSeconds * 1000);
  }
  userWarns.push({ reason: reason || "No reason", ts: now });
  wCfg.users[uid] = userWarns;
  await saveChatConfig(chatId, cfg);

  const count = userWarns.length;
  const limit = wCfg.limit || 3;
  const name = escapeHtml(targetUser.first_name || uid);
  if (count >= limit) {
    wCfg.users[uid] = [];
    await saveChatConfig(chatId, cfg);
    const res = await executePunishment(chatId, targetUser.id, wCfg.mode, wCfg.durationSeconds, reason);
    await tg("sendMessage", {
      chat_id: chatId,
      reply_to_message_id: replyToMessageId,
      parse_mode: "HTML",
      text: res.ok
        ? `User ${name} reached ${limit}/${limit} warnings and has been punished (${wCfg.mode}).`
        : `User ${name} reached ${limit}/${limit} warnings, but punishment failed: ${escapeHtml(res.error)}`
    });
  } else {
    await tg("sendMessage", {
      chat_id: chatId,
      reply_to_message_id: replyToMessageId,
      parse_mode: "HTML",
      text: `Warning ${count}/${limit} for ${name}${reason ? `\nReason: ${escapeHtml(reason)}` : ""}.`
    });
  }
}

function detectLockMatches(msg) {
  const matches = new Set();
  const text = msg.text || msg.caption || "";
  const entities = msg.entities || msg.caption_entities || [];

  matches.add("all");
  if (msg.media_group_id) matches.add("album");
  if (msg.sender_chat && msg.sender_chat.id === msg.chat.id) matches.add("anonchannel");
  if (msg.audio) matches.add("audio");
  if (msg.new_chat_members?.some((m) => m.is_bot)) matches.add("bot");
  if (msg.reply_markup?.inline_keyboard) matches.add("button");
  if (msg.checklist) matches.add("checklist");
  if (msg.contact) matches.add("contact");
  if (msg.document) matches.add("document");
  if (msg.game) matches.add("game");
  if (msg.animation) matches.add("gif");
  if (msg.via_bot) matches.add("inline");
  if (msg.location || msg.venue) matches.add("location");
  if (msg.photo) matches.add("photo");
  if (msg.poll) matches.add("poll");
  if (msg.story) matches.add("forwardstory");
  if (msg.video) matches.add("video");
  if (msg.video_note) matches.add("videonote");
  if (msg.voice) matches.add("voice");
  if (msg.web_app_data) matches.add("widget");

  if (msg.external_reply) matches.add("externalreply");
  if (msg.forward_origin) {
    matches.add("forward");
    const t = msg.forward_origin.type;
    if (t === "user" || t === "hidden_user") matches.add("forwarduser");
    else if (t === "channel") matches.add("forwardchannel");
    else if (t === "chat") matches.add("forwardchannel");
  }

  if (text) {
    matches.add("text");
    if (/^\s*\//.test(text)) matches.add("command");
    if (/\s\$[A-Z]{1,10}\b|^\$[A-Z]{1,10}\b/.test(text)) matches.add("cashtag");
    if (/(?:https?:\/\/|t\.me\/|@\w*bot\b)/i.test(text)) {
      if (/(?:t\.me\/[a-zA-Z0-9_]+bot|@\w*bot\b)/i.test(text)) matches.add("botlink");
      if (/(?:https?:\/\/)?(?:t\.me\/(?:\+|joinchat\/|[a-zA-Z0-9_]+)|telegram\.me\/)/i.test(text)) {
        matches.add("invitelink");
      }
      if (/https?:\/\/\S+/i.test(text)) matches.add("url");
    }
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(text)) {
      matches.add("cjk");
    }
    if (/[\u0400-\u04ff]/.test(text)) matches.add("cyrillic");
    if (/[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f]/.test(text)) matches.add("rtl");
    if (/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3,}/.test(text)) {
      matches.add("zalgo");
    }
    const emojiRegex = /\p{Extended_Pictographic}/gu;
    const emojiMatches = text.match(emojiRegex);
    if (emojiMatches && emojiMatches.length > 0) matches.add("emoji");
    const stripped = text.replace(/\p{Extended_Pictographic}/gu, "").replace(/[\s\u200d\ufe0f]/g, "");
    if (emojiMatches && emojiMatches.length > 0 && stripped.length === 0) matches.add("emojionly");
  }

  for (const ent of entities) {
    if (ent.type === "url" || ent.type === "text_link") matches.add("url");
    if (ent.type === "email") matches.add("email");
    if (ent.type === "phone_number") matches.add("phone");
    if (ent.type === "bot_command") matches.add("command");
    if (ent.type === "custom_emoji") {
      matches.add("emojicustom");
      matches.add("emoji");
    }
    if (ent.type === "spoiler") matches.add("spoiler");
  }

  if (msg.dice) {
    matches.add("emojigame");
    matches.add("emoji");
  }

  if (msg.sticker) {
    matches.add("sticker");
    if (msg.sticker.is_animated || msg.sticker.is_video) matches.add("stickeranimated");
    if (msg.sticker.premium_animation) matches.add("stickerpremium");
  }

  return matches;
}

function isAllowlisted(msg, cfg) {
  const list = cfg.allowlist || [];
  if (!list.length) return false;
  const text = `${msg.text || ""} ${msg.caption || ""}`;
  const fwdChat = msg.forward_origin?.chat;
  const fwdUser = msg.forward_origin?.sender_user;
  const stickerSet = msg.sticker?.set_name;
  const customEmojis = (msg.entities || msg.caption_entities || [])
    .filter((e) => e.type === "custom_emoji")
    .map((e) => e.custom_emoji_id);

  for (const item of list) {
    const low = item.toLowerCase();
    if (text.toLowerCase().includes(low)) return true;
    if (fwdChat && (String(fwdChat.id) === item || (fwdChat.username && `@${fwdChat.username.toLowerCase()}` === low))) {
      return true;
    }
    if (fwdUser && String(fwdUser.id) === item) return true;
    if (stickerSet && low.includes(stickerSet.toLowerCase())) return true;
    if (low.startsWith("emojipack:") && customEmojis.length > 0) return true;
  }
  return false;
}

function isApproved(userId, cfg) {
  return Array.isArray(cfg.approvedUsers) && cfg.approvedUsers.includes(userId);
}

function matchBlocklistTrigger(trigger, text) {
  if (!text) return false;
  const quoted = trigger.match(/^"(.*)"$/);
  if (quoted) {
    const regex = wildcardToRegex(quoted[1], true);
    return regex.test(text);
  }
  const regex = wildcardToRegex(trigger, false);
  const tokens = text.split(/\s+/);
  return tokens.some((tok) => regex.test(tok));
}

function matchFilterTrigger(triggerRaw, text, isAdmin, isBot) {
  let trig = triggerRaw.trim();
  let mode = "contains";
  if (/^exact:/i.test(trig)) {
    mode = "exact";
    trig = trig.slice(6);
  } else if (/^prefix:/i.test(trig)) {
    mode = "prefix";
    trig = trig.slice(7);
  }
  if (trig.startsWith('"') && trig.endsWith('"') && trig.length >= 2) {
    trig = trig.slice(1, -1);
  }
  const lowerText = text.toLowerCase();
  const lowerTrig = trig.toLowerCase();
  if (mode === "exact") return lowerText === lowerTrig;
  if (mode === "prefix") return lowerText.startsWith(lowerTrig);
  const re = new RegExp(`(^|\\b)${escapeRegex(lowerTrig)}(\\b|$)`, "i");
  return re.test(lowerText);
}

function parseFilterInput(rawArgsText) {
  let triggers = [];
  let rest = "";
  const multiMatch = rawArgsText.match(/^\(([^)]+)\)\s*([\s\S]*)$/);
  if (multiMatch) {
    triggers = multiMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    rest = multiMatch[2] || "";
  } else {
    const quoteMatch = rawArgsText.match(/^("[^"]+")\s*([\s\S]*)$/);
    if (quoteMatch) {
      triggers = [quoteMatch[1]];
      rest = quoteMatch[2] || "";
    } else {
      const spaceIdx = rawArgsText.indexOf(" ");
      if (spaceIdx === -1) {
        triggers = [rawArgsText.trim()];
        rest = "";
      } else {
        triggers = [rawArgsText.slice(0, spaceIdx).trim()];
        rest = rawArgsText.slice(spaceIdx + 1);
      }
    }
  }
  return { triggers: triggers.filter(Boolean), content: rest };
}

async function sendFilterOrNoteResponse(chatId, msg, rawContent, isNoFormat = false, isForce = false) {
  let content = rawContent;
  const hasAdminFlag = /\{admin\}/i.test(content);
  const hasUserFlag = /\{user\}/i.test(content);
  const hasProtect = /\{protect\}/i.test(content);
  const hasReplyTag = /\{replytag\}/i.test(content);

  const senderIsAdmin = await isUserAdmin(chatId, msg.from?.id, msg.sender_chat);
  if (!isForce) {
    if (hasAdminFlag && !senderIsAdmin) return false;
    if (hasUserFlag && senderIsAdmin) return false;
  }

  const variants = content.split(/\n%%%\n/);
  let chosen = variants[Math.floor(Math.random() * variants.length)];

  if (!isForce) {
    if (/\{admin\}/i.test(chosen) && !senderIsAdmin) return false;
    if (/\{user\}/i.test(chosen) && senderIsAdmin) return false;
  }

  chosen = chosen
    .replace(/\{admin\}/gi, "")
    .replace(/\{user\}/gi, "")
    .replace(/\{allow_bot\}/gi, "")
    .replace(/\{protect\}/gi, "")
    .replace(/\{replytag\}/gi, "")
    .trim();

  if (isNoFormat) {
    await tg("sendMessage", {
      chat_id: chatId,
      reply_to_message_id: msg.message_id,
      text: chosen
    });
    return true;
  }

  const filled = applyFillings(chosen, msg.from, msg.chat);
  const { text, replyMarkup } = extractButtonsFromText(filled);
  const replyToId = hasReplyTag && msg.reply_to_message
    ? msg.reply_to_message.message_id
    : msg.message_id;

  await tg("sendMessage", {
    chat_id: chatId,
    reply_to_message_id: replyToId,
    parse_mode: "HTML",
    text: text || " ",
    protect_content: hasProtect,
    reply_markup: replyMarkup
  });
  return true;
}

async function handleChatMemberUpdate(update) {
  const cm = update.my_chat_member;
  if (!cm) return;
  const chatId = cm.chat.id;
  const newStatus = cm.new_chat_member?.status;
  const oldStatus = cm.old_chat_member?.status;
  const actor = cm.from;

  if (newStatus === "kicked" || newStatus === "left") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `Bot status changed from ${oldStatus} to ${newStatus}${actor ? ` by ${actor.first_name} (${actor.id})` : ""}.`
    });
  } else if (oldStatus === "administrator" && newStatus !== "administrator") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `Bot was demoted from administrator${actor ? ` by ${actor.first_name}` : ""}.`
    });
  } else if (newStatus === "administrator" && oldStatus !== "administrator") {
    adminCache.delete(chatId);
    await tg("sendMessage", {
      chat_id: chatId,
      text: `Bot was promoted to administrator${actor ? ` by ${actor.first_name}` : ""}.`
    });
  }
}

async function handleJoinRequest(req) {
  const chatId = req.chat.id;
  const userId = req.from.id;
  const ok = await hasBotPermission(chatId, "can_invite_users");
  if (ok) {
    await tg("approveChatJoinRequest", { chat_id: chatId, user_id: userId });
  }
}

async function handleMessage(msg) {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === "private";
  const sender = msg.from;

  if (sender?.username) {
    await kvSet(`username:${sender.username.toLowerCase()}`, {
      id: sender.id,
      first_name: sender.first_name,
      last_name: sender.last_name,
      username: sender.username
    });
  }

  if (isPrivate) {
    const txt = (msg.text || "").trim();
    if (txt.startsWith("/start")) {
      const parts = txt.split(/\s+/);
      if (parts[1] && parts[1].startsWith("rules_")) {
        const targetChatId = parts[1].slice(6);
        const targetCfg = await getChatConfig(targetChatId);
        await tg("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: targetCfg.rules.text ? applyFillings(targetCfg.rules.text, sender, { title: "Group" }) : "No rules set for this chat."
        });
        return;
      }
      await tg("sendMessage", {
        chat_id: chatId,
        text: "CricxCrate group management bot is active. Add me to a group and grant admin permissions."
      });
    }
    return;
  }

  const cfg = await getChatConfig(chatId);

  if (msg.new_chat_members && msg.new_chat_members.length > 0) {
    if (cfg.greetings.welcomeEnabled) {
      if (cfg.greetings.cleanWelcome && cfg.greetings.lastWelcomeMsgId) {
        await tg("deleteMessage", { chat_id: chatId, message_id: cfg.greetings.lastWelcomeMsgId });
      }
      for (const member of msg.new_chat_members) {
        const filled = applyFillings(cfg.greetings.welcomeText, member, msg.chat, {
          rulesButton: cfg.rules.buttonText
        });
        const { text, replyMarkup } = extractButtonsFromText(filled);
        const sent = await tg("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: text || `Welcome ${escapeHtml(member.first_name)}!`,
          reply_markup: replyMarkup
        });
        if (sent?.ok) {
          cfg.greetings.lastWelcomeMsgId = sent.result.message_id;
          cfg.greetings.lastWelcomeTs = Date.now();
          await saveChatConfig(chatId, cfg);
        }
      }
    }
    return;
  }

  if (msg.left_chat_member) {
    if (cfg.greetings.goodbyeEnabled) {
      const filled = applyFillings(cfg.greetings.goodbyeText, msg.left_chat_member, msg.chat, {
        rulesButton: cfg.rules.buttonText
      });
      const { text, replyMarkup } = extractButtonsFromText(filled);
      await tg("sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text: text || `Goodbye ${escapeHtml(msg.left_chat_member.first_name)}!`,
        reply_markup: replyMarkup
      });
    }
    return;
  }

  if (msg.pinned_message && cfg.pin.antiChannelPin && msg.pinned_message.sender_chat?.id === chatId) {
    await tg("unpinChatMessage", { chat_id: chatId, message_id: msg.pinned_message.message_id });
    return;
  }

  if (msg.sender_chat && msg.sender_chat.id === chatId && cfg.pin.cleanLinked && !msg.from) {
    await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
    return;
  }

  const userId = sender?.id;
  const userIsAdmin = userId ? await isUserAdmin(chatId, userId, msg.sender_chat, cfg) : false;
  const userIsApproved = userId ? isApproved(userId, cfg) : false;
  const rawText = msg.text || msg.caption || "";

  if (cfg.greetings.cleanWelcome && cfg.greetings.lastWelcomeMsgId && cfg.greetings.lastWelcomeTs) {
    if (Date.now() - cfg.greetings.lastWelcomeTs >= 5 * 60 * 1000) {
      await tg("deleteMessage", { chat_id: chatId, message_id: cfg.greetings.lastWelcomeMsgId });
      cfg.greetings.lastWelcomeMsgId = null;
      cfg.greetings.lastWelcomeTs = 0;
      await saveChatConfig(chatId, cfg);
    }
  }

  const cmdMatch = rawText.trim().match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]*))?$/);
  const cmdName = cmdMatch ? cmdMatch[1].toLowerCase() : null;
  const cmdArgsStr = cmdMatch ? (cmdMatch[2] || "").trim() : "";
  const cmdArgs = cmdArgsStr ? cmdArgsStr.split(/\s+/) : [];

  if (cmdName && cfg.cleanCommands.length > 0) {
    const knownCmds = new Set([
      "promote", "demote", "adminlist", "admincache", "anonadmin", "adminerror",
      "flood", "setflood", "setfloodtimer", "floodmode", "clearflood",
      "approval", "approve", "unapprove", "approved", "unapproveall",
      "kickme", "ban", "dban", "sban", "tban", "unban", "mute", "dmute", "smute", "tmute", "unmute",
      "kick", "dkick", "skick",
      "addblocklist", "rmblocklist", "unblocklistall", "blocklist", "blocklistmode",
      "blocklistdelete", "setblocklistreason", "resetblocklistreason",
      "cleancommand", "keepcommand", "cleancommandtypes",
      "lock", "unlock", "locks", "lockwarns", "locktypes", "allowlist", "rmallowlist", "rmallowlistall",
      "filter", "stop", "filters",
      "welcome", "goodbye", "setwelcome", "resetwelcome", "setgoodbye", "resetgoodbye", "cleanwelcome",
      "pinned", "pin", "permapin", "unpin", "unpinall", "antichannelpin", "cleanlinked",
      "purge", "spurge", "del", "purgefrom", "purgeto",
      "rules", "setrules", "privaterules", "resetrules", "setrulesbutton", "resetrulesbutton",
      "warn", "dwarn", "swarn", "warns", "rmwarn", "resetwarn", "resetallwarns",
      "warnings", "warnmode", "warnlimit", "warntime"
    ]);
    const adminOnlyCmds = new Set([
      "promote", "demote", "admincache", "anonadmin", "adminerror",
      "flood", "setflood", "setfloodtimer", "floodmode", "clearflood",
      "approve", "unapprove", "approved", "unapproveall",
      "ban", "dban", "sban", "tban", "unban", "mute", "dmute", "smute", "tmute", "unmute",
      "kick", "dkick", "skick",
      "addblocklist", "rmblocklist", "unblocklistall", "blocklist", "blocklistmode",
      "blocklistdelete", "setblocklistreason", "resetblocklistreason",
      "cleancommand", "keepcommand", "cleancommandtypes",
      "lock", "unlock", "locks", "lockwarns", "locktypes", "allowlist", "rmallowlist", "rmallowlistall",
      "filter", "stop", "filters",
      "welcome", "goodbye", "setwelcome", "resetwelcome", "setgoodbye", "resetgoodbye", "cleanwelcome",
      "pin", "permapin", "unpin", "unpinall", "antichannelpin", "cleanlinked",
      "purge", "spurge", "del", "purgefrom", "purgeto",
      "setrules", "privaterules", "resetrules", "setrulesbutton", "resetrulesbutton",
      "warn", "dwarn", "swarn", "warns", "rmwarn", "resetwarn", "resetallwarns",
      "warnings", "warnmode", "warnlimit", "warntime"
    ]);
    const isAdminCmd = adminOnlyCmds.has(cmdName);
    const isKnown = knownCmds.has(cmdName);
    const shouldClean =
      cfg.cleanCommands.includes("all") ||
      (cfg.cleanCommands.includes("admin") && isAdminCmd) ||
      (cfg.cleanCommands.includes("user") && !isAdminCmd && isKnown) ||
      (cfg.cleanCommands.includes("other") && !isKnown);

    if (shouldClean) {
      await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
    }
  }

  if (!userIsAdmin && !userIsApproved && userId) {
    const lockMatches = detectLockMatches(msg);
    const exemptByAllowlist = isAllowlisted(msg, cfg);

    for (const lType of lockMatches) {
      if (!cfg.locks[lType]) continue;
      if (exemptByAllowlist && ALLOWLISTABLE_LOCKS.has(lType)) continue;

      await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
      const lConf = cfg.lockConfig[lType];
      if (lConf?.action && PUNISHMENT_ACTIONS.has(lConf.action)) {
        await executePunishment(chatId, userId, lConf.action, lConf.durationSeconds || 0, lConf.reason || "");
      } else if (lConf?.action === "warn" || cfg.lockWarns) {
        await addWarning(chatId, sender, lConf?.reason || `Locked item: ${lType}`, cfg, null);
      }
      return;
    }

    if (rawText && Array.isArray(cfg.blocklists) && cfg.blocklists.length > 0) {
      const hit = cfg.blocklists.find((item) => matchBlocklistTrigger(item.trigger, rawText));
      if (hit) {
        if (cfg.blocklistDelete) {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        }
        const reason = hit.reason || cfg.blocklistReason || "";
        const mode = cfg.blocklistMode;
        if (mode === "warn") {
          await addWarning(chatId, sender, reason || `Blocklist match: ${hit.trigger}`, cfg, null);
        } else if (PUNISHMENT_ACTIONS.has(mode)) {
          await executePunishment(chatId, userId, mode, 0, reason);
        }
        return;
      }
    }

    if (cfg.flood.limit > 0 || cfg.flood.timerCount > 0) {
      const key = `${chatId}:${userId}`;
      const now = Date.now();
      const prev = floodState.get(key) || { count: 0, timestamps: [] };
      prev.count += 1;
      prev.timestamps.push(now);

      let triggered = false;
      if (cfg.flood.limit > 0 && prev.count > cfg.flood.limit) {
        triggered = true;
      }
      if (!triggered && cfg.flood.timerCount > 0 && cfg.flood.timerSeconds > 0) {
        prev.timestamps = prev.timestamps.filter((t) => now - t <= cfg.flood.timerSeconds * 1000);
        if (prev.timestamps.length >= cfg.flood.timerCount) {
          triggered = true;
        }
      }
      floodState.set(key, prev);

      if (triggered) {
        floodState.set(key, { count: 0, timestamps: [] });
        if (cfg.flood.clearFlood) {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        }
        await executePunishment(chatId, userId, cfg.flood.action, cfg.flood.durationSeconds, "Antiflood triggered");
        return;
      }
    }
  } else if (userId) {
    floodState.set(`${chatId}:${userId}`, { count: 0, timestamps: [] });
  }

  if (cmdName) {
    const requireAdmin = async () => {
      if (userIsAdmin) return true;
      if (cfg.adminError) {
        await tg("sendMessage", {
          chat_id: chatId,
          reply_to_message_id: msg.message_id,
          text: "You need to be an admin to use this command."
        });
      }
      return false;
    };

    switch (cmdName) {
      case "promote": {
        if (!(await requireAdmin())) return;
        const { user } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to promote." }));
        const ok = await hasBotPermission(chatId, "can_promote_members");
        if (!ok) return void (await tg("sendMessage", { chat_id: chatId, text: "I lack permission to promote admins." }));
        await tg("promoteChatMember", {
          chat_id: chatId,
          user_id: user.id,
          can_manage_chat: true,
          can_delete_messages: true,
          can_restrict_members: true,
          can_invite_users: true,
          can_pin_messages: true
        });
        adminCache.delete(chatId);
        await tg("sendMessage", { chat_id: chatId, text: `Promoted ${user.first_name} (${user.id}).` });
        return;
      }
      case "demote": {
        if (!(await requireAdmin())) return;
        const { user } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to demote." }));
        const ok = await hasBotPermission(chatId, "can_promote_members");
        if (!ok) return void (await tg("sendMessage", { chat_id: chatId, text: "I lack permission to demote admins." }));
        await tg("promoteChatMember", {
          chat_id: chatId,
          user_id: user.id,
          can_manage_chat: false,
          can_delete_messages: false,
          can_restrict_members: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_promote_members: false
        });
        adminCache.delete(chatId);
        await tg("sendMessage", { chat_id: chatId, text: `Demoted ${user.first_name} (${user.id}).` });
        return;
      }
      case "adminlist": {
        const admins = await getChatAdmins(chatId);
        const lines = admins.map((a) => {
          const title = a.custom_title ? ` (${a.custom_title})` : "";
          const role = a.status === "creator" ? " [Creator]" : "";
          return `- ${a.user.first_name}${a.user.username ? ` (@${a.user.username})` : ""}${role}${title}`;
        });
        await tg("sendMessage", {
          chat_id: chatId,
          text: lines.length ? `Admins in ${msg.chat.title}:\n${lines.join("\n")}` : "No admins found."
        });
        return;
      }
      case "admincache": {
        if (!(await requireAdmin())) return;
        await getChatAdmins(chatId, true);
        await tg("sendMessage", { chat_id: chatId, text: "Admin cache refreshed." });
        return;
      }
      case "anonadmin": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /anonadmin <yes/no/on/off>" }));
        cfg.anonAdmin = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Anonymous admin bypass set to ${flag ? "on" : "off"}.` });
        return;
      }
      case "adminerror": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /adminerror <yes/no/on/off>" }));
        cfg.adminError = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Admin error messages set to ${flag ? "on" : "off"}.` });
        return;
      }

      case "flood": {
        await tg("sendMessage", {
          chat_id: chatId,
          text: `Flood settings:\nLimit: ${cfg.flood.limit || "off"}\nTimer: ${cfg.flood.timerCount ? `${cfg.flood.timerCount} msgs / ${cfg.flood.timerSeconds}s` : "off"}\nAction: ${cfg.flood.action}\nClear flood: ${cfg.flood.clearFlood ? "on" : "off"}`
        });
        return;
      }
      case "setflood": {
        if (!(await requireAdmin())) return;
        const val = (cmdArgs[0] || "").toLowerCase();
        if (["0", "off", "no"].includes(val)) {
          cfg.flood.limit = 0;
          await saveChatConfig(chatId, cfg);
          return void (await tg("sendMessage", { chat_id: chatId, text: "Antiflood disabled." }));
        }
        const n = parseInt(val, 10);
        if (!n || n < 1) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /setflood <number/off/no>" }));
        cfg.flood.limit = n;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Antiflood set to trigger after ${n} consecutive messages.` });
        return;
      }
      case "setfloodtimer": {
        if (!(await requireAdmin())) return;
        if (["off", "no"].includes((cmdArgs[0] || "").toLowerCase())) {
          cfg.flood.timerCount = 0;
          cfg.flood.timerSeconds = 0;
          await saveChatConfig(chatId, cfg);
          return void (await tg("sendMessage", { chat_id: chatId, text: "Timed antiflood disabled." }));
        }
        const count = parseInt(cmdArgs[0], 10);
        const secs = parseDuration(cmdArgs[1]);
        if (!count || !secs) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /setfloodtimer <count> <duration|off>" }));
        cfg.flood.timerCount = count;
        cfg.flood.timerSeconds = secs;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Timed antiflood set to ${count} messages in ${secs}s.` });
        return;
      }
      case "floodmode": {
        if (!(await requireAdmin())) return;
        const act = (cmdArgs[0] || "").toLowerCase();
        if (!PUNISHMENT_ACTIONS.has(act)) {
          return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /floodmode <ban/mute/kick/tban/tmute> [duration]" }));
        }
        const dur = cmdArgs[1] ? parseDuration(cmdArgs[1]) : 0;
        if (cmdArgs[1] && dur === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Invalid duration." }));
        cfg.flood.action = act;
        cfg.flood.durationSeconds = dur || 0;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Flood action set to ${act}${dur ? ` (${dur}s)` : ""}.` });
        return;
      }
      case "clearflood": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /clearflood <yes/no/on/off>" }));
        cfg.flood.clearFlood = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Clear flood set to ${flag ? "on" : "off"}.` });
        return;
      }

      case "approval": {
        const { user } = await resolveTargetUser(msg, cmdArgs);
        const target = user || sender;
        const status = isApproved(target.id, cfg) ? "approved" : "not approved";
        await tg("sendMessage", { chat_id: chatId, text: `${target.first_name} (${target.id}) is ${status}.` });
        return;
      }
      case "approve": {
        if (!(await requireAdmin())) return;
        const { user } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to approve." }));
        if (!cfg.approvedUsers.includes(user.id)) cfg.approvedUsers.push(user.id);
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Approved ${user.first_name} (${user.id}).` });
        return;
      }
      case "unapprove": {
        if (!(await requireAdmin())) return;
        const { user } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to unapprove." }));
        cfg.approvedUsers = cfg.approvedUsers.filter((id) => id !== user.id);
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Unapproved ${user.first_name} (${user.id}).` });
        return;
      }
      case "approved": {
        if (!(await requireAdmin())) return;
        await tg("sendMessage", {
          chat_id: chatId,
          text: cfg.approvedUsers.length ? `Approved user IDs:\n${cfg.approvedUsers.join(", ")}` : "No approved users in this chat."
        });
        return;
      }
      case "unapproveall": {
        if (!(await requireAdmin())) return;
        cfg.approvedUsers = [];
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "All users have been unapproved." });
        return;
      }

      case "kickme": {
        if (!userId) return;
        const ok = await hasBotPermission(chatId, "can_restrict_members");
        if (!ok) return void (await tg("sendMessage", { chat_id: chatId, text: "I cannot kick you due to missing permissions." }));
        await executePunishment(chatId, userId, "kick", 0, "Used /kickme");
        await tg("sendMessage", { chat_id: chatId, text: `${sender.first_name} kicked themselves.` });
        return;
      }
      case "ban":
      case "dban":
      case "sban":
      case "tban": {
        if (!(await requireAdmin())) return;
        const { user, restArgs } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to ban." }));
        let dur = 0;
        let reasonParts = restArgs;
        if (cmdName === "tban") {
          dur = parseDuration(restArgs[0]) || 0;
          reasonParts = restArgs.slice(1);
        } else if (restArgs[0] && parseDuration(restArgs[0]) !== null) {
          dur = parseDuration(restArgs[0]);
          reasonParts = restArgs.slice(1);
        }
        const reason = reasonParts.join(" ");
        if ((cmdName === "dban" || cmdName === "sban") && msg.reply_to_message) {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        }
        if (cmdName === "sban") {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        }
        const res = await executePunishment(chatId, user.id, dur > 0 ? "tban" : "ban", dur, reason);
        if (cmdName !== "sban") {
          await tg("sendMessage", {
            chat_id: chatId,
            text: res.ok
              ? `Banned ${user.first_name}${dur ? ` for ${dur}s` : ""}${reason ? `\nReason: ${reason}` : ""}.`
              : res.error
          });
        }
        return;
      }
      case "unban": {
        if (!(await requireAdmin())) return;
        const { user } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to unban." }));
        await unrestrictUser(chatId, user.id, true);
        await tg("sendMessage", { chat_id: chatId, text: `Unbanned ${user.first_name}.` });
        return;
      }
      case "mute":
      case "dmute":
      case "smute":
      case "tmute": {
        if (!(await requireAdmin())) return;
        const { user, restArgs } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to mute." }));
        let dur = 0;
        let reasonParts = restArgs;
        if (cmdName === "tmute") {
          dur = parseDuration(restArgs[0]) || 0;
          reasonParts = restArgs.slice(1);
        } else if (restArgs[0] && parseDuration(restArgs[0]) !== null) {
          dur = parseDuration(restArgs[0]);
          reasonParts = restArgs.slice(1);
        }
        const reason = reasonParts.join(" ");
        if ((cmdName === "dmute" || cmdName === "smute") && msg.reply_to_message) {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        }
        if (cmdName === "smute") {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        }
        const res = await executePunishment(chatId, user.id, dur > 0 ? "tmute" : "mute", dur, reason);
        if (cmdName !== "smute") {
          await tg("sendMessage", {
            chat_id: chatId,
            text: res.ok
              ? `Muted ${user.first_name}${dur ? ` for ${dur}s` : ""}${reason ? `\nReason: ${reason}` : ""}.`
              : res.error
          });
        }
        return;
      }
      case "unmute": {
        if (!(await requireAdmin())) return;
        const { user } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to unmute." }));
        await unrestrictUser(chatId, user.id, false);
        await tg("sendMessage", { chat_id: chatId, text: `Unmuted ${user.first_name}.` });
        return;
      }
      case "kick":
      case "dkick":
      case "skick": {
        if (!(await requireAdmin())) return;
        const { user, restArgs } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to kick." }));
        const reason = restArgs.join(" ");
        if ((cmdName === "dkick" || cmdName === "skick") && msg.reply_to_message) {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        }
        if (cmdName === "skick") {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        }
        const res = await executePunishment(chatId, user.id, "kick", 0, reason);
        if (cmdName !== "skick") {
          await tg("sendMessage", {
            chat_id: chatId,
            text: res.ok ? `Kicked ${user.first_name}${reason ? `\nReason: ${reason}` : ""}.` : res.error
          });
        }
        return;
      }

      case "addblocklist": {
        if (!(await requireAdmin())) return;
        if (!cmdArgsStr) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /addblocklist <trigger> [reason]" }));
        const qMatch = cmdArgsStr.match(/^("[^"]+")(?:\s+([\s\S]*))?$/);
        const trigger = qMatch ? qMatch[1] : cmdArgs[0];
        const reason = qMatch ? (qMatch[2] || "").trim() : cmdArgs.slice(1).join(" ");
        cfg.blocklists = cfg.blocklists.filter((b) => b.trigger !== trigger);
        cfg.blocklists.push({ trigger, reason });
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Added blocklist trigger: ${trigger}` });
        return;
      }
      case "rmblocklist": {
        if (!(await requireAdmin())) return;
        if (!cmdArgsStr) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /rmblocklist <trigger>" }));
        cfg.blocklists = cfg.blocklists.filter((b) => b.trigger !== cmdArgsStr);
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Removed blocklist trigger: ${cmdArgsStr}` });
        return;
      }
      case "unblocklistall": {
        const admins = await getChatAdmins(chatId);
        const creator = admins.find((a) => a.status === "creator");
        if (creator?.user?.id !== userId) {
          return void (await tg("sendMessage", { chat_id: chatId, text: "Only the chat creator can clear all blocklists." }));
        }
        cfg.blocklists = [];
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Cleared all blocklists." });
        return;
      }
      case "blocklist": {
        const listText = cfg.blocklists.length
          ? cfg.blocklists.map((b) => `- ${b.trigger}${b.reason ? ` (${b.reason})` : ""}`).join("\n")
          : "No blocklist triggers set.";
        await tg("sendMessage", { chat_id: chatId, text: `Blocklists (mode: ${cfg.blocklistMode}, delete: ${cfg.blocklistDelete ? "on" : "off"}):\n${listText}` });
        return;
      }
      case "blocklistmode": {
        if (!(await requireAdmin())) return;
        const m = (cmdArgs[0] || "").toLowerCase();
        if (!BLOCKLIST_ACTIONS.has(m)) {
          return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /blocklistmode <nothing/ban/mute/kick/warn/tban/tmute>" }));
        }
        cfg.blocklistMode = m;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Blocklist mode set to ${m}.` });
        return;
      }
      case "blocklistdelete": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /blocklistdelete <yes/no/on/off>" }));
        cfg.blocklistDelete = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Blocklist message deletion set to ${flag ? "on" : "off"}.` });
        return;
      }
      case "setblocklistreason": {
        if (!(await requireAdmin())) return;
        cfg.blocklistReason = cmdArgsStr;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Default blocklist reason updated." });
        return;
      }
      case "resetblocklistreason": {
        if (!(await requireAdmin())) return;
        cfg.blocklistReason = "";
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Default blocklist reason reset." });
        return;
      }

      case "cleancommandtypes": {
        await tg("sendMessage", { chat_id: chatId, text: "Cleanable command types: all, admin, user, other" });
        return;
      }
      case "cleancommand": {
        if (!(await requireAdmin())) return;
        const valid = cmdArgs.map((t) => t.toLowerCase()).filter((t) => CLEAN_CMD_TYPES.has(t));
        if (!valid.length) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /cleancommand <all/admin/user/other>" }));
        cfg.cleanCommands = Array.from(new Set([...cfg.cleanCommands, ...valid]));
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Cleaning command types: ${cfg.cleanCommands.join(", ")}` });
        return;
      }
      case "keepcommand": {
        if (!(await requireAdmin())) return;
        const toRemove = cmdArgs.map((t) => t.toLowerCase());
        cfg.cleanCommands = cfg.cleanCommands.filter((t) => !toRemove.includes(t));
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Active clean command types: ${cfg.cleanCommands.join(", ") || "none"}` });
        return;
      }

      case "locktypes": {
        await tg("sendMessage", { chat_id: chatId, text: `Lock types (${LOCK_TYPES.length}):\n${LOCK_TYPES.join(", ")}` });
        return;
      }
      case "locks": {
        const locked = Object.keys(cfg.locks).filter((k) => cfg.locks[k]);
        if (cmdArgs[0]?.toLowerCase() === "list") {
          await tg("sendMessage", { chat_id: chatId, text: `Locked: ${locked.join(", ") || "none"}\nAll types: ${LOCK_TYPES.join(", ")}` });
        } else {
          await tg("sendMessage", { chat_id: chatId, text: `Currently locked items:\n${locked.join(", ") || "none"}` });
        }
        return;
      }
      case "lockwarns": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /lockwarns <yes/no/on/off>" }));
        cfg.lockWarns = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Lock warnings set to ${flag ? "on" : "off"}.` });
        return;
      }
      case "lock": {
        if (!(await requireAdmin())) return;
        const [leftPart, rightPart] = cmdArgsStr.split("###");
        const items = (leftPart || "").trim().split(/\s+/).map((s) => s.toLowerCase()).filter(Boolean);
        if (!items.length) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /lock <item(s)> [### reason {action}]" }));

        if (rightPart !== undefined) {
          const trimmedRight = rightPart.trim();
          if (!trimmedRight) {
            for (const it of items) {
              if (it === "all") cfg.lockConfig = {};
              else delete cfg.lockConfig[it];
            }
            await saveChatConfig(chatId, cfg);
            return void (await tg("sendMessage", { chat_id: chatId, text: "Reset custom lock action/reason." }));
          }
          const actMatch = trimmedRight.match(/\{(ban|mute|kick|tban|tmute|warn)\}/i);
          const action = actMatch ? actMatch[1].toLowerCase() : null;
          const reason = trimmedRight.replace(/\{[^}]+\}/g, "").trim();
          for (const it of items) {
            if (!LOCK_TYPES.includes(it)) continue;
            cfg.locks[it] = true;
            cfg.lockConfig[it] = { action, reason, durationSeconds: 0 };
          }
          await saveChatConfig(chatId, cfg);
          return void (await tg("sendMessage", { chat_id: chatId, text: `Locked ${items.join(", ")} with custom rule.` }));
        }

        const invalid = items.filter((i) => !LOCK_TYPES.includes(i));
        if (invalid.length) {
          return void (await tg("sendMessage", { chat_id: chatId, text: `Unknown lock type(s): ${invalid.join(", ")}` }));
        }
        for (const it of items) cfg.locks[it] = true;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Locked: ${items.join(", ")}` });
        return;
      }
      case "unlock": {
        if (!(await requireAdmin())) return;
        const items = cmdArgs.map((s) => s.toLowerCase());
        if (!items.length) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /unlock <item(s)>" }));
        for (const it of items) delete cfg.locks[it];
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Unlocked: ${items.join(", ")}` });
        return;
      }
      case "allowlist": {
        if (!(await requireAdmin())) return;
        const replyEmojis = (msg.reply_to_message?.entities || [])
          .filter((e) => e.type === "custom_emoji")
          .map((e) => e.custom_emoji_id);
        if (!cmdArgs.length && !replyEmojis.length) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: cfg.allowlist.length ? `Allowlist:\n${cfg.allowlist.join("\n")}` : "Allowlist is empty."
          });
          return;
        }
        for (const it of cmdArgs) {
          if (it.toLowerCase() === "emojipack:<>" && replyEmojis.length > 0) {
            cfg.allowlist.push(`emojipack:${replyEmojis.join(",")}`);
          } else if (!cfg.allowlist.includes(it)) {
            cfg.allowlist.push(it);
          }
        }
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Allowlist updated." });
        return;
      }
      case "rmallowlist": {
        if (!(await requireAdmin())) return;
        cfg.allowlist = cfg.allowlist.filter((it) => !cmdArgs.includes(it));
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Removed specified items from allowlist." });
        return;
      }
      case "rmallowlistall": {
        if (!(await requireAdmin())) return;
        cfg.allowlist = [];
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Cleared all allowlisted items." });
        return;
      }

      case "filter": {
        if (!(await requireAdmin())) return;
        const { triggers, content } = parseFilterInput(cmdArgsStr);
        if (!triggers.length || (!content.trim() && !msg.reply_to_message)) {
          return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /filter <trigger> <reply>" }));
        }
        for (const trig of triggers) {
          cfg.filters = cfg.filters.filter((f) => f.trigger !== trig);
          cfg.filters.push({ trigger: trig, content });
        }
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Saved filter(s): ${triggers.join(", ")}` });
        return;
      }
      case "stop": {
        if (!(await requireAdmin())) return;
        if (!cmdArgsStr) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /stop <trigger>" }));
        cfg.filters = cfg.filters.filter((f) => f.trigger !== cmdArgsStr);
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Stopped filter: ${cmdArgsStr}` });
        return;
      }
      case "filters": {
        const list = cfg.filters.map((f) => `- ${f.trigger}`).join("\n");
        await tg("sendMessage", { chat_id: chatId, text: list ? `Active filters:\n${list}` : "No filters set." });
        return;
      }

      case "welcome": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /welcome <yes/no/on/off>" }));
        cfg.greetings.welcomeEnabled = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Welcome messages ${flag ? "enabled" : "disabled"}.` });
        return;
      }
      case "goodbye": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /goodbye <yes/no/on/off>" }));
        cfg.greetings.goodbyeEnabled = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Goodbye messages ${flag ? "enabled" : "disabled"}.` });
        return;
      }
      case "setwelcome": {
        if (!(await requireAdmin())) return;
        if (!cmdArgsStr) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /setwelcome <text>" }));
        cfg.greetings.welcomeText = cmdArgsStr;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Welcome message updated." });
        return;
      }
      case "resetwelcome": {
        if (!(await requireAdmin())) return;
        cfg.greetings.welcomeText = getDefaultChatConfig().greetings.welcomeText;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Welcome message reset to default." });
        return;
      }
      case "setgoodbye": {
        if (!(await requireAdmin())) return;
        if (!cmdArgsStr) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /setgoodbye <text>" }));
        cfg.greetings.goodbyeText = cmdArgsStr;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Goodbye message updated." });
        return;
      }
      case "resetgoodbye": {
        if (!(await requireAdmin())) return;
        cfg.greetings.goodbyeText = getDefaultChatConfig().greetings.goodbyeText;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Goodbye message reset to default." });
        return;
      }
      case "cleanwelcome": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /cleanwelcome <yes/no/on/off>" }));
        cfg.greetings.cleanWelcome = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Clean welcome set to ${flag ? "on" : "off"}.` });
        return;
      }

      case "pinned": {
        const chatInfo = await tg("getChat", { chat_id: chatId });
        const pMsg = chatInfo?.result?.pinned_message;
        if (!pMsg) return void (await tg("sendMessage", { chat_id: chatId, text: "No pinned message found." }));
        await tg("sendMessage", {
          chat_id: chatId,
          reply_to_message_id: pMsg.message_id,
          text: "Current pinned message."
        });
        return;
      }
      case "pin": {
        if (!(await requireAdmin())) return;
        if (!msg.reply_to_message) return void (await tg("sendMessage", { chat_id: chatId, text: "Reply to a message to pin it." }));
        const silent = !cmdArgs.some((a) => ["loud", "notify"].includes(a.toLowerCase()));
        await tg("pinChatMessage", {
          chat_id: chatId,
          message_id: msg.reply_to_message.message_id,
          disable_notification: silent
        });
        return;
      }
      case "permapin": {
        if (!(await requireAdmin())) return;
        if (!cmdArgsStr) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /permapin <text>" }));
        const filled = applyFillings(cmdArgsStr, sender, msg.chat, { rulesButton: cfg.rules.buttonText });
        const { text, replyMarkup } = extractButtonsFromText(filled);
        const sent = await tg("sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text,
          reply_markup: replyMarkup
        });
        if (sent?.ok) {
          await tg("pinChatMessage", { chat_id: chatId, message_id: sent.result.message_id, disable_notification: true });
        }
        return;
      }
      case "unpin": {
        if (!(await requireAdmin())) return;
        if (msg.reply_to_message) {
          await tg("unpinChatMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        } else {
          await tg("unpinChatMessage", { chat_id: chatId });
        }
        return;
      }
      case "unpinall": {
        if (!(await requireAdmin())) return;
        await tg("unpinAllChatMessages", { chat_id: chatId });
        await tg("sendMessage", { chat_id: chatId, text: "Unpinned all messages." });
        return;
      }
      case "antichannelpin": {
        if (!(await requireAdmin())) return;
        if (!cmdArgs[0]) {
          return void (await tg("sendMessage", { chat_id: chatId, text: `Anti-channel pin is ${cfg.pin.antiChannelPin ? "on" : "off"}.` }));
        }
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /antichannelpin <yes/no/on/off>" }));
        cfg.pin.antiChannelPin = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Anti-channel pin set to ${flag ? "on" : "off"}.` });
        return;
      }
      case "cleanlinked": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /cleanlinked <yes/no/on/off>" }));
        cfg.pin.cleanLinked = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Clean linked channel messages set to ${flag ? "on" : "off"}.` });
        return;
      }

      case "del": {
        if (!(await requireAdmin())) return;
        if (msg.reply_to_message) {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        }
        await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        return;
      }
      case "purgefrom": {
        if (!(await requireAdmin())) return;
        if (!msg.reply_to_message) return void (await tg("sendMessage", { chat_id: chatId, text: "Reply to a message with /purgefrom." }));
        purgeFromState.set(chatId, msg.reply_to_message.message_id);
        await tg("sendMessage", { chat_id: chatId, text: `Marked message ${msg.reply_to_message.message_id} as purge start.` });
        return;
      }
      case "purgeto": {
        if (!(await requireAdmin())) return;
        const startId = purgeFromState.get(chatId);
        const endId = msg.reply_to_message?.message_id || msg.message_id;
        if (!startId) return void (await tg("sendMessage", { chat_id: chatId, text: "Use /purgefrom first." }));
        const from = Math.min(startId, endId);
        const to = Math.max(startId, endId);
        const ids = [];
        for (let id = from; id <= Math.min(to, from + 100); id++) ids.push(id);
        if (ids.length) await tg("deleteMessages", { chat_id: chatId, message_ids: ids });
        purgeFromState.delete(chatId);
        await tg("sendMessage", { chat_id: chatId, text: `Purged ${ids.length} messages.` });
        return;
      }
      case "purge":
      case "spurge": {
        if (!(await requireAdmin())) return;
        if (!msg.reply_to_message) return void (await tg("sendMessage", { chat_id: chatId, text: "Reply to a message to purge from." }));
        const startId = msg.reply_to_message.message_id;
        const countArg = parseInt(cmdArgs[0], 10);
        const endId = countArg && countArg > 0 ? startId + countArg : msg.message_id;
        const ids = [];
        for (let id = startId; id <= Math.min(endId, startId + 100); id++) ids.push(id);
        if (ids.length) await tg("deleteMessages", { chat_id: chatId, message_ids: ids });
        await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
        if (cmdName === "purge") {
          await tg("sendMessage", { chat_id: chatId, text: `Purged ${ids.length} messages.` });
        }
        return;
      }

      case "rules": {
        const noFmt = cmdArgs[0]?.toLowerCase() === "noformat";
        if (!cfg.rules.text) {
          return void (await tg("sendMessage", { chat_id: chatId, text: "No rules have been set for this chat." }));
        }
        if (noFmt) {
          return void (await tg("sendMessage", { chat_id: chatId, text: cfg.rules.text }));
        }
        if (cfg.rules.privateRules && sender) {
          const meRes = await tg("getMe");
          const botUname = meRes?.result?.username || "";
          await tg("sendMessage", {
            chat_id: chatId,
            reply_to_message_id: msg.message_id,
            text: "Click below to view the rules in private.",
            reply_markup: {
              inline_keyboard: [[{ text: cfg.rules.buttonText || "Rules", url: `https://t.me/${botUname}?start=rules_${chatId}` }]]
            }
          });
          return;
        }
        const filled = applyFillings(cfg.rules.text, sender, msg.chat, { rulesButton: cfg.rules.buttonText });
        const { text, replyMarkup } = extractButtonsFromText(filled);
        await tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text, reply_markup: replyMarkup });
        return;
      }
      case "setrules": {
        if (!(await requireAdmin())) return;
        if (!cmdArgsStr) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /setrules <text>" }));
        cfg.rules.text = cmdArgsStr;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Chat rules updated." });
        return;
      }
      case "privaterules": {
        if (!(await requireAdmin())) return;
        const flag = parseBoolFlag(cmdArgs[0]);
        if (flag === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /privaterules <yes/no/on/off>" }));
        cfg.rules.privateRules = flag;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Private rules set to ${flag ? "on" : "off"}.` });
        return;
      }
      case "resetrules": {
        if (!(await requireAdmin())) return;
        cfg.rules.text = "";
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Chat rules reset." });
        return;
      }
      case "setrulesbutton": {
        if (!(await requireAdmin())) return;
        if (!cmdArgsStr) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /setrulesbutton <label>" }));
        cfg.rules.buttonText = cmdArgsStr;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Rules button set to "${cmdArgsStr}".` });
        return;
      }
      case "resetrulesbutton": {
        if (!(await requireAdmin())) return;
        cfg.rules.buttonText = "Rules";
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "Rules button reset to default." });
        return;
      }

      case "warnings": {
        await tg("sendMessage", {
          chat_id: chatId,
          text: `Warning settings:\nLimit: ${cfg.warnings.limit}\nMode: ${cfg.warnings.mode}\nExpire time: ${cfg.warnings.timeSeconds ? `${cfg.warnings.timeSeconds}s` : "off"}`
        });
        return;
      }
      case "warnmode": {
        if (!(await requireAdmin())) return;
        const m = (cmdArgs[0] || "").toLowerCase();
        if (!PUNISHMENT_ACTIONS.has(m)) {
          return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /warnmode <ban/mute/kick/tban/tmute> [duration]" }));
        }
        const dur = cmdArgs[1] ? parseDuration(cmdArgs[1]) : 0;
        if (cmdArgs[1] && dur === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Invalid duration." }));
        cfg.warnings.mode = m;
        cfg.warnings.durationSeconds = dur || 0;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Warn mode set to ${m}.` });
        return;
      }
      case "warnlimit": {
        if (!(await requireAdmin())) return;
        const n = parseInt(cmdArgs[0], 10);
        if (!n || n < 1) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /warnlimit <number>" }));
        cfg.warnings.limit = n;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Warn limit set to ${n}.` });
        return;
      }
      case "warntime": {
        if (!(await requireAdmin())) return;
        const secs = parseDuration(cmdArgs[0]);
        if (secs === null) return void (await tg("sendMessage", { chat_id: chatId, text: "Usage: /warntime <time|off>" }));
        cfg.warnings.timeSeconds = secs;
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: secs === 0 ? "Warn expiration disabled." : `Warn expiration set to ${secs}s.` });
        return;
      }
      case "warn":
      case "dwarn":
      case "swarn": {
        if (!(await requireAdmin())) return;
        const { user, restArgs } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user to warn." }));
        const reason = restArgs.join(" ");
        if (cmdName === "dwarn" && msg.reply_to_message) {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        }
        if (cmdName === "swarn") {
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id });
          await addWarning(chatId, user, reason, cfg, null);
        } else {
          await addWarning(chatId, user, reason, cfg, msg.message_id);
        }
        return;
      }
      case "warns": {
        const { user } = await resolveTargetUser(msg, cmdArgs);
        const target = user || sender;
        if (!target) return;
        const list = cfg.warnings.users[String(target.id)] || [];
        if (!list.length) {
          return void (await tg("sendMessage", { chat_id: chatId, text: `${target.first_name} has no warnings.` }));
        }
        const items = list.map((w, idx) => `${idx + 1}. ${w.reason || "No reason"}`).join("\n");
        await tg("sendMessage", { chat_id: chatId, text: `Warnings for ${target.first_name} (${list.length}/${cfg.warnings.limit}):\n${items}` });
        return;
      }
      case "rmwarn": {
        if (!(await requireAdmin())) return;
        const { user } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user." }));
        const key = String(user.id);
        if (cfg.warnings.users[key]?.length) {
          cfg.warnings.users[key].pop();
          await saveChatConfig(chatId, cfg);
        }
        await tg("sendMessage", { chat_id: chatId, text: `Removed latest warning for ${user.first_name}.` });
        return;
      }
      case "resetwarn": {
        if (!(await requireAdmin())) return;
        const { user } = await resolveTargetUser(msg, cmdArgs);
        if (!user) return void (await tg("sendMessage", { chat_id: chatId, text: "Specify a user." }));
        delete cfg.warnings.users[String(user.id)];
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: `Reset warnings for ${user.first_name}.` });
        return;
      }
      case "resetallwarns": {
        if (!(await requireAdmin())) return;
        cfg.warnings.users = {};
        await saveChatConfig(chatId, cfg);
        await tg("sendMessage", { chat_id: chatId, text: "All warnings in this chat have been reset." });
        return;
      }
    }
  }

  if (rawText && Array.isArray(cfg.filters) && cfg.filters.length > 0) {
    const trimmed = rawText.trim();
    const forceMatch = trimmed.match(/^(.*?)\s+force$/i);
    const noFmtMatch = trimmed.match(/^(.*?)\s+noformat$/i);
    const isForce = Boolean(forceMatch && userIsAdmin);
    const isNoFormat = Boolean(noFmtMatch);
    const queryText = forceMatch ? forceMatch[1] : noFmtMatch ? noFmtMatch[1] : trimmed;

    for (const flt of cfg.filters) {
      const allowBot = /\{allow_bot\}/i.test(flt.content);
      if (sender?.is_bot && !allowBot) continue;
      if (matchFilterTrigger(flt.trigger, queryText, userIsAdmin, Boolean(sender?.is_bot))) {
        const sent = await sendFilterOrNoteResponse(chatId, msg, flt.content, isNoFormat, isForce);
        if (sent) break;
      }
    }
  }
}

async function handleCallbackQuery(cq) {
  if (!cq) return;
  if (cq.data?.startsWith("alert:")) {
    await tg("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: cq.data.slice(6),
      show_alert: true
    });
    return;
  }
  await tg("answerCallbackQuery", { callback_query_id: cq.id });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    if (req.query?.setWebhook && BOT_TOKEN) {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const webhookUrl = `${proto}://${host}/api/webhook`;
      const out = await tg("setWebhook", {
        url: webhookUrl,
        allowed_updates: ALLOWED_UPDATES
      });
      return res.status(200).json({ ok: true, webhookUrl, telegram: out });
    }
    return res.status(200).json({
      ok: true,
      bot: "CricxCrate",
      allowed_updates: ALLOWED_UPDATES
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!update) return res.status(200).json({ ok: true });

    if (update.chat_join_request) {
      await handleJoinRequest(update.chat_join_request);
    } else if (update.my_chat_member) {
      await handleChatMemberUpdate(update);
    } else if (update.message) {
      await handleMessage(update.message);
    } else if (update.edited_message) {
      await handleMessage(update.edited_message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(200).json({ ok: true });
  }
}

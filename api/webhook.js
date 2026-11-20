const BOT_NAME = "CricxCrate";
const memoryStore = new Map();
const adminCache = new Map();
const floodState = new Map();
const purgeFromState = new Map();
const raidJoinState = new Map();

const PUNISHMENT_ACTIONS = new Set(["ban", "mute", "kick", "tban", "tmute"]);
const BLOCKLIST_ACTIONS = new Set(["nothing", "ban", "mute", "kick", "warn", "tban", "tmute"]);
const CLEAN_CMD_TYPES = new Set(["all", "admin", "user", "other"]);

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

const HELP_CATEGORIES = {
  "cc:h:admin": {
    title: "Admin & Approval",
    body: [
      "<b>Admin & Approval</b>",
      "",
      "• /promote [@user|id|reply] — Promote member to admin",
      "• /demote [@user|id|reply] — Demote administrator",
      "• /title [@user|id|reply] &lt;title&gt; — Set custom admin rank",
      "• /adminlist — List chat admins and titles",
      "• /admincache — Refresh cached admin list",
      "• /anonadmin &lt;on/off&gt; — Allow anonymous admin bypass",
      "• /adminerror &lt;on/off&gt; — Toggle non-admin warnings",
      "• /approval, /approve, /unapprove, /approved, /unapproveall — Bypass locks, flood &amp; blocklists"
    ].join("\n")
  },
  "cc:h:mod": {
    title: "Bans, Mutes & Warns",
    body: [
      "<b>Moderation &amp; Warnings</b>",
      "",
      "• /ban, /dban, /sban, /tban &lt;time&gt; [reason] — Ban variants",
      "• /unban [@user|id|reply] — Restore banned user",
      "• /mute, /dmute, /smute, /tmute &lt;time&gt; [reason] — Mute variants",
      "• /unmute [@user|id|reply] — Restore send permissions",
      "• /kick, /dkick, /skick [reason], /kickme — Kick &amp; self-kick",
      "• /warn, /dwarn, /swarn [reason] — Issue warnings",
      "• /warns, /rmwarn, /resetwarn, /resetallwarns — Manage warnings",
      "• /warnings, /warnmode, /warnlimit, /warntime — Warning policy"
    ].join("\n")
  },
  "cc:h:prot": {
    title: "Locks, Flood & Raid",
    body: [
      "<b>Protection &amp; Anti-Raid</b>",
      "",
      "• /lock &lt;type(s)&gt; [### reason {action}], /unlock, /locks [list], /locktypes, /lockwarns",
      "• /allowlist, /rmallowlist, /rmallowlistall — Allowlist channels, links &amp; packs",
      "• /setflood &lt;n|off&gt;, /setfloodtimer &lt;n&gt; &lt;time|off&gt;, /floodmode, /clearflood, /flood",
      "• /addblocklist, /rmblocklist, /unblocklistall, /blocklist, /blocklistmode, /blocklistdelete, /setblocklistreason, /resetblocklistreason",
      "• /raidmode &lt;on/off|time&gt;, /autoraid &lt;n|off&gt;, /raidactiontime &lt;time&gt;",
      "• /slowmode &lt;time|off&gt;, /nightmode &lt;on/off&gt;, /setnightmode &lt;HH:MM&gt; &lt;HH:MM&gt;"
    ].join("\n")
  },
  "cc:h:engage": {
    title: "Greetings, Pin & Purges",
    body: [
      "<b>Greetings, Pin, Purges &amp; Reports</b>",
      "",
      "• /welcome &lt;on/off|noformat&gt;, /setwelcome [text|reply media], /resetwelcome, /cleanwelcome",
      "• /goodbye &lt;on/off|noformat&gt;, /setgoodbye [text|reply media], /resetgoodbye",
      "• /pinned, /pin [loud|notify], /permapin &lt;text&gt;, /unpin [reply], /unpinall, /antichannelpin, /cleanlinked",
      "• /purge [X], /spurge [X], /del, /purgefrom, /purgeto",
      "• /rules [noformat], /setrules, /privaterules, /resetrules, /setrulesbutton, /resetrulesbutton",
      "• /filter, /filters, /stop, /save, /get, #note, /notes, /clear",
      "• /report (reply) or @admin, /reports &lt;on/off&gt;, /info, /chatinfo, /cleancommand, /keepcommand, /cleancommandtypes"
    ].join("\n")
  }
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(200).send(`${BOT_NAME} webhook is running.`);
    }

    const token = (process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
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
      await handleBotMembershipChange(update.my_chat_member, token, logChatId);
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
    if (message?.chat?.id) {
      await handleMessage(message, token, logChatId);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`${BOT_NAME} top-level error:`, err);
    return res.status(200).json({ ok: true });
  }
}

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
      const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}`;
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(JSON.stringify(value)),
      });
    }
  } catch (err) {
    console.error("storeSet error:", err.message);
  }
}

function getDefaultChatConfig() {
  return {
    anonAdmin: false,
    adminError: true,
    reportsEnabled: true,
    approvedUsers: [],
    flood: {
      limit: 0,
      timerCount: 0,
      timerSeconds: 0,
      action: "mute",
      durationSeconds: 0,
      clearFlood: false,
    },
    raid: {
      enabled: false,
      untilTs: 0,
      autoThreshold: 0,
      actionSeconds: 600,
    },
    nightMode: {
      enabled: false,
      startHHMM: "23:00",
      endHHMM: "06:00",
    },
    blocklists: [],
    blocklistMode: "nothing",
    blocklistDelete: true,
    blocklistReason: "",
    cleanCommands: [],
    locks: {},
    lockConfig: {},
    lockWarns: false,
    allowlist: [],
    greetings: {
      welcomeEnabled: false,
      goodbyeEnabled: false,
      welcomeText: "Welcome {first} to {chatname}!",
      goodbyeText: "Goodbye {first}!",
      welcomeMedia: null,
      goodbyeMedia: null,
      cleanWelcome: false,
      lastWelcomeMsgId: null,
      lastWelcomeTs: 0,
    },
    pin: {
      antiChannelPin: false,
      cleanLinked: false,
    },
    rules: {
      text: "",
      privateRules: false,
      buttonText: "Rules",
    },
    warnings: {
      mode: "ban",
      limit: 3,
      timeSeconds: 0,
      durationSeconds: 0,
      clearedAt: 0,
    },
  };
}

async function getChatConfig(chatId) {
  const existing = (await storeGet(`cfg:${chatId}`)) || {};
  const base = getDefaultChatConfig();
  return {
    ...base,
    ...existing,
    flood: { ...base.flood, ...(existing.flood || {}) },
    raid: { ...base.raid, ...(existing.raid || {}) },
    nightMode: { ...base.nightMode, ...(existing.nightMode || {}) },
    greetings: { ...base.greetings, ...(existing.greetings || {}) },
    pin: { ...base.pin, ...(existing.pin || {}) },
    rules: { ...base.rules, ...(existing.rules || {}) },
    warnings: { ...base.warnings, ...(existing.warnings || {}) },
  };
}

async function saveChatConfig(chatId, cfg) {
  await storeSet(`cfg:${chatId}`, cfg);
}

async function sendAuditLog(token, logChatId, text) {
  if (!logChatId) return;
  await safeSend(token, logChatId, `[${BOT_NAME} Log]\n${text}`);
}

function buildStartIntro(botUsername = "") {
  const addLink = botUsername
    ? `https://t.me/${botUsername}?startgroup=true`
    : "https://t.me/";

  return {
    text: [
      `<b>${BOT_NAME} — Moderation &amp; Community Engine</b>`,
      "",
      "Fast serverless group management with persistent configuration, granular enforcement, and zero bloat.",
      "",
      "• <b>Enforcement:</b> Bans, mutes, kicks, timed actions, warnings, antiflood, 51 content locks, allowlists &amp; blocklists",
      "• <b>Automation:</b> Welcomes/goodbyes with media &amp; fillings, pin tools, purges, rules, filters, notes, raid/night/slow controls &amp; auto-approval",
      "",
      "Select <b>Commands</b> below to explore modules."
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "Commands", callback_data: "cc:help_menu" },
          { text: "Add to Group", url: addLink }
        ]
      ]
    }
  };
}

function buildHelpMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Admin & Approval", callback_data: "cc:h:admin" },
        { text: "Bans, Mutes & Warns", callback_data: "cc:h:mod" }
      ],
      [
        { text: "Locks, Flood & Raid", callback_data: "cc:h:prot" },
        { text: "Greetings, Pin & Purges", callback_data: "cc:h:engage" }
      ],
      [
        { text: "Overview", callback_data: "cc:intro" }
      ]
    ]
  };
}

function extractMediaFromMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  if (msg.animation?.file_id) {
    return { type: "animation", file_id: msg.animation.file_id };
  }
  if (msg.video?.file_id) {
    return { type: "video", file_id: msg.video.file_id };
  }
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const best = msg.photo[msg.photo.length - 1];
    if (best?.file_id) return { type: "photo", file_id: best.file_id };
  }
  if (msg.sticker?.file_id) {
    return { type: "sticker", file_id: msg.sticker.file_id };
  }
  if (msg.document?.file_id) {
    return { type: "document", file_id: msg.document.file_id };
  }
  return null;
}

function parseBoolFlag(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (["yes", "on", "true", "1"].includes(v)) return true;
  if (["no", "off", "false", "0"].includes(v)) return false;
  return null;
}

function parseDurationSeconds(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (["off", "no", "none", "0"].includes(s)) return 0;
  const match = s.match(/^(\d+)([smhdw])$/);
  if (!match) return null;
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Number(match[1]) * mult[match[2]];
}

function parseHHMMToMinutes(raw) {
  const m = String(raw || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isNightActive(nm) {
  if (!nm?.enabled) return false;
  const start = parseHHMMToMinutes(nm.startHHMM);
  const end = parseHHMMToMinutes(nm.endHHMM);
  if (start === null || end === null || start === end) return false;
  const now = new Date();
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

function isRaidActive(raid) {
  if (!raid?.enabled) return false;
  if (raid.untilTs && Date.now() > raid.untilTs) return false;
  return true;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    .replace(/\{mention\}/g, id ? `[${first}](tg://user?id=${id})` : first)
    .replace(/\{chatname\}/g, chatName);

  if (extra.rulesButton) {
    const label = extra.rulesButton;
    const url = extra.rulesUrl;
    out = out.replace(/\{rules\}/g, url ? `[${label}](${url})` : label);
  }
  return out;
}

function extractButtonsFromText(raw) {
  const buttons = [];
  const cleaned = raw.replace(
    /\[([^\]]+)\]\((buttonurl|buttonalert|https?|tg):\/\/([^)]+)\)/g,
    (_, label, kind, target) => {
      const cleanLabel = label.trim();
      const t = target.trim();
      if (kind === "buttonalert") {
        buttons.push([{ text: cleanLabel, callback_data: `alert:${t.slice(0, 55)}` }]);
        return "";
      }
      let url = "";
      if (kind === "buttonurl") {
        url =
          t.startsWith("http://") || t.startsWith("https://") || t.startsWith("tg://")
            ? t
            : `https://${t.replace(/^\/+/, "")}`;
      } else {
        url = `${kind}://${t}`;
      }
      buttons.push([{ text: cleanLabel, url }]);
      return "";
    }
  );
  return {
    text: cleaned.trim(),
    replyMarkup: buttons.length ? { inline_keyboard: buttons } : undefined,
  };
}

async function sendGreetingPayload(token, chatId, cfg, kind, member, chat) {
  const isWelcome = kind === "welcome";
  const rawTemplate = isWelcome ? cfg.greetings.welcomeText : cfg.greetings.goodbyeText;
  const media = isWelcome ? cfg.greetings.welcomeMedia : cfg.greetings.goodbyeMedia;

  let rulesUrl = "";
  if (/\{rules\}/i.test(rawTemplate || "")) {
    const me = await safeTgApi(token, "getMe", {});
    const botUname = me?.result?.username || "";
    if (botUname) {
      rulesUrl = `https://t.me/${botUname}?start=rules_${chatId}`;
    }
  }

  const filled = applyFillings(rawTemplate, member, chat, {
    rulesButton: cfg.rules.buttonText || "Rules",
    rulesUrl,
  });
  const { text, replyMarkup } = extractButtonsFromText(filled);
  const fallbackText = isWelcome
    ? `Welcome ${member?.first_name || "User"}!`
    : `Goodbye ${member?.first_name || "User"}!`;
  const finalText = text || fallbackText;

  if (media?.file_id) {
    if (media.type === "animation") {
      return await safeTgApi(token, "sendAnimation", {
        chat_id: chatId,
        animation: media.file_id,
        caption: finalText,
        reply_markup: replyMarkup,
      });
    }
    if (media.type === "video") {
      return await safeTgApi(token, "sendVideo", {
        chat_id: chatId,
        video: media.file_id,
        caption: finalText,
        reply_markup: replyMarkup,
      });
    }
    if (media.type === "photo") {
      return await safeTgApi(token, "sendPhoto", {
        chat_id: chatId,
        photo: media.file_id,
        caption: finalText,
        reply_markup: replyMarkup,
      });
    }
    if (media.type === "sticker") {
      const stickerSent = await safeTgApi(token, "sendSticker", {
        chat_id: chatId,
        sticker: media.file_id,
      });
      if (text) {
        await safeSend(token, chatId, finalText, replyMarkup);
      }
      return stickerSent;
    }
    if (media.type === "document") {
      return await safeTgApi(token, "sendDocument", {
        chat_id: chatId,
        document: media.file_id,
        caption: finalText,
        reply_markup: replyMarkup,
      });
    }
  }

  return await safeSend(token, chatId, finalText, replyMarkup);
}

async function handleBotMembershipChange(mcm, token, logChatId) {
  const chat = mcm.chat;
  const actor = mcm.from;
  const oldStatus = mcm.old_chat_member?.status;
  const newStatus = mcm.new_chat_member?.status;

  if (!chat?.id || oldStatus === newStatus) return;

  adminCache.delete(chat.id);

  const title = chat.title || String(chat.id);
  const actorLabel = actor?.username
    ? `@${actor.username}`
    : actor?.first_name || actor?.id || "Admin";

  let alertMsg = "";
  if (newStatus === "kicked" || newStatus === "left") {
    const mode = newStatus === "kicked" ? "BANNED / KICKED" : "REMOVED / LEFT";
    alertMsg = `${BOT_NAME} Alert: I was ${mode} from "${title}" (${chat.id}). Action by: ${actorLabel}.`;
  } else if (oldStatus === "administrator" && newStatus === "member") {
    alertMsg = `${BOT_NAME} Alert: My ADMIN permissions were removed in "${title}" (${chat.id}). Action by: ${actorLabel}.`;
  } else if (newStatus === "administrator") {
    alertMsg = `${BOT_NAME} Info: I was promoted to ADMIN in "${title}" (${chat.id}). Action by: ${actorLabel}.`;
  }

  if (!alertMsg) return;

  if (actor?.id) {
    await safeSend(token, actor.id, alertMsg);
  }
  if (logChatId) {
    await safeSend(token, logChatId, alertMsg);
  }
}

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
        `${BOT_NAME} auto-approve failed in "${title}" (${chatId}) for user ${userId}: ${err.message}`
      );
    }
  }
}

async function handleCallback(cq, token) {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const data = cq.data || "";

  if (data.startsWith("alert:")) {
    await safeTgApi(token, "answerCallbackQuery", {
      callback_query_id: cq.id,
      text: data.slice(6),
      show_alert: true,
    });
    return;
  }

  await safeTgApi(token, "answerCallbackQuery", { callback_query_id: cq.id });

  if (!chatId) return;

  if (data === "cc:help_menu") {
    const menuText = `<b>${BOT_NAME} Commands</b>\n\nSelect a module:`;
    if (messageId) {
      await safeTgApi(token, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: buildHelpMenuKeyboard(),
      });
    } else {
      await safeSend(token, chatId, menuText, buildHelpMenuKeyboard(), undefined, false, "HTML");
    }
    return;
  }

  if (data === "cc:intro") {
    const me = await safeTgApi(token, "getMe", {});
    const intro = buildStartIntro(me?.result?.username || "");
    if (messageId) {
      await safeTgApi(token, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: intro.text,
        parse_mode: "HTML",
        reply_markup: intro.replyMarkup,
      });
    } else {
      await safeSend(token, chatId, intro.text, intro.replyMarkup, undefined, false, "HTML");
    }
    return;
  }

  if (HELP_CATEGORIES[data]) {
    const cat = HELP_CATEGORIES[data];
    const backMarkup = {
      inline_keyboard: [
        [
          { text: "Modules", callback_data: "cc:help_menu" },
          { text: "Overview", callback_data: "cc:intro" }
        ]
      ]
    };
    if (messageId) {
      await safeTgApi(token, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: cat.body,
        parse_mode: "HTML",
        reply_markup: backMarkup,
      });
    } else {
      await safeSend(token, chatId, cat.body, backMarkup, undefined, false, "HTML");
    }
  }
}

function detectLockMatches(msg) {
  const matches = new Set(["all"]);
  const text = msg.text || msg.caption || "";
  const entities = msg.entities || msg.caption_entities || [];

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
  if (msg.dice) {
    matches.add("emojigame");
    matches.add("emoji");
  }

  if (msg.forward_origin) {
    matches.add("forward");
    const t = msg.forward_origin.type;
    if (t === "user" || t === "hidden_user") matches.add("forwarduser");
    else if (t === "channel" || t === "chat") matches.add("forwardchannel");
  }

  if (text) {
    matches.add("text");
    if (/^\s*\//.test(text)) matches.add("command");
    if (/(?:^|\s)\$[A-Z]{1,10}\b/.test(text)) matches.add("cashtag");
    if (/(?:https?:\/\/|t\.me\/|@\w*bot\b)/i.test(text)) {
      if (/(?:t\.me\/[a-zA-Z0-9_]+bot|@\w*bot\b)/i.test(text)) matches.add("botlink");
      if (/(?:https?:\/\/)?(?:t\.me\/(?:\+|joinchat\/|[a-zA-Z0-9_]+)|telegram\.me\/)/i.test(text)) {
        matches.add("invitelink");
      }
      if (/https?:\/\/\S+/i.test(text)) matches.add("url");
    }
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(text)) matches.add("cjk");
    if (/[\u0400-\u04ff]/.test(text)) matches.add("cyrillic");
    if (/[\u0590-\u05ff\u0600-\u06ff\u0750-\u077f]/.test(text)) matches.add("rtl");
    if (/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3,}/.test(text)) matches.add("zalgo");

    const emojiMatches = text.match(/\p{Extended_Pictographic}/gu);
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
  const text = `${msg.text || ""} ${msg.caption || ""}`.toLowerCase();
  const fwdChat = msg.forward_origin?.chat;
  const fwdUser = msg.forward_origin?.sender_user;
  const stickerSet = msg.sticker?.set_name?.toLowerCase();
  const customEmojis = (msg.entities || msg.caption_entities || [])
    .filter((e) => e.type === "custom_emoji")
    .map((e) => e.custom_emoji_id);

  for (const item of list) {
    const low = item.toLowerCase();
    if (text.includes(low)) return true;
    if (fwdChat && (String(fwdChat.id) === item || (fwdChat.username && `@${fwdChat.username.toLowerCase()}` === low))) {
      return true;
    }
    if (fwdUser && String(fwdUser.id) === item) return true;
    if (stickerSet && low.includes(stickerSet)) return true;
    if (low.startsWith("emojipack:") && customEmojis.length > 0) return true;
  }
  return false;
}

function matchBlocklistTrigger(trigger, text) {
  if (!text) return false;
  const quoted = trigger.match(/^"(.*)"$/);
  if (quoted) {
    return wildcardToRegex(quoted[1], true).test(text);
  }
  const regex = wildcardToRegex(trigger, false);
  return text.split(/\s+/).some((tok) => regex.test(tok));
}

function matchFilterTrigger(triggerRaw, text) {
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
  return new RegExp(`(^|\\b)${escapeRegex(lowerTrig)}(\\b|$)`, "i").test(lowerText);
}

function parseFilterInput(rawArgsText) {
  let triggers = [];
  let rest = "";
  const multiMatch = rawArgsText.match(/^\(([^)]+)\)\s*([\s\S]*)$/);
  if (multiMatch) {
    triggers = multiMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
    rest = multiMatch[2] || "";
  } else {
    const quoteMatch = rawArgsText.match(/^("[^"]+")\s*([\s\S]*)$/);
    if (quoteMatch) {
      triggers = [quoteMatch[1]];
      rest = quoteMatch[2] || "";
    } else {
      const idx = rawArgsText.indexOf(" ");
      if (idx === -1) {
        triggers = [rawArgsText.trim()];
        rest = "";
      } else {
        triggers = [rawArgsText.slice(0, idx).trim()];
        rest = rawArgsText.slice(idx + 1);
      }
    }
  }
  return { triggers, content: rest };
}

async function sendFormattedMessage(token, chatId, message, rawContent, isNoFormat = false, isForce = false, senderIsAdmin = false) {
  const hasAdminFlag = /\{admin\}/i.test(rawContent);
  const hasUserFlag = /\{user\}/i.test(rawContent);
  const hasProtect = /\{protect\}/i.test(rawContent);
  const hasReplyTag = /\{replytag\}/i.test(rawContent);

  if (!isForce) {
    if (hasAdminFlag && !senderIsAdmin) return false;
    if (hasUserFlag && senderIsAdmin) return false;
  }

  const variants = rawContent.split(/\n%%%\n/);
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
    await safeSend(token, chatId, chosen, undefined, message.message_id);
    return true;
  }

  const filled = applyFillings(chosen, message.from, message.chat);
  const { text, replyMarkup } = extractButtonsFromText(filled);
  const replyToId = hasReplyTag && message.reply_to_message
    ? message.reply_to_message.message_id
    : message.message_id;

  await safeSend(token, chatId, text || " ", replyMarkup, replyToId, hasProtect);
  return true;
}

async function applyPunishment(token, chatId, targetUser, action, durationSeconds = 0, reason = "", logChatId = "") {
  const untilDate = durationSeconds > 0 ? Math.floor(Date.now() / 1000) + durationSeconds : undefined;
  const label = targetUser?.username
    ? `@${targetUser.username}`
    : targetUser?.first_name || String(targetUser?.id || "");

  let out = "";
  if (action === "ban" || action === "tban") {
    const payload = { chat_id: chatId, user_id: targetUser.id };
    if (untilDate) payload.until_date = untilDate;
    await tgApi(token, "banChatMember", payload);
    out = `${label} ${action === "tban" && durationSeconds ? `temporarily banned (${durationSeconds}s)` : "banned"}${reason ? `\nReason: ${reason}` : ""}`;
  } else if (action === "kick") {
    await tgApi(token, "banChatMember", { chat_id: chatId, user_id: targetUser.id });
    await tgApi(token, "unbanChatMember", { chat_id: chatId, user_id: targetUser.id, only_if_banned: true });
    out = `${label} kicked${reason ? `\nReason: ${reason}` : ""}`;
  } else if (action === "mute" || action === "tmute") {
    const payload = {
      chat_id: chatId,
      user_id: targetUser.id,
      permissions: { can_send_messages: false },
    };
    if (untilDate) payload.until_date = untilDate;
    await tgApi(token, "restrictChatMember", payload);
    out = `${label} muted${durationSeconds ? ` (${durationSeconds}s)` : ""}${reason ? `\nReason: ${reason}` : ""}`;
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }

  if (logChatId) {
    await sendAuditLog(token, logChatId, `Chat ${chatId}: ${out.replace(/\n/g, " | ")}`);
  }
  return out;
}

async function applyWarning(token, chatId, targetUser, reason, cfg, replyToMessageId = null, logChatId = "") {
  const now = Date.now();
  const uid = String(targetUser.id);
  const wCfg = cfg.warnings;
  const warnKey = `warns:${chatId}:${uid}`;
  let warns = (await storeGet(warnKey)) || [];

  if (wCfg.clearedAt) {
    warns = warns.filter((w) => w.at > wCfg.clearedAt);
  }
  if (wCfg.timeSeconds > 0) {
    warns = warns.filter((w) => now - w.at < wCfg.timeSeconds * 1000);
  }

  warns.push({ reason: reason || "Warning", at: now });
  await storeSet(warnKey, warns);

  const label = targetUser?.username
    ? `@${targetUser.username}`
    : targetUser?.first_name || uid;

  if (warns.length >= (wCfg.limit || 3)) {
    await storeSet(warnKey, []);
    if (PUNISHMENT_ACTIONS.has(wCfg.mode)) {
      const msg = await applyPunishment(token, chatId, targetUser, wCfg.mode, wCfg.durationSeconds, reason, logChatId);
      await safeSend(token, chatId, `${msg} (reached ${wCfg.limit}/${wCfg.limit} warnings).`, undefined, replyToMessageId);
      return;
    }
  }

  const text = `Warning (${warns.length}/${wCfg.limit || 3}) issued to ${label}.\nReason: ${reason || "Warning"}`;
  await safeSend(token, chatId, text, undefined, replyToMessageId);
  if (logChatId) {
    await sendAuditLog(token, logChatId, `Chat ${chatId}: ${text.replace(/\n/g, " | ")}`);
  }
}

async function handleMessage(message, token, logChatId = "") {
  const chatId = message.chat.id;
  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  const sender = message.from;
  const senderId = sender?.id;

  if (sender?.username) {
    await storeSet(`user:${sender.username.toLowerCase()}`, {
      id: sender.id,
      first_name: sender.first_name,
      last_name: sender.last_name,
      username: sender.username,
    });
  }

  const rawText = typeof message.text === "string"
    ? message.text.trim()
    : typeof message.caption === "string"
      ? message.caption.trim()
      : "";

  if (!isGroup) {
    if (rawText.startsWith("/start")) {
      const parts = rawText.split(/\s+/);
      if (parts[1] && parts[1].startsWith("rules_")) {
        const targetChatId = parts[1].slice(6);
        const targetCfg = await getChatConfig(targetChatId);
        await safeSend(
          token,
          chatId,
          targetCfg.rules.text
            ? applyFillings(targetCfg.rules.text, sender, { title: "Group" })
            : "No rules set for this chat."
        );
        return;
      }
      const me = await safeTgApi(token, "getMe", {});
      const intro = buildStartIntro(me?.result?.username || "");
      await safeSend(token, chatId, intro.text, intro.replyMarkup, undefined, false, "HTML");
      return;
    }

    if (rawText.startsWith("/help")) {
      await safeSend(
        token,
        chatId,
        `<b>${BOT_NAME} Commands</b>\n\nSelect a module:`,
        buildHelpMenuKeyboard(),
        undefined,
        false,
        "HTML"
      );
      return;
    }

    if (rawText.startsWith("/id")) {
      const replyId = message.reply_to_message?.from?.id;
      await safeSend(
        token,
        chatId,
        `Chat ID: ${chatId}\nYour ID: ${senderId ?? "N/A"}${replyId ? `\nReplied User ID: ${replyId}` : ""}`
      );
      return;
    }
    return;
  }

  const cfg = await getChatConfig(chatId);

  if (message.new_chat_members?.length > 0) {
    const now = Date.now();
    const rList = (raidJoinState.get(chatId) || []).filter((t) => now - t <= 20000);
    for (const member of message.new_chat_members) {
      rList.push(now);
      if (cfg.raid.autoThreshold > 0 && rList.length >= cfg.raid.autoThreshold && !isRaidActive(cfg.raid)) {
        cfg.raid.enabled = true;
        cfg.raid.untilTs = now + (cfg.raid.actionSeconds || 600) * 1000;
        await saveChatConfig(chatId, cfg);
        await safeSend(token, chatId, `Auto-raid mode activated for ${cfg.raid.actionSeconds || 600}s.`);
      }
      if (isRaidActive(cfg.raid) && member?.id && !member.is_bot) {
        await safeTgApi(token, "banChatMember", { chat_id: chatId, user_id: member.id });
        await safeTgApi(token, "unbanChatMember", { chat_id: chatId, user_id: member.id, only_if_banned: true });
        continue;
      }
      if (cfg.greetings.welcomeEnabled) {
        if (cfg.greetings.cleanWelcome && cfg.greetings.lastWelcomeMsgId) {
          await safeTgApi(token, "deleteMessage", {
            chat_id: chatId,
            message_id: cfg.greetings.lastWelcomeMsgId,
          });
        }
        const sent = await sendGreetingPayload(token, chatId, cfg, "welcome", member, message.chat);
        if (sent?.ok && sent.result?.message_id) {
          cfg.greetings.lastWelcomeMsgId = sent.result.message_id;
          cfg.greetings.lastWelcomeTs = Date.now();
          await saveChatConfig(chatId, cfg);
        }
      }
    }
    raidJoinState.set(chatId, rList);
    return;
  }

  if (message.left_chat_member && cfg.greetings.goodbyeEnabled) {
    const memberCountRes = await safeTgApi(token, "getChatMemberCount", { chat_id: chatId });
    const memberCount = typeof memberCountRes?.result === "number" ? memberCountRes.result : 0;
    if (memberCount <= 50) {
      await sendGreetingPayload(token, chatId, cfg, "goodbye", message.left_chat_member, message.chat);
    }
    return;
  }

  if (message.pinned_message && cfg.pin.antiChannelPin && message.pinned_message.sender_chat?.id === chatId) {
    await safeTgApi(token, "unpinChatMessage", {
      chat_id: chatId,
      message_id: message.pinned_message.message_id,
    });
    return;
  }

  if (message.sender_chat && message.sender_chat.id === chatId && cfg.pin.cleanLinked && !message.from) {
    await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
    return;
  }

  if (cfg.greetings.cleanWelcome && cfg.greetings.lastWelcomeMsgId && cfg.greetings.lastWelcomeTs) {
    if (Date.now() - cfg.greetings.lastWelcomeTs >= 5 * 60 * 1000) {
      await safeTgApi(token, "deleteMessage", {
        chat_id: chatId,
        message_id: cfg.greetings.lastWelcomeMsgId,
      });
      cfg.greetings.lastWelcomeMsgId = null;
      cfg.greetings.lastWelcomeTs = 0;
      await saveChatConfig(chatId, cfg);
    }
  }

  const normalizedText = rawText.replace(/^(\/[a-zA-Z0-9_]+)@[a-zA-Z0-9_]+/i, "$1");
  const parts = normalizedText ? normalizedText.split(/\s+/) : [];
  const cmd = parts[0]?.toLowerCase() || "";
  const cmdName = cmd.startsWith("/") ? cmd.slice(1) : "";
  const cmdArgs = parts.slice(1);
  const cmdArgsStr = cmd.startsWith("/")
    ? normalizedText.slice(parts[0].length).trim()
    : "";

  const senderIsAdmin = senderId
    ? await isChatAdmin(token, chatId, senderId, message.sender_chat, cfg)
    : false;
  const senderIsApproved = senderId
    ? Array.isArray(cfg.approvedUsers) && cfg.approvedUsers.includes(senderId)
    : false;

  if (cfg.reportsEnabled && !senderIsAdmin && rawText && /(?:^|\s)@admins?\b/i.test(rawText)) {
    const admins = await getChatAdminsCached(token, chatId);
    const mentions = admins.map((a) => (a.user?.username ? `@${a.user.username}` : a.user?.first_name)).filter(Boolean);
    await safeSend(
      token,
      chatId,
      `Reported to admins${mentions.length ? `: ${mentions.slice(0, 8).join(" ")}` : "."}`,
      undefined,
      message.reply_to_message?.message_id || message.message_id
    );
  }

  if (cmdName && cfg.cleanCommands.length > 0) {
    const adminOnlySet = new Set([
      "promote", "demote", "title", "admincache", "anonadmin", "adminerror",
      "approve", "unapprove", "approved", "unapproveall",
      "setflood", "setfloodtimer", "floodmode", "clearflood",
      "raidmode", "autoraid", "raidactiontime", "slowmode", "nightmode", "setnightmode",
      "addblocklist", "rmblocklist", "unblocklistall", "blocklistmode",
      "blocklistdelete", "setblocklistreason", "resetblocklistreason",
      "cleancommand", "keepcommand", "reports",
      "lock", "unlock", "lockwarns", "allowlist", "rmallowlist", "rmallowlistall",
      "filter", "stop", "save", "clear",
      "welcome", "goodbye", "setwelcome", "resetwelcome", "setgoodbye", "resetgoodbye", "cleanwelcome",
      "pin", "permapin", "unpin", "unpinall", "antichannelpin", "cleanlinked",
      "purge", "spurge", "del", "purgefrom", "purgeto",
      "setrules", "privaterules", "resetrules", "setrulesbutton", "resetrulesbutton",
      "warn", "dwarn", "swarn", "rmwarn", "resetwarn", "resetallwarns",
      "warnmode", "warnlimit", "warntime",
      "ban", "dban", "sban", "tban", "unban", "mute", "dmute", "smute", "tmute", "unmute",
      "kick", "dkick", "skick"
    ]);
    const userKnownSet = new Set([
      "start", "help", "id", "info", "chatinfo", "adminlist", "approval", "flood", "blocklist",
      "cleancommandtypes", "locks", "locktypes", "filters", "get", "notes",
      "pinned", "rules", "warnings", "warns", "kickme", "report"
    ]);
    const isAdminCmd = adminOnlySet.has(cmdName);
    const isKnown = isAdminCmd || userKnownSet.has(cmdName);
    const shouldClean =
      cfg.cleanCommands.includes("all") ||
      (cfg.cleanCommands.includes("admin") && isAdminCmd) ||
      (cfg.cleanCommands.includes("user") && !isAdminCmd && isKnown) ||
      (cfg.cleanCommands.includes("other") && !isKnown);

    if (shouldClean) {
      await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
    }
  }

  if (!senderIsAdmin && !senderIsApproved && senderId) {
    if (isNightActive(cfg.nightMode)) {
      await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
      return;
    }

    const lockHits = detectLockMatches(message);
    const allowlisted = isAllowlisted(message, cfg);

    for (const lType of lockHits) {
      if (!cfg.locks[lType]) continue;
      if (allowlisted && ALLOWLISTABLE_LOCKS.has(lType)) continue;

      await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
      const lConf = cfg.lockConfig[lType];
      if (lConf?.action && PUNISHMENT_ACTIONS.has(lConf.action)) {
        const resText = await applyPunishment(token, chatId, sender, lConf.action, lConf.durationSeconds || 0, lConf.reason || "", logChatId);
        await safeSend(token, chatId, resText);
      } else if (lConf?.action === "warn" || cfg.lockWarns) {
        await applyWarning(token, chatId, sender, lConf?.reason || `Locked item: ${lType}`, cfg, null, logChatId);
      }
      return;
    }

    if (rawText && cfg.blocklists.length > 0) {
      const hit = cfg.blocklists.find((b) => matchBlocklistTrigger(b.trigger, rawText));
      if (hit) {
        if (cfg.blocklistDelete) {
          await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
        }
        const reason = hit.reason || cfg.blocklistReason || `Blocklist match: ${hit.trigger}`;
        if (cfg.blocklistMode === "warn") {
          await applyWarning(token, chatId, sender, reason, cfg, null, logChatId);
        } else if (PUNISHMENT_ACTIONS.has(cfg.blocklistMode)) {
          const resText = await applyPunishment(token, chatId, sender, cfg.blocklistMode, 0, reason, logChatId);
          await safeSend(token, chatId, resText);
        }
        return;
      }
    }

    if (cfg.flood.limit > 0 || cfg.flood.timerCount > 0) {
      const fKey = `${chatId}:${senderId}`;
      const now = Date.now();
      const st = floodState.get(fKey) || { count: 0, ts: [] };
      st.count += 1;
      st.ts.push(now);

      let tripped = false;
      if (cfg.flood.limit > 0 && st.count > cfg.flood.limit) tripped = true;
      if (!tripped && cfg.flood.timerCount > 0 && cfg.flood.timerSeconds > 0) {
        st.ts = st.ts.filter((t) => now - t <= cfg.flood.timerSeconds * 1000);
        if (st.ts.length >= cfg.flood.timerCount) tripped = true;
      }
      floodState.set(fKey, st);

      if (tripped) {
        floodState.set(fKey, { count: 0, ts: [] });
        if (cfg.flood.clearFlood) {
          await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
        }
        const resText = await applyPunishment(token, chatId, sender, cfg.flood.action, cfg.flood.durationSeconds, "Antiflood triggered", logChatId);
        await safeSend(token, chatId, resText);
        return;
      }
    }
  } else if (senderId) {
    floodState.set(`${chatId}:${senderId}`, { count: 0, ts: [] });
  }

  if (cmd === "/start") {
    const p = rawText.split(/\s+/);
    if (p[1] && p[1].startsWith("rules_")) {
      const targetChatId = p[1].slice(6);
      const targetCfg = await getChatConfig(targetChatId);
      await safeSend(
        token,
        chatId,
        targetCfg.rules.text
          ? applyFillings(targetCfg.rules.text, sender, { title: "Group" })
          : "No rules set for this chat."
      );
      return;
    }
    const me = await safeTgApi(token, "getMe", {});
    const intro = buildStartIntro(me?.result?.username || "");
    await safeSend(token, chatId, intro.text, intro.replyMarkup, undefined, false, "HTML");
    return;
  }

  if (cmd === "/help") {
    await safeSend(
      token,
      chatId,
      `<b>${BOT_NAME} Commands</b>\n\nSelect a module:`,
      buildHelpMenuKeyboard(),
      undefined,
      false,
      "HTML"
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

  if (cmd === "/info") {
    const target = await resolveTargetUser(token, message, parts);
    const u = target.user || sender;
    await safeSend(
      token,
      chatId,
      `User Info:\nName: ${u?.first_name || "N/A"}${u?.last_name ? ` ${u.last_name}` : ""}\nUsername: ${u?.username ? `@${u.username}` : "None"}\nID: ${u?.id ?? "N/A"}`
    );
    return;
  }

  if (cmd === "/chatinfo") {
    const countRes = await safeTgApi(token, "getChatMemberCount", { chat_id: chatId });
    await safeSend(
      token,
      chatId,
      `Chat Info:\nTitle: ${message.chat.title || "Group"}\nID: ${chatId}\nType: ${message.chat.type}\nMembers: ${countRes?.result ?? "N/A"}`
    );
    return;
  }

  if (cmd === "/report") {
    if (!cfg.reportsEnabled) {
      await safeSend(token, chatId, "Reports are disabled in this chat.");
      return;
    }
    if (!message.reply_to_message) {
      await safeSend(token, chatId, "Reply to a message with /report to notify admins.");
      return;
    }
    const admins = await getChatAdminsCached(token, chatId);
    const mentions = admins.map((a) => (a.user?.username ? `@${a.user.username}` : a.user?.first_name)).filter(Boolean);
    await safeSend(
      token,
      chatId,
      `Report sent to admins${mentions.length ? `: ${mentions.slice(0, 8).join(" ")}` : "."}${cmdArgsStr ? `\nReason: ${cmdArgsStr}` : ""}`,
      undefined,
      message.reply_to_message.message_id
    );
    return;
  }

  if (/^#[a-zA-Z0-9_-]+$/.test(normalizedText)) {
    const noteName = normalizedText.slice(1).toLowerCase();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    if (notes[noteName]) {
      await sendFormattedMessage(token, chatId, message, notes[noteName], false, false, senderIsAdmin);
    }
    return;
  }

  if (cmd === "/get") {
    const noteName = (cmdArgs[0] || "").toLowerCase();
    if (!noteName) {
      await safeSend(token, chatId, "Usage: /get <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    if (!notes[noteName]) {
      await safeSend(token, chatId, "Note not found.");
      return;
    }
    await sendFormattedMessage(
      token,
      chatId,
      message,
      notes[noteName],
      cmdArgs[1]?.toLowerCase() === "noformat",
      false,
      senderIsAdmin
    );
    return;
  }

  if (cmd === "/notes") {
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    const keys = Object.keys(notes);
    await safeSend(
      token,
      chatId,
      keys.length ? `Saved notes:\n${keys.map((k) => `#${k}`).join(", ")}` : "No saved notes."
    );
    return;
  }

  if (cmd === "/adminlist") {
    const admins = await getChatAdminsCached(token, chatId);
    const lines = admins.map((a) => {
      const role = a.status === "creator" ? " [Creator]" : "";
      const title = a.custom_title ? ` (${a.custom_title})` : "";
      return `- ${a.user.first_name}${a.user.username ? ` (@${a.user.username})` : ""}${role}${title}`;
    });
    await safeSend(token, chatId, lines.length ? `Admins:\n${lines.join("\n")}` : "No admins found.");
    return;
  }

  if (cmd === "/approval") {
    const target = await resolveTargetUser(token, message, parts);
    const checkUser = target.id ? target : { id: senderId, label: sender?.username ? `@${sender.username}` : String(senderId) };
    const isApp = checkUser.id && cfg.approvedUsers.includes(checkUser.id);
    await safeSend(token, chatId, `${checkUser.label} is ${isApp ? "approved" : "not approved"}.`);
    return;
  }

  if (cmd === "/flood") {
    await safeSend(
      token,
      chatId,
      `Flood settings:\nLimit: ${cfg.flood.limit || "off"}\nTimer: ${cfg.flood.timerCount ? `${cfg.flood.timerCount} msgs / ${cfg.flood.timerSeconds}s` : "off"}\nAction: ${cfg.flood.action}\nClear flood: ${cfg.flood.clearFlood ? "on" : "off"}`
    );
    return;
  }

  if (cmd === "/blocklist") {
    const listStr = cfg.blocklists.length
      ? cfg.blocklists.map((b) => `- ${b.trigger}${b.reason ? ` (${b.reason})` : ""}`).join("\n")
      : "No blocklist triggers set.";
    await safeSend(
      token,
      chatId,
      `Blocklist (mode: ${cfg.blocklistMode}, delete: ${cfg.blocklistDelete ? "on" : "off"}):\n${listStr}`
    );
    return;
  }

  if (cmd === "/cleancommandtypes") {
    await safeSend(token, chatId, "Cleanable command types: all, admin, user, other");
    return;
  }

  if (cmd === "/locktypes") {
    await safeSend(token, chatId, `Lock types (${LOCK_TYPES.length}):\n${LOCK_TYPES.join(", ")}`);
    return;
  }

  if (cmd === "/locks") {
    const locked = Object.keys(cfg.locks).filter((k) => cfg.locks[k]);
    if (cmdArgs[0]?.toLowerCase() === "list") {
      await safeSend(token, chatId, `Locked: ${locked.join(", ") || "none"}\nAll: ${LOCK_TYPES.join(", ")}`);
    } else {
      await safeSend(token, chatId, `Currently locked:\n${locked.join(", ") || "none"}`);
    }
    return;
  }

  if (cmd === "/filters") {
    const filters = (await storeGet(`filters_v2:${chatId}`)) || [];
    await safeSend(
      token,
      chatId,
      filters.length ? `Active filters:\n${filters.map((f) => `- ${f.trigger}`).join("\n")}` : "No filters configured."
    );
    return;
  }

  if (cmd === "/pinned") {
    try {
      const chatRes = await tgApi(token, "getChat", { chat_id: chatId });
      const pId = chatRes?.result?.pinned_message?.message_id;
      if (!pId) {
        await safeSend(token, chatId, "No pinned message found.");
        return;
      }
      await safeSend(token, chatId, "Current pinned message.", undefined, pId);
    } catch (err) {
      await safeSend(token, chatId, `Failed to get pinned message: ${err.message}`);
    }
    return;
  }

  if (cmd === "/rules") {
    if (!cfg.rules.text) {
      await safeSend(token, chatId, "No rules have been set for this chat.");
      return;
    }
    if (cmdArgs[0]?.toLowerCase() === "noformat") {
      await safeSend(token, chatId, cfg.rules.text);
      return;
    }
    if (cfg.rules.privateRules && senderId) {
      const me = await safeTgApi(token, "getMe", {});
      const botUname = me?.result?.username || "";
      if (botUname) {
        await safeSend(
          token,
          chatId,
          "Click below to view the rules in private.",
          { inline_keyboard: [[{ text: cfg.rules.buttonText || "Rules", url: `https://t.me/${botUname}?start=rules_${chatId}` }]] },
          message.message_id
        );
        return;
      }
    }
    const filled = applyFillings(cfg.rules.text, sender, message.chat, { rulesButton: cfg.rules.buttonText });
    const { text, replyMarkup } = extractButtonsFromText(filled);
    await safeSend(token, chatId, text, replyMarkup);
    return;
  }

  if (cmd === "/warnings") {
    await safeSend(
      token,
      chatId,
      `Warning settings:\nLimit: ${cfg.warnings.limit}\nMode: ${cfg.warnings.mode}\nExpire time: ${cfg.warnings.timeSeconds ? `${cfg.warnings.timeSeconds}s` : "off"}`
    );
    return;
  }

  if (cmd === "/kickme") {
    if (!senderId) return;
    const right = await checkBotPermission(token, chatId, "can_restrict_members");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    try {
      const resText = await applyPunishment(token, chatId, sender, "kick", 0, "Used /kickme", logChatId);
      await safeSend(token, chatId, resText);
    } catch (err) {
      await safeSend(token, chatId, `Kick failed: ${err.message}`);
    }
    return;
  }

  const adminCommands = new Set([
    "/promote", "/demote", "/title", "/admincache", "/anonadmin", "/adminerror", "reports",
    "/approve", "/unapprove", "/approved", "/unapproveall",
    "/setflood", "/setfloodtimer", "/floodmode", "/clearflood",
    "/raidmode", "/autoraid", "/raidactiontime", "/slowmode", "/nightmode", "/setnightmode",
    "/addblocklist", "/rmblocklist", "/unblocklistall", "/blocklistmode",
    "/blocklistdelete", "/setblocklistreason", "/resetblocklistreason",
    "/cleancommand", "/keepcommand",
    "/lock", "/unlock", "/lockwarns", "/allowlist", "/rmallowlist", "/rmallowlistall",
    "/filter", "/stop", "/save", "/clear",
    "/welcome", "/goodbye", "/setwelcome", "/resetwelcome", "/setgoodbye", "/resetgoodbye", "/cleanwelcome",
    "/pin", "/permapin", "/unpin", "/unpinall", "/antichannelpin", "/cleanlinked",
    "/purge", "/spurge", "/del", "/purgefrom", "/purgeto",
    "/setrules", "/privaterules", "/resetrules", "/setrulesbutton", "/resetrulesbutton",
    "/warn", "/dwarn", "/swarn", "/warns", "/rmwarn", "/resetwarn", "/resetallwarns",
    "/warnmode", "/warnlimit", "/warntime",
    "/ban", "/dban", "/sban", "/tban", "/unban",
    "/mute", "/dmute", "/smute", "/tmute", "/unmute",
    "/kick", "/dkick", "/skick"
  ]);

  if (adminCommands.has(cmd)) {
    if (!senderId || !senderIsAdmin) {
      if (cfg.adminError) {
        await safeSend(token, chatId, "Only group administrators can use this command.");
      }
      return;
    }

    await runAdminCommand(message, token, cfg, cmd, cmdName, parts, cmdArgs, cmdArgsStr, normalizedText, logChatId);
    return;
  }

  if (rawText) {
    const filters = (await storeGet(`filters_v2:${chatId}`)) || [];
    const forceMatch = rawText.match(/^(.*?)\s+force$/i);
    const noFmtMatch = rawText.match(/^(.*?)\s+noformat$/i);
    const isForce = Boolean(forceMatch && senderIsAdmin);
    const isNoFormat = Boolean(noFmtMatch);
    const queryText = forceMatch ? forceMatch[1].trim() : noFmtMatch ? noFmtMatch[1].trim() : rawText;

    for (const flt of filters) {
      const allowBot = /\{allow_bot\}/i.test(flt.content);
      if (sender?.is_bot && !allowBot) continue;
      if (matchFilterTrigger(flt.trigger, queryText)) {
        const sent = await sendFormattedMessage(token, chatId, message, flt.content, isNoFormat, isForce, senderIsAdmin);
        if (sent) break;
      }
    }
  }
}

async function runAdminCommand(message, token, cfg, cmd, cmdName, parts, cmdArgs, cmdArgsStr, cleanLine, logChatId = "") {
  const chatId = message.chat.id;
  const senderId = message.from?.id;

  if (cmd === "/promote" || cmd === "/demote") {
    const right = await checkBotPermission(token, chatId, "can_promote_members");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    const target = await resolveTargetUser(token, message, parts);
    if (!target.id) {
      await safeSend(token, chatId, `Specify a target using ${cmd} @username / ${cmd} <user_id> or reply.`);
      return;
    }
    const isPromo = cmd === "/promote";
    try {
      await tgApi(token, "promoteChatMember", {
        chat_id: chatId,
        user_id: target.id,
        can_manage_chat: isPromo,
        can_delete_messages: isPromo,
        can_restrict_members: isPromo,
        can_invite_users: isPromo,
        can_pin_messages: isPromo,
        can_promote_members: false,
      });
      adminCache.delete(chatId);
      await safeSend(token, chatId, `${isPromo ? "Promoted" : "Demoted"} ${target.label}.`);
    } catch (err) {
      await safeSend(token, chatId, `${isPromo ? "Promote" : "Demote"} failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/title") {
    const right = await checkBotPermission(token, chatId, "can_promote_members");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    const target = await resolveTargetUser(token, message, parts);
    const titleStr = target.args.join(" ").trim();
    if (!target.id || !titleStr) {
      await safeSend(token, chatId, "Usage: /title [@user|id|reply] <custom_title>");
      return;
    }
    try {
      await tgApi(token, "setChatAdministratorCustomTitle", {
        chat_id: chatId,
        user_id: target.id,
        custom_title: titleStr.slice(0, 16),
      });
      adminCache.delete(chatId);
      await safeSend(token, chatId, `Updated title for ${target.label} to "${titleStr.slice(0, 16)}".`);
    } catch (err) {
      await safeSend(token, chatId, `Title update failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/admincache") {
    await getChatAdminsCached(token, chatId, true);
    await safeSend(token, chatId, "Admin cache refreshed.");
    return;
  }

  if (cmd === "/anonadmin") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /anonadmin <yes/no/on/off>");
      return;
    }
    cfg.anonAdmin = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Anonymous admin bypass set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/adminerror") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /adminerror <yes/no/on/off>");
      return;
    }
    cfg.adminError = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Admin error messages set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/reports") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /reports <yes/no/on/off>");
      return;
    }
    cfg.reportsEnabled = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Reports set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/raidmode") {
    const dur = parseDurationSeconds(cmdArgs[0]);
    if (dur !== null && dur > 0) {
      cfg.raid.enabled = true;
      cfg.raid.untilTs = Date.now() + dur * 1000;
      await saveChatConfig(chatId, cfg);
      await safeSend(token, chatId, `Raid mode enabled for ${dur}s.`);
      return;
    }
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /raidmode <yes/no/on/off|duration>");
      return;
    }
    cfg.raid.enabled = flag;
    cfg.raid.untilTs = flag ? Date.now() + (cfg.raid.actionSeconds || 600) * 1000 : 0;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Raid mode ${flag ? "enabled" : "disabled"}.`);
    return;
  }

  if (cmd === "/autoraid") {
    const val = (cmdArgs[0] || "").toLowerCase();
    if (["0", "off", "no"].includes(val)) {
      cfg.raid.autoThreshold = 0;
      await saveChatConfig(chatId, cfg);
      await safeSend(token, chatId, "Auto-raid disabled.");
      return;
    }
    const n = parseInt(val, 10);
    if (!n || n < 2) {
      await safeSend(token, chatId, "Usage: /autoraid <number|off>");
      return;
    }
    cfg.raid.autoThreshold = n;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Auto-raid threshold set to ${n} joins.`);
    return;
  }

  if (cmd === "/raidactiontime") {
    const secs = parseDurationSeconds(cmdArgs[0]);
    if (!secs || secs < 1) {
      await safeSend(token, chatId, "Usage: /raidactiontime <duration>");
      return;
    }
    cfg.raid.actionSeconds = secs;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Raid action duration set to ${secs}s.`);
    return;
  }

  if (cmd === "/slowmode") {
    const secs = parseDurationSeconds(cmdArgs[0]);
    if (secs === null) {
      await safeSend(token, chatId, "Usage: /slowmode <duration|off>");
      return;
    }
    try {
      await tgApi(token, "setChatSlowModeDelay", {
        chat_id: chatId,
        slow_mode_delay: Math.min(secs, 21600),
      });
      await safeSend(token, chatId, secs === 0 ? "Slow mode disabled." : `Slow mode set to ${secs}s.`);
    } catch (err) {
      await safeSend(token, chatId, `Slow mode failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/nightmode") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(
        token,
        chatId,
        `Night mode is ${cfg.nightMode.enabled ? "on" : "off"} (${cfg.nightMode.startHHMM} - ${cfg.nightMode.endHHMM} UTC).`
      );
      return;
    }
    cfg.nightMode.enabled = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Night mode set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/setnightmode") {
    const s = parseHHMMToMinutes(cmdArgs[0]);
    const e = parseHHMMToMinutes(cmdArgs[1]);
    if (s === null || e === null) {
      await safeSend(token, chatId, "Usage: /setnightmode <HH:MM> <HH:MM> (UTC)");
      return;
    }
    cfg.nightMode.startHHMM = cmdArgs[0].padStart(5, "0");
    cfg.nightMode.endHHMM = cmdArgs[1].padStart(5, "0");
    cfg.nightMode.enabled = true;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Night mode window set to ${cfg.nightMode.startHHMM} - ${cfg.nightMode.endHHMM} UTC.`);
    return;
  }

  if (cmd === "/approve") {
    const target = await resolveTargetUser(token, message, parts);
    if (!target.id) {
      await safeSend(token, chatId, "Specify a user to approve.");
      return;
    }
    if (!cfg.approvedUsers.includes(target.id)) cfg.approvedUsers.push(target.id);
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Approved ${target.label}.`);
    return;
  }

  if (cmd === "/unapprove") {
    const target = await resolveTargetUser(token, message, parts);
    if (!target.id) {
      await safeSend(token, chatId, "Specify a user to unapprove.");
      return;
    }
    cfg.approvedUsers = cfg.approvedUsers.filter((id) => id !== target.id);
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Unapproved ${target.label}.`);
    return;
  }

  if (cmd === "/approved") {
    await safeSend(
      token,
      chatId,
      cfg.approvedUsers.length ? `Approved IDs:\n${cfg.approvedUsers.join(", ")}` : "No approved users."
    );
    return;
  }

  if (cmd === "/unapproveall") {
    cfg.approvedUsers = [];
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "All users unapproved.");
    return;
  }

  if (cmd === "/setflood") {
    const val = (cmdArgs[0] || "").toLowerCase();
    if (["0", "off", "no"].includes(val)) {
      cfg.flood.limit = 0;
      await saveChatConfig(chatId, cfg);
      await safeSend(token, chatId, "Antiflood disabled.");
      return;
    }
    const n = parseInt(val, 10);
    if (!n || n < 1) {
      await safeSend(token, chatId, "Usage: /setflood <number/off/no>");
      return;
    }
    cfg.flood.limit = n;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Antiflood set to ${n} messages.`);
    return;
  }

  if (cmd === "/setfloodtimer") {
    if (["off", "no"].includes((cmdArgs[0] || "").toLowerCase())) {
      cfg.flood.timerCount = 0;
      cfg.flood.timerSeconds = 0;
      await saveChatConfig(chatId, cfg);
      await safeSend(token, chatId, "Timed antiflood disabled.");
      return;
    }
    const count = parseInt(cmdArgs[0], 10);
    const secs = parseDurationSeconds(cmdArgs[1]);
    if (!count || !secs) {
      await safeSend(token, chatId, "Usage: /setfloodtimer <count> <duration|off>");
      return;
    }
    cfg.flood.timerCount = count;
    cfg.flood.timerSeconds = secs;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Timed antiflood set to ${count} msgs / ${secs}s.`);
    return;
  }

  if (cmd === "/floodmode") {
    const m = (cmdArgs[0] || "").toLowerCase();
    if (!PUNISHMENT_ACTIONS.has(m)) {
      await safeSend(token, chatId, "Usage: /floodmode <ban/mute/kick/tban/tmute> [duration]");
      return;
    }
    const dur = cmdArgs[1] ? parseDurationSeconds(cmdArgs[1]) : 0;
    if (cmdArgs[1] && dur === null) {
      await safeSend(token, chatId, "Invalid duration.");
      return;
    }
    cfg.flood.action = m;
    cfg.flood.durationSeconds = dur || 0;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Flood mode set to ${m}${dur ? ` (${dur}s)` : ""}.`);
    return;
  }

  if (cmd === "/clearflood") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /clearflood <yes/no/on/off>");
      return;
    }
    cfg.flood.clearFlood = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Clear flood set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/addblocklist") {
    if (!cmdArgsStr) {
      await safeSend(token, chatId, "Usage: /addblocklist <trigger> [reason]");
      return;
    }
    const qMatch = cmdArgsStr.match(/^("[^"]+")(?:\s+([\s\S]*))?$/);
    const trigger = qMatch ? qMatch[1] : cmdArgs[0];
    const reason = qMatch ? (qMatch[2] || "").trim() : cmdArgs.slice(1).join(" ");
    cfg.blocklists = cfg.blocklists.filter((b) => b.trigger !== trigger);
    cfg.blocklists.push({ trigger, reason });
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Added blocklist trigger: ${trigger}`);
    return;
  }

  if (cmd === "/rmblocklist") {
    if (!cmdArgsStr) {
      await safeSend(token, chatId, "Usage: /rmblocklist <trigger>");
      return;
    }
    cfg.blocklists = cfg.blocklists.filter((b) => b.trigger !== cmdArgsStr);
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Removed blocklist trigger: ${cmdArgsStr}`);
    return;
  }

  if (cmd === "/unblocklistall") {
    const admins = await getChatAdminsCached(token, chatId);
    const creator = admins.find((a) => a.status === "creator");
    if (creator?.user?.id !== senderId) {
      await safeSend(token, chatId, "Only the group creator can clear all blocklists.");
      return;
    }
    cfg.blocklists = [];
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "Cleared all blocklists.");
    return;
  }

  if (cmd === "/blocklistmode") {
    const m = (cmdArgs[0] || "").toLowerCase();
    if (!BLOCKLIST_ACTIONS.has(m)) {
      await safeSend(token, chatId, "Usage: /blocklistmode <nothing/ban/mute/kick/warn/tban/tmute>");
      return;
    }
    cfg.blocklistMode = m;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Blocklist mode set to ${m}.`);
    return;
  }

  if (cmd === "/blocklistdelete") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /blocklistdelete <yes/no/on/off>");
      return;
    }
    cfg.blocklistDelete = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Blocklist message deletion set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/setblocklistreason") {
    cfg.blocklistReason = cmdArgsStr;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "Default blocklist reason updated.");
    return;
  }

  if (cmd === "/resetblocklistreason") {
    cfg.blocklistReason = "";
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "Default blocklist reason reset.");
    return;
  }

  if (cmd === "/cleancommand") {
    const valid = cmdArgs.map((t) => t.toLowerCase()).filter((t) => CLEAN_CMD_TYPES.has(t));
    if (!valid.length) {
      await safeSend(token, chatId, "Usage: /cleancommand <all/admin/user/other>");
      return;
    }
    cfg.cleanCommands = Array.from(new Set([...cfg.cleanCommands, ...valid]));
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Clean command types: ${cfg.cleanCommands.join(", ")}`);
    return;
  }

  if (cmd === "/keepcommand") {
    const toRemove = cmdArgs.map((t) => t.toLowerCase());
    cfg.cleanCommands = cfg.cleanCommands.filter((t) => !toRemove.includes(t));
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Active clean command types: ${cfg.cleanCommands.join(", ") || "none"}`);
    return;
  }

  if (cmd === "/lockwarns") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /lockwarns <yes/no/on/off>");
      return;
    }
    cfg.lockWarns = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Lock warnings set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/lock") {
    const [leftPart, rightPart] = cmdArgsStr.split("###");
    const items = (leftPart || "").trim().split(/\s+/).map((s) => s.toLowerCase()).filter(Boolean);
    if (!items.length) {
      await safeSend(token, chatId, "Usage: /lock <item(s)> [### reason {action}]");
      return;
    }

    if (rightPart !== undefined) {
      const trimmedRight = rightPart.trim();
      if (!trimmedRight) {
        for (const it of items) {
          if (it === "all") cfg.lockConfig = {};
          else delete cfg.lockConfig[it];
        }
        await saveChatConfig(chatId, cfg);
        await safeSend(token, chatId, "Reset custom lock action/reason.");
        return;
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
      await safeSend(token, chatId, `Locked ${items.join(", ")} with custom action/reason.`);
      return;
    }

    const invalid = items.filter((i) => !LOCK_TYPES.includes(i));
    if (invalid.length) {
      await safeSend(token, chatId, `Unknown lock type(s): ${invalid.join(", ")}`);
      return;
    }
    for (const it of items) cfg.locks[it] = true;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Locked: ${items.join(", ")}`);
    return;
  }

  if (cmd === "/unlock") {
    const items = cmdArgs.map((s) => s.toLowerCase());
    if (!items.length) {
      await safeSend(token, chatId, "Usage: /unlock <item(s)>");
      return;
    }
    for (const it of items) delete cfg.locks[it];
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Unlocked: ${items.join(", ")}`);
    return;
  }

  if (cmd === "/allowlist") {
    const replyEmojis = (message.reply_to_message?.entities || [])
      .filter((e) => e.type === "custom_emoji")
      .map((e) => e.custom_emoji_id);
    if (!cmdArgs.length && !replyEmojis.length) {
      await safeSend(
        token,
        chatId,
        cfg.allowlist.length ? `Allowlist:\n${cfg.allowlist.join("\n")}` : "Allowlist is empty."
      );
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
    await safeSend(token, chatId, "Allowlist updated.");
    return;
  }

  if (cmd === "/rmallowlist") {
    cfg.allowlist = cfg.allowlist.filter((it) => !cmdArgs.includes(it));
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "Removed specified items from allowlist.");
    return;
  }

  if (cmd === "/rmallowlistall") {
    cfg.allowlist = [];
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "Cleared all allowlisted items.");
    return;
  }

  if (cmd === "/filter") {
    const { triggers, content } = parseFilterInput(cmdArgsStr);
    if (!triggers.length || !content.trim()) {
      await safeSend(token, chatId, "Usage: /filter <trigger> <reply text>");
      return;
    }
    const filters = (await storeGet(`filters_v2:${chatId}`)) || [];
    for (const trig of triggers) {
      const idx = filters.findIndex((f) => f.trigger === trig);
      if (idx >= 0) filters[idx] = { trigger: trig, content };
      else filters.push({ trigger: trig, content });
    }
    await storeSet(`filters_v2:${chatId}`, filters);
    await safeSend(token, chatId, `Filter saved: ${triggers.join(", ")}`);
    return;
  }

  if (cmd === "/stop") {
    if (!cmdArgsStr) {
      await safeSend(token, chatId, "Usage: /stop <trigger>");
      return;
    }
    const filters = (await storeGet(`filters_v2:${chatId}`)) || [];
    const next = filters.filter((f) => f.trigger !== cmdArgsStr);
    await storeSet(`filters_v2:${chatId}`, next);
    await safeSend(token, chatId, `Filter removed: ${cmdArgsStr}`);
    return;
  }

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
    await safeSend(token, chatId, `Note saved as #${noteName}`);
    return;
  }

  if (cmd === "/clear") {
    const noteName = (cmdArgs[0] || "").trim().toLowerCase();
    if (!noteName) {
      await safeSend(token, chatId, "Usage: /clear <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    delete notes[noteName];
    await storeSet(`notes:${chatId}`, notes);
    await safeSend(token, chatId, `Note #${noteName} deleted.`);
    return;
  }

  if (cmd === "/welcome") {
    if ((cmdArgs[0] || "").toLowerCase() === "noformat") {
      const raw = cfg.greetings.welcomeText || "";
      const mediaTag = cfg.greetings.welcomeMedia ? `\n[Media: ${cfg.greetings.welcomeMedia.type}]` : "";
      await safeSend(token, chatId, `${raw}${mediaTag}` || "No welcome message set.");
      return;
    }
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /welcome <yes/no/on/off|noformat>");
      return;
    }
    cfg.greetings.welcomeEnabled = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Welcome messages ${flag ? "enabled" : "disabled"}.`);
    return;
  }

  if (cmd === "/goodbye") {
    if ((cmdArgs[0] || "").toLowerCase() === "noformat") {
      const raw = cfg.greetings.goodbyeText || "";
      const mediaTag = cfg.greetings.goodbyeMedia ? `\n[Media: ${cfg.greetings.goodbyeMedia.type}]` : "";
      await safeSend(token, chatId, `${raw}${mediaTag}` || "No goodbye message set.");
      return;
    }
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /goodbye <yes/no/on/off|noformat>");
      return;
    }
    cfg.greetings.goodbyeEnabled = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Goodbye messages ${flag ? "enabled" : "disabled"}.`);
    return;
  }

  if (cmd === "/cleanwelcome") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /cleanwelcome <yes/no/on/off>");
      return;
    }
    cfg.greetings.cleanWelcome = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Clean welcome set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/setwelcome" || cmd === "/setgoodbye") {
    const isWel = cmd === "/setwelcome";
    const repliedMedia = extractMediaFromMessage(message.reply_to_message);
    const directMedia = extractMediaFromMessage(message);
    const pickedMedia = repliedMedia || directMedia;
    const replyCaption =
      typeof message.reply_to_message?.caption === "string"
        ? message.reply_to_message.caption.trim()
        : typeof message.reply_to_message?.text === "string"
          ? message.reply_to_message.text.trim()
          : "";
    const nextText = cmdArgsStr || replyCaption || (pickedMedia ? "" : null);

    if (nextText === null && !pickedMedia) {
      await safeSend(token, chatId, `Usage: ${cmd} <text> (or reply to a photo/GIF/video/sticker with ${cmd})`);
      return;
    }

    if (isWel) {
      if (nextText !== null) cfg.greetings.welcomeText = nextText;
      if (pickedMedia) cfg.greetings.welcomeMedia = pickedMedia;
      else if (cmdArgsStr) cfg.greetings.welcomeMedia = null;
    } else {
      if (nextText !== null) cfg.greetings.goodbyeText = nextText;
      if (pickedMedia) cfg.greetings.goodbyeMedia = pickedMedia;
      else if (cmdArgsStr) cfg.greetings.goodbyeMedia = null;
    }

    await saveChatConfig(chatId, cfg);
    await safeSend(
      token,
      chatId,
      `${isWel ? "Welcome" : "Goodbye"} message updated${pickedMedia ? ` with ${pickedMedia.type}` : ""}.`
    );
    return;
  }

  if (cmd === "/resetwelcome" || cmd === "/resetgoodbye") {
    const def = getDefaultChatConfig().greetings;
    if (cmd === "/resetwelcome") {
      cfg.greetings.welcomeText = def.welcomeText;
      cfg.greetings.welcomeMedia = null;
    } else {
      cfg.greetings.goodbyeText = def.goodbyeText;
      cfg.greetings.goodbyeMedia = null;
    }
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `${cmd === "/resetwelcome" ? "Welcome" : "Goodbye"} message reset.`);
    return;
  }

  if (cmd === "/pin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    const targetMsgId = message.reply_to_message?.message_id;
    if (!targetMsgId) {
      await safeSend(token, chatId, "Reply to the message you want to pin with /pin.");
      return;
    }
    const silent = !cmdArgs.some((a) => ["loud", "notify"].includes(a.toLowerCase()));
    try {
      await tgApi(token, "pinChatMessage", {
        chat_id: chatId,
        message_id: targetMsgId,
        disable_notification: silent,
      });
      await safeSend(token, chatId, "Message pinned.");
    } catch (err) {
      await safeSend(token, chatId, `Pin failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/permapin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    if (!cmdArgsStr) {
      await safeSend(token, chatId, "Usage: /permapin <text>");
      return;
    }
    const filled = applyFillings(cmdArgsStr, message.from, message.chat, { rulesButton: cfg.rules.buttonText });
    const { text, replyMarkup } = extractButtonsFromText(filled);
    try {
      const sent = await tgApi(token, "sendMessage", {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
      });
      if (sent?.result?.message_id) {
        await tgApi(token, "pinChatMessage", {
          chat_id: chatId,
          message_id: sent.result.message_id,
          disable_notification: true,
        });
      }
    } catch (err) {
      await safeSend(token, chatId, `Permapin failed: ${err.message}`);
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
      await safeSend(token, chatId, "Message unpinned.");
    } catch (err) {
      await safeSend(token, chatId, `Unpin failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/unpinall") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    try {
      await tgApi(token, "unpinAllChatMessages", { chat_id: chatId });
      await safeSend(token, chatId, "Unpinned all messages.");
    } catch (err) {
      await safeSend(token, chatId, `Unpinall failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/antichannelpin") {
    if (!cmdArgs[0]) {
      await safeSend(token, chatId, `Anti-channel pin is ${cfg.pin.antiChannelPin ? "on" : "off"}.`);
      return;
    }
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /antichannelpin <yes/no/on/off>");
      return;
    }
    cfg.pin.antiChannelPin = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Anti-channel pin set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/cleanlinked") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /cleanlinked <yes/no/on/off>");
      return;
    }
    cfg.pin.cleanLinked = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Clean linked channel set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/del") {
    const right = await checkBotPermission(token, chatId, "can_delete_messages");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    if (message.reply_to_message) {
      await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.reply_to_message.message_id });
    }
    await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
    return;
  }

  if (cmd === "/purgefrom") {
    if (!message.reply_to_message) {
      await safeSend(token, chatId, "Reply to a message with /purgefrom.");
      return;
    }
    purgeFromState.set(chatId, message.reply_to_message.message_id);
    await safeSend(token, chatId, `Marked message ${message.reply_to_message.message_id} as purge start.`);
    return;
  }

  if (cmd === "/purgeto") {
    const right = await checkBotPermission(token, chatId, "can_delete_messages");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    const startId = purgeFromState.get(chatId);
    const endId = message.reply_to_message?.message_id || message.message_id;
    if (!startId) {
      await safeSend(token, chatId, "Use /purgefrom first.");
      return;
    }
    const from = Math.min(startId, endId);
    const to = Math.max(startId, endId);
    const ids = [];
    for (let id = from; id <= Math.min(to, from + 100); id++) ids.push(id);
    if (ids.length) await safeTgApi(token, "deleteMessages", { chat_id: chatId, message_ids: ids });
    purgeFromState.delete(chatId);
    await safeSend(token, chatId, `Purged ${ids.length} messages.`);
    return;
  }

  if (cmd === "/purge" || cmd === "/spurge") {
    const right = await checkBotPermission(token, chatId, "can_delete_messages");
    if (!right.ok) {
      await safeSend(token, chatId, right.message);
      return;
    }
    if (!message.reply_to_message) {
      await safeSend(token, chatId, "Reply to a message to purge from.");
      return;
    }
    const startId = message.reply_to_message.message_id;
    const countArg = parseInt(cmdArgs[0], 10);
    const endId = countArg && countArg > 0 ? startId + countArg : message.message_id;
    const ids = [];
    for (let id = startId; id <= Math.min(endId, startId + 100); id++) ids.push(id);
    if (ids.length) await safeTgApi(token, "deleteMessages", { chat_id: chatId, message_ids: ids });
    await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
    if (cmd === "/purge") {
      await safeSend(token, chatId, `Purged ${ids.length} messages.`);
    }
    return;
  }

  if (cmd === "/setrules") {
    if (!cmdArgsStr) {
      await safeSend(token, chatId, "Usage: /setrules <text>");
      return;
    }
    cfg.rules.text = cmdArgsStr;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "Chat rules updated.");
    return;
  }

  if (cmd === "/privaterules") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await safeSend(token, chatId, "Usage: /privaterules <yes/no/on/off>");
      return;
    }
    cfg.rules.privateRules = flag;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Private rules set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/resetrules") {
    cfg.rules.text = "";
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "Chat rules reset.");
    return;
  }

  if (cmd === "/setrulesbutton") {
    if (!cmdArgsStr) {
      await safeSend(token, chatId, "Usage: /setrulesbutton <label>");
      return;
    }
    cfg.rules.buttonText = cmdArgsStr;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Rules button set to "${cmdArgsStr}".`);
    return;
  }

  if (cmd === "/resetrulesbutton") {
    cfg.rules.buttonText = "Rules";
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "Rules button reset to default.");
    return;
  }

  if (cmd === "/warnmode") {
    const m = (cmdArgs[0] || "").toLowerCase();
    if (!PUNISHMENT_ACTIONS.has(m)) {
      await safeSend(token, chatId, "Usage: /warnmode <ban/mute/kick/tban/tmute> [duration]");
      return;
    }
    const dur = cmdArgs[1] ? parseDurationSeconds(cmdArgs[1]) : 0;
    if (cmdArgs[1] && dur === null) {
      await safeSend(token, chatId, "Invalid duration.");
      return;
    }
    cfg.warnings.mode = m;
    cfg.warnings.durationSeconds = dur || 0;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Warn mode set to ${m}.`);
    return;
  }

  if (cmd === "/warnlimit") {
    const n = parseInt(cmdArgs[0], 10);
    if (!n || n < 1) {
      await safeSend(token, chatId, "Usage: /warnlimit <number>");
      return;
    }
    cfg.warnings.limit = n;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Warn limit set to ${n}.`);
    return;
  }

  if (cmd === "/warntime") {
    const secs = parseDurationSeconds(cmdArgs[0]);
    if (secs === null) {
      await safeSend(token, chatId, "Usage: /warntime <time|off>");
      return;
    }
    cfg.warnings.timeSeconds = secs;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, secs === 0 ? "Warn expiration disabled." : `Warn expiration set to ${secs}s.`);
    return;
  }

  if (cmd === "/resetallwarns") {
    cfg.warnings.clearedAt = Date.now();
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, "All warnings cleared.");
    return;
  }

  const needsRestrictRight = new Set([
    "/ban", "/dban", "/sban", "/tban", "/unban",
    "/mute", "/dmute", "/smute", "/tmute", "/unmute",
    "/kick", "/dkick", "/skick",
    "/warn", "/dwarn", "/swarn"
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
      `Specify a target by replying to a message or using ${cmd} @username / ${cmd} <user_id>.`
    );
    return;
  }

  if (await isChatAdmin(token, chatId, target.id)) {
    await safeSend(
      token,
      chatId,
      `${target.label} is an administrator; I cannot perform ${cmd} on an admin.`
    );
    return;
  }

  try {
    if (["/ban", "/dban", "/sban", "/tban"].includes(cmd)) {
      const durSec = cmd === "/tban"
        ? parseDurationSeconds(target.args[0])
        : target.args[0] && parseDurationSeconds(target.args[0]) !== null
          ? parseDurationSeconds(target.args[0])
          : null;
      const reason = (durSec ? target.args.slice(1) : target.args).join(" ") || "No reason provided";

      if ((cmd === "/dban" || cmd === "/sban") && message.reply_to_message) {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.reply_to_message.message_id });
      }
      if (cmd === "/sban") {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
      }

      const resText = await applyPunishment(token, chatId, target.user || { id: target.id, username: target.label }, durSec ? "tban" : "ban", durSec || 0, reason, logChatId);
      if (cmd !== "/sban") {
        await safeSend(token, chatId, resText);
      }
      return;
    }

    if (cmd === "/unban") {
      await tgApi(token, "unbanChatMember", { chat_id: chatId, user_id: target.id, only_if_banned: true });
      await safeSend(token, chatId, `${target.label} unbanned.`);
      return;
    }

    if (["/kick", "/dkick", "/skick"].includes(cmd)) {
      const reason = target.args.join(" ") || "No reason provided";
      if ((cmd === "/dkick" || cmd === "/skick") && message.reply_to_message) {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.reply_to_message.message_id });
      }
      if (cmd === "/skick") {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
      }
      const resText = await applyPunishment(token, chatId, target.user || { id: target.id, username: target.label }, "kick", 0, reason, logChatId);
      if (cmd !== "/skick") {
        await safeSend(token, chatId, resText);
      }
      return;
    }

    if (["/mute", "/dmute", "/smute", "/tmute"].includes(cmd)) {
      const parsedDur = cmd === "/tmute"
        ? parseDurationSeconds(target.args[0])
        : target.args[0] && parseDurationSeconds(target.args[0]) !== null
          ? parseDurationSeconds(target.args[0])
          : null;
      const durSec = cmd === "/tmute" ? parsedDur ?? 600 : parsedDur;
      const reason = (parsedDur ? target.args.slice(1) : target.args).join(" ") || "No reason provided";

      if ((cmd === "/dmute" || cmd === "/smute") && message.reply_to_message) {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.reply_to_message.message_id });
      }
      if (cmd === "/smute") {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
      }

      const resText = await applyPunishment(token, chatId, target.user || { id: target.id, username: target.label }, durSec ? "tmute" : "mute", durSec || 0, reason, logChatId);
      if (cmd !== "/smute") {
        await safeSend(token, chatId, resText);
      }
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

    const warnKey = `warns:${chatId}:${target.id}`;
    let warns = (await storeGet(warnKey)) || [];
    if (cfg.warnings.clearedAt) {
      warns = warns.filter((w) => w.at > cfg.warnings.clearedAt);
    }

    if (["/warn", "/dwarn", "/swarn"].includes(cmd)) {
      const reason = target.args.join(" ") || "Warning";
      if (cmd === "/dwarn" && message.reply_to_message) {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.reply_to_message.message_id });
      }
      if (cmd === "/swarn") {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
        await applyWarning(token, chatId, target.user || { id: target.id, username: target.label }, reason, cfg, null, logChatId);
      } else {
        await applyWarning(token, chatId, target.user || { id: target.id, username: target.label }, reason, cfg, message.message_id, logChatId);
      }
      return;
    }

    if (cmd === "/warns") {
      if (!warns.length) {
        await safeSend(token, chatId, `${target.label} has no warnings.`);
        return;
      }
      const list = warns.map((w, idx) => `${idx + 1}. ${w.reason}`).join("\n");
      await safeSend(token, chatId, `Warnings for ${target.label} (${warns.length}/${cfg.warnings.limit}):\n${list}`);
      return;
    }

    if (cmd === "/rmwarn") {
      warns.pop();
      await storeSet(warnKey, warns);
      await safeSend(token, chatId, `Latest warning removed (${warns.length}/${cfg.warnings.limit}).`);
      return;
    }

    if (cmd === "/resetwarn") {
      await storeSet(warnKey, []);
      await safeSend(token, chatId, `All warnings cleared for ${target.label}.`);
    }
  } catch (err) {
    await safeSend(token, chatId, `Action failed: ${err.message}`);
  }
}

async function resolveTargetUser(token, message, parts) {
  const replied = message.reply_to_message?.from;
  if (replied?.id) {
    return {
      id: replied.id,
      label: replied.username ? `@${replied.username}` : `${replied.id}`,
      user: replied,
      args: parts.slice(1),
    };
  }

  const firstArg = (parts[1] || "").trim();
  if (/^\d+$/.test(firstArg)) {
    const id = Number(firstArg);
    return { id, label: firstArg, user: { id, first_name: firstArg }, args: parts.slice(2) };
  }

  if (/^@[a-zA-Z0-9_]{3,}$/.test(firstArg)) {
    const cachedUser = await storeGet(`user:${firstArg.slice(1).toLowerCase()}`);
    if (cachedUser?.id) {
      return { id: cachedUser.id, label: firstArg, user: cachedUser, args: parts.slice(2) };
    }
    try {
      const chatRes = await tgApi(token, "getChat", { chat_id: firstArg });
      if (chatRes?.result?.id) {
        return { id: chatRes.result.id, label: firstArg, user: chatRes.result, args: parts.slice(2) };
      }
    } catch {}
  }

  return { id: null, label: "", user: null, args: parts.slice(1) };
}

async function checkBotPermission(token, chatId, requiredPerm) {
  try {
    const me = await tgApi(token, "getMe", {});
    const botId = me?.result?.id;
    if (!botId) {
      return { ok: false, message: `Could not verify ${BOT_NAME} bot ID.` };
    }

    const memberRes = await tgApi(token, "getChatMember", {
      chat_id: chatId,
      user_id: botId,
    });
    const member = memberRes?.result;

    if (!member || (member.status !== "administrator" && member.status !== "creator")) {
      return {
        ok: false,
        message: `${BOT_NAME} does not have ADMIN rights in this group. Promote me to admin first.`,
      };
    }

    if (member.status === "creator") return { ok: true };

    if (requiredPerm && !member[requiredPerm]) {
      const permLabels = {
        can_pin_messages: "Pin Messages",
        can_restrict_members: "Ban / Restrict Members",
        can_invite_users: "Invite Users",
        can_delete_messages: "Delete Messages",
        can_promote_members: "Promote New Admins",
      };
      return {
        ok: false,
        message: `${BOT_NAME} is missing the "${permLabels[requiredPerm] || requiredPerm}" permission.`,
      };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Permission check failed: ${err.message}` };
  }
}

async function getChatAdminsCached(token, chatId, force = false) {
  const now = Date.now();
  const cached = adminCache.get(chatId);
  if (!force && cached && now - cached.ts < 5 * 60 * 1000) {
    return cached.admins;
  }
  try {
    const res = await tgApi(token, "getChatAdministrators", { chat_id: chatId });
    const admins = Array.isArray(res?.result) ? res.result : [];
    adminCache.set(chatId, { ts: now, admins });
    return admins;
  } catch {
    return cached?.admins || [];
  }
}

async function isChatAdmin(token, chatId, userId, senderChat = null, cfg = null) {
  if (!userId) return false;
  if (senderChat && senderChat.id === chatId && cfg?.anonAdmin) return true;
  const admins = await getChatAdminsCached(token, chatId);
  if (admins.some((a) => a.user?.id === userId)) return true;
  try {
    const res = await tgApi(token, "getChatMember", { chat_id: chatId, user_id: userId });
    return res?.result?.status === "creator" || res?.result?.status === "administrator";
  } catch {
    return false;
  }
}

async function safeSend(token, chatId, text, replyMarkup, replyToMessageId, protectContent = false, parseMode = undefined) {
  try {
    const payload = { chat_id: chatId, text };
    if (parseMode) payload.parse_mode = parseMode;
    if (replyMarkup) payload.reply_markup = replyMarkup;
    if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;
    if (protectContent) payload.protect_content = true;
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


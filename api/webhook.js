const BOT_NAME = "CricxCrate";
const memoryStore = new Map();
const adminCache = new Map();
const floodState = new Map();
const dupState = new Map();
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
  "cc:c:admin": {
    title: "Admin",
    body: [
      "<b>🛡️ Admin Management &amp; Rankings</b>",
      "──────────────────────",
      "• <b>/promote</b> [reply | @user | ID] — Promote a member to admin.",
      "• <b>/demote</b> [reply | @user | ID] — Demote an admin to member.",
      "• <b>/title</b> [reply | @user | ID] &lt;title&gt; — Set admin badge (max 16 chars).",
      "• <b>/adminlist</b> — Show all group admins and titles.",
      "• <b>/admincache</b> — Refresh cached admin list.",
      "• <b>/anonadmin</b> &lt;on|off&gt; — Bypass checks for anonymous admins.",
      "• <b>/adminerror</b> &lt;on|off&gt; — Show or hide non-admin notices.",
      "• <b>/adminrank</b> — View leaderboard of most active admins.",
      "• <b>/modstats</b> [reply | @user | ID] — View detailed admin activity &amp; mod counts.",
      "• <b>/resetmodstats</b> — Reset admin activity &amp; moderation rankings.",
      "",
      "<b>💡 Examples:</b>",
      "<code>/adminrank</code> • <code>/modstats @admin</code>"
    ].join("\n")
  },
  "cc:c:karma": {
    title: "Reputation & Karma",
    body: [
      "<b>⭐ Member Karma &amp; Reputation</b>",
      "──────────────────────",
      "• Reply to any member with <b>thanks</b>, <b>thank you</b>, <b>thx</b>, <b>ty</b>, or <b>+1</b> to award +1 Karma point.",
      "• <b>/karma</b> [reply | @user | ID] — Check a member's karma points &amp; rank.",
      "• <b>/topkarma</b> — Display the top 10 most helpful members in the chat.",
      "• <b>/karmaenable</b> &lt;on|off&gt; — Enable or disable karma points in this group.",
      "• <b>/setkarma</b> [reply | @user | ID] &lt;number&gt; — Set a member's karma score (admin).",
      "• <b>/resetkarma</b> — Clear all karma points in the group (admin).",
      "",
      "<b>💡 Examples:</b>",
      "<code>/karma</code> • <code>/topkarma</code> • <code>/karmaenable on</code>"
    ].join("\n")
  },
  "cc:c:approval": {
    title: "Approval & Watchlist",
    body: [
      "<b>✅ User Approvals &amp; Watchlist</b>",
      "──────────────────────",
      "• <b>/approve</b> [reply | @user | ID] — Exempt user from locks, flood, blocklists &amp; restrictions.",
      "• <b>/unapprove</b> [reply | @user | ID] — Remove approval exemption.",
      "• <b>/approval</b> [reply | @user | ID] — Check approval status.",
      "• <b>/approved</b> — List all approved user IDs.",
      "• <b>/unapproveall</b> — Clear all approved users.",
      "• <b>/watchlist</b> [reply | @user | ID] &lt;note&gt; — Add staff note on user.",
      "• <b>/unwatchlist</b> [reply | @user | ID] — Remove user watchlist note.",
      "• <b>/checkuser</b> [reply | @user | ID] — Inspect user status, warns, karma &amp; watchlist.",
      "",
      "<b>💡 Examples:</b>",
      "<code>/approve @trusted_user</code> • <code>/watchlist @user Link spam watch</code>"
    ].join("\n")
  },
  "cc:c:bans": {
    title: "Bans",
    body: [
      "<b>🔨 Ban Controls</b>",
      "──────────────────────",
      "• <b>/ban</b> [reply | @user | ID] [reason] — Ban a user permanently.",
      "• <b>/dban</b> [reason] — Delete replied message and ban sender.",
      "• <b>/sban</b> [reason] — Ban silently without reply.",
      "• <b>/tban</b> [reply | @user | ID] &lt;time&gt; [reason] — Temp ban (s/m/h/d/w).",
      "• <b>/unban</b> [reply | @user | ID] — Unban a user.",
      "",
      "<b>💡 Examples:</b>",
      "<code>/ban @spammer Spam links</code> • <code>/tban @user 2d</code>"
    ].join("\n")
  },
  "cc:c:mutes": {
    title: "Mutes",
    body: [
      "<b>🔇 Mute Controls</b>",
      "──────────────────────",
      "• <b>/mute</b> [reply | @user | ID] [reason] — Mute a user.",
      "• <b>/dmute</b> [reason] — Delete replied message and mute sender.",
      "• <b>/smute</b> [reason] — Mute silently without reply.",
      "• <b>/tmute</b> [reply | @user | ID] &lt;time&gt; [reason] — Temp mute (s/m/h/d/w).",
      "• <b>/unmute</b> [reply | @user | ID] — Unmute a user.",
      "",
      "<b>💡 Examples:</b>",
      "<code>/mute @user Flood</code> • <code>/tmute @user 30m</code>"
    ].join("\n")
  },
  "cc:c:kicks": {
    title: "Kicks",
    body: [
      "<b>👢 Kick Controls</b>",
      "──────────────────────",
      "• <b>/kick</b> [reply | @user | ID] [reason] — Kick user from group.",
      "• <b>/dkick</b> [reason] — Delete replied message and kick sender.",
      "• <b>/skick</b> [reason] — Kick silently without reply.",
      "• <b>/kickme</b> — Leave the group yourself.",
      "",
      "<b>💡 Examples:</b>",
      "<code>/kick @user Rule violation</code> • <code>/dkick</code>"
    ].join("\n")
  },
  "cc:c:warnings": {
    title: "Warnings",
    body: [
      "<b>⚠️ Warnings System</b>",
      "──────────────────────",
      "• <b>/warn</b> [reply | @user | ID] [reason] — Warn a user.",
      "• <b>/dwarn</b> [reason] — Delete replied message and warn sender.",
      "• <b>/swarn</b> [reason] — Warn silently without reply.",
      "• <b>/warns</b> [reply | @user | ID] — Check user warnings.",
      "• <b>/rmwarn</b> [reply | @user | ID] — Remove last warning.",
      "• <b>/resetwarn</b> [reply | @user | ID] — Clear all user warnings.",
      "• <b>/resetallwarns</b> — Clear warnings for everyone.",
      "• <b>/warnings</b> • <b>/warnlimit</b> &lt;n&gt; • <b>/warnmode</b> &lt;action&gt; • <b>/warntime</b> &lt;time|off&gt;",
      "",
      "<b>💡 Examples:</b>",
      "<code>/warn @user Be polite</code> • <code>/warnlimit 3</code>"
    ].join("\n")
  },
  "cc:c:locks": {
    title: "Locks & Allowlist",
    body: [
      "<b>🔒 Locks &amp; Allowlist (52 Types)</b>",
      "──────────────────────",
      "• <b>/lock</b> &lt;type(s)&gt; [### reason {action}] — Lock content or text types.",
      "• <b>/unlock</b> &lt;type(s)&gt; — Unlock content or text types.",
      "• <b>/lockall</b> • <b>/unlockall</b> — Lock or unlock entire chat for members.",
      "• <b>/locks</b> [list] • <b>/locktypes</b> • <b>/lockwarns</b> &lt;on|off&gt;",
      "• <b>/allowlist</b> [item|emojipack:&lt;&gt;] • <b>/rmallowlist</b> • <b>/rmallowlistall</b>",
      "",
      "<b>💡 Examples:</b>",
      "<code>/lock all</code> • <code>/lockall</code> • <code>/unlockall</code>"
    ].join("\n")
  },
  "cc:c:flood": {
    title: "Antiflood & Guards",
    body: [
      "<b>🌊 Antiflood &amp; Spam Guards</b>",
      "──────────────────────",
      "• <b>/flood</b> — View current flood settings.",
      "• <b>/setflood</b> &lt;number|off&gt; — Set consecutive message limit.",
      "• <b>/setfloodtimer</b> &lt;count&gt; &lt;time|off&gt; — Set timed flood limit.",
      "• <b>/floodmode</b> &lt;ban|mute|kick|tban|tmute&gt; [time] — Set flood action.",
      "• <b>/clearflood</b> &lt;on|off&gt; • <b>/floodslow</b> &lt;seconds|off&gt; — Auto-slowmode on flood.",
      "• <b>/dupguard</b> &lt;count|off&gt; [mute|ban|kick|warn] — Block repeated identical messages.",
      "• <b>/quarantine</b> &lt;duration|off&gt; — Restrict new joiners temporarily.",
      "",
      "<b>💡 Examples:</b>",
      "<code>/setflood 3</code> • <code>/dupguard 3 mute</code> • <code>/quarantine 5m</code>"
    ].join("\n")
  },
  "cc:c:blocklist": {
    title: "Blocklists",
    body: [
      "<b>🚫 Blocklist Rules</b>",
      "──────────────────────",
      "• <b>/addblocklist</b> &lt;word|\"phrase\"|wildcard&gt; [reason] — Add blocked term.",
      "• <b>/rmblocklist</b> &lt;trigger&gt; — Remove blocked term.",
      "• <b>/unblocklistall</b> — Clear all blocklists (creator only).",
      "• <b>/blocklist</b> • <b>/blocklistmode</b> • <b>/blocklistdelete</b>",
      "• <b>/setblocklistreason</b> &lt;text&gt; • <b>/resetblocklistreason</b>",
      "",
      "<b>💡 Examples:</b>",
      "<code>/addblocklist spam No spam</code> • <code>/blocklistmode warn</code>"
    ].join("\n")
  },
  "cc:c:filters": {
    title: "Filters",
    body: [
      "<b>💬 Auto-Reply Filters</b>",
      "──────────────────────",
      "• <b>/filter</b> &lt;trigger&gt; [reply] — Save auto-reply from text or replied item.",
      "• Supports <code>exact:</code>, <code>prefix:</code>, <code>(a, b)</code>, <code>%%%</code> variants, fillings &amp; buttons.",
      "• <b>/filters</b> — List active filters.",
      "• <b>/stop</b> &lt;trigger&gt; — Delete a filter.",
      "",
      "<b>💡 Examples:</b>",
      "<code>/filter hi Hey {first}!</code> • <code>/filter exact:rules Check /rules</code>"
    ].join("\n")
  },
  "cc:c:notes": {
    title: "Notes",
    body: [
      "<b>📝 Saved Notes</b>",
      "──────────────────────",
      "• <b>/save</b> &lt;name&gt; [content] — Save a note from text or replied item.",
      "• <b>/get</b> &lt;name&gt; [noformat] or <b>#&lt;name&gt;</b> — Show saved note.",
      "• <b>/notes</b> — List saved notes.",
      "• <b>/clear</b> &lt;name&gt; — Delete a note.",
      "",
      "<b>💡 Examples:</b>",
      "<code>/save schedule Match starts at 7:30 PM</code> • <code>#schedule</code>"
    ].join("\n")
  },
  "cc:c:greetings": {
    title: "Greetings",
    body: [
      "<b>👋 Welcome &amp; Goodbye</b>",
      "──────────────────────",
      "• <b>/setwelcome</b> [text | reply] — Set welcome message.",
      "• <b>/welcome</b> &lt;on|off|noformat&gt; • <b>/resetwelcome</b> • <b>/cleanwelcome</b> &lt;on|off&gt;",
      "• <b>/setgoodbye</b> [text | reply] — Set goodbye message.",
      "• <b>/goodbye</b> &lt;on|off|noformat&gt; • <b>/resetgoodbye</b>",
      "",
      "<b>💡 Examples:</b>",
      "<code>/setwelcome Welcome {first} to {chatname}!</code> • <code>/welcome on</code>"
    ].join("\n")
  },
  "cc:c:pin": {
    title: "Pin & Linked",
    body: [
      "<b>📌 Pin &amp; Linked Channel</b>",
      "──────────────────────",
      "• <b>/pinned</b> — Jump to pinned message.",
      "• <b>/pin</b> [loud|notify] (reply) — Pin message.",
      "• <b>/permapin</b> &lt;text&gt; — Send and pin message.",
      "• <b>/unpin</b> [reply] • <b>/unpinall</b>",
      "• <b>/antichannelpin</b> &lt;on|off&gt; • <b>/cleanlinked</b> &lt;on|off&gt;",
      "",
      "<b>💡 Examples:</b>",
      "<code>/pin loud</code> • <code>/permapin Live Match Thread!</code>"
    ].join("\n")
  },
  "cc:c:purges": {
    title: "Purges & Cleanup",
    body: [
      "<b>🧹 Purges &amp; Cleanup</b>",
      "──────────────────────",
      "• <b>/purge</b> [X] (reply) — Delete messages from replied message.",
      "• <b>/spurge</b> [X] (reply) — Purge silently.",
      "• <b>/del</b> (reply) — Delete replied message.",
      "• <b>/purgefrom</b> • <b>/purgeto</b>",
      "• <b>/cleanservice</b> &lt;on|off&gt; — Auto-delete join/leave/pin service messages.",
      "• <b>/cleancommand</b> &lt;all|admin|user|other&gt; • <b>/keepcommand</b> • <b>/cleancommandtypes</b>",
      "",
      "<b>💡 Examples:</b>",
      "<code>/purge</code> • <code>/purge 10</code> • <code>/cleanservice on</code>"
    ].join("\n")
  },
  "cc:c:rules": {
    title: "Rules",
    body: [
      "<b>📜 Group Rules</b>",
      "──────────────────────",
      "• <b>/rules</b> [noformat] — Show group rules.",
      "• <b>/setrules</b> &lt;text&gt; — Set group rules.",
      "• <b>/privaterules</b> &lt;on|off&gt; — Send rules via DM button.",
      "• <b>/resetrules</b> • <b>/setrulesbutton</b> &lt;label&gt; • <b>/resetrulesbutton</b>",
      "",
      "<b>💡 Examples:</b>",
      "<code>/setrules 1. No spam 2. Respect members</code> • <code>/rules</code>"
    ].join("\n")
  },
  "cc:c:raid_misc": {
    title: "Raid, Polls & Tools",
    body: [
      "<b>🛠️ Raid, Polls &amp; Tools</b>",
      "──────────────────────",
      "• <b>/poll</b> &lt;Question&gt; | &lt;Opt1&gt; | &lt;Opt2&gt; — Create a poll.",
      "• <b>/stoppoll</b> (reply to poll) — Stop an active poll.",
      "• <b>/raidmode</b> &lt;on|off|time&gt; • <b>/autoraid</b> &lt;n|off&gt; • <b>/raidactiontime</b> &lt;time&gt;",
      "• <b>/slowmode</b> &lt;time|off&gt; • <b>/nightmode</b> &lt;on|off&gt; • <b>/setnightmode</b> &lt;HH:MM&gt; &lt;HH:MM&gt;",
      "• <b>/invite</b> — Get or generate group invite link.",
      "• <b>/disable</b> &lt;cmd&gt; • <b>/enable</b> &lt;cmd&gt; • <b>/disabled</b> — Toggle user commands.",
      "• <b>/resetconfig</b> — Reset chat settings to default (creator only).",
      "• <b>/report</b> [reason] or <b>@admin</b> • <b>/reports</b> &lt;on|off&gt;",
      "• <b>/id</b> • <b>/info</b> [reply | @user | ID] • <b>/chatinfo</b>",
      "",
      "<b>💡 Examples:</b>",
      "<code>/poll Winner? | India | Australia</code> • <code>/invite</code> • <code>/disable id</code>"
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

    if (update.chat_member) {
      await handleChatMemberStatusUpdate(update.chat_member, token);
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
      await handleMessage(message, token, logChatId, Boolean(update.edited_message));
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
    cleanService: false,
    karmaEnabled: true,
    disabledCommands: [],
    approvedUsers: [],
    watchlist: {},
    modStats: {},
    karma: {},
    flood: {
      limit: 0,
      timerCount: 0,
      timerSeconds: 0,
      action: "ban",
      durationSeconds: 0,
      clearFlood: false,
      autoSlowSeconds: 0,
    },
    dupGuard: {
      limit: 0,
      action: "warn",
    },
    quarantine: {
      seconds: 0,
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
    dupGuard: { ...base.dupGuard, ...(existing.dupGuard || {}) },
    quarantine: { ...base.quarantine, ...(existing.quarantine || {}) },
    raid: { ...base.raid, ...(existing.raid || {}) },
    nightMode: { ...base.nightMode, ...(existing.nightMode || {}) },
    greetings: { ...base.greetings, ...(existing.greetings || {}) },
    pin: { ...base.pin, ...(existing.pin || {}) },
    rules: { ...base.rules, ...(existing.rules || {}) },
    warnings: { ...base.warnings, ...(existing.warnings || {}) },
    watchlist: { ...(existing.watchlist || {}) },
    modStats: { ...(existing.modStats || {}) },
    karma: { ...(existing.karma || {}) },
    approvedUsers: Array.isArray(existing.approvedUsers) ? existing.approvedUsers : [],
    disabledCommands: Array.isArray(existing.disabledCommands) ? existing.disabledCommands : [],
  };
}

async function saveChatConfig(chatId, cfg) {
  await storeSet(`cfg:${chatId}`, cfg);
}

function getUserDisplayLabel(userObj, fallbackId = "") {
  if (!userObj) return String(fallbackId || "User");
  if (userObj.username) return `@${userObj.username}`;
  const full = `${userObj.first_name || ""}${userObj.last_name ? ` ${userObj.last_name}` : ""}`.trim();
  return full || String(userObj.id || fallbackId || "User");
}

function computeAdminScore(st) {
  if (!st) return 0;
  const msgs = st.messages || 0;
  const actions = (st.ban || 0) + (st.tban || 0) + (st.mute || 0) + (st.tmute || 0) + (st.kick || 0) + (st.warn || 0);
  return msgs + actions * 5;
}

function getAdminRankBadge(score) {
  if (score >= 500) return "Legend";
  if (score >= 250) return "Commander";
  if (score >= 100) return "Guardian";
  if (score >= 30) return "Sentinel";
  return "Scout";
}

function getKarmaRankBadge(points) {
  if (points >= 100) return "Community Pillar";
  if (points >= 50) return "Top Helper";
  if (points >= 20) return "Trusted Member";
  if (points >= 5) return "Contributor";
  return "Member";
}

async function recordAdminActivity(chatId, userObj, actionKey = null) {
  if (!userObj?.id) return;
  const cfg = await getChatConfig(chatId);
  const k = String(userObj.id);
  const cur = cfg.modStats[k] || {
    name: getUserDisplayLabel(userObj, k),
    messages: 0,
    ban: 0,
    tban: 0,
    mute: 0,
    tmute: 0,
    kick: 0,
    warn: 0,
    lastActive: 0,
  };
  cur.name = getUserDisplayLabel(userObj, k);
  cur.lastActive = Date.now();
  if (actionKey) {
    cur[actionKey] = (cur[actionKey] || 0) + 1;
  } else {
    cur.messages = (cur.messages || 0) + 1;
  }
  cfg.modStats[k] = cur;
  await saveChatConfig(chatId, cfg);
}

function isThankYouMessage(text) {
  if (!text || text.startsWith("/")) return false;
  const cleaned = text.trim();
  if (cleaned.length > 120) return false;
  return /^(?:thanks?(?:\s+(?:a\s+lot|so\s+much|much|bro|bhai|mate|man|buddy|sir|ji|everyone))?|thank\s*(?:u|you)(?:\s+(?:so\s+much|a\s+lot|bro|bhai|mate|man|sir|ji))?|thx|ty|tysm|shukriya|dhanyawad|\+1)\b[!.,?\s]*$/i.test(
    cleaned
  );
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
      `<b>✨ ${BOT_NAME} — Moderation &amp; Community Suite</b>`,
      "──────────────────────",
      "Minimal, reliable group management with instant webhook execution and persistent storage.",
      "",
      "• <b>🛡️ Admin &amp; Ranks:</b> Promotions, custom titles, active admin leaderboard, approvals &amp; watchlist",
      "• <b>⭐ Member Karma:</b> Automatic thank-you points, member ranks &amp; top helper leaderboard",
      "• <b>🔨 Enforcement &amp; Tools:</b> Ban, mute, kick, warnings, 52 locks, antiflood, dup-guard, polls, filters &amp; notes",
      "",
      "Tap <b>Help</b> below to explore all commands."
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "📚 Help", callback_data: "cc:help_menu" },
          { text: "➕ Add to Group", url: addLink }
        ]
      ]
    }
  };
}

function buildHelpMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🛡️ Admin", callback_data: "cc:c:admin" },
        { text: "⭐ Karma", callback_data: "cc:c:karma" },
        { text: "✅ Approval", callback_data: "cc:c:approval" }
      ],
      [
        { text: "🔨 Bans", callback_data: "cc:c:bans" },
        { text: "🔇 Mutes", callback_data: "cc:c:mutes" },
        { text: "👢 Kicks", callback_data: "cc:c:kicks" }
      ],
      [
        { text: "⚠️ Warnings", callback_data: "cc:c:warnings" },
        { text: "🔒 Locks", callback_data: "cc:c:locks" },
        { text: "🌊 Antiflood", callback_data: "cc:c:flood" }
      ],
      [
        { text: "🚫 Blocklists", callback_data: "cc:c:blocklist" },
        { text: "💬 Filters", callback_data: "cc:c:filters" },
        { text: "📝 Notes", callback_data: "cc:c:notes" }
      ],
      [
        { text: "👋 Greetings", callback_data: "cc:c:greetings" },
        { text: "📌 Pin & Linked", callback_data: "cc:c:pin" },
        { text: "🧹 Purges", callback_data: "cc:c:purges" }
      ],
      [
        { text: "📜 Rules", callback_data: "cc:c:rules" },
        { text: "🛠️ Raid & Polls", callback_data: "cc:c:raid_misc" }
      ],
      [
        { text: "🏠 Overview", callback_data: "cc:intro" }
      ]
    ]
  };
}

function buildCategoryReturnKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📚 Help Menu", callback_data: "cc:help_menu" },
        { text: "🏠 Overview", callback_data: "cc:intro" }
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
  if (msg.audio?.file_id) {
    return { type: "audio", file_id: msg.audio.file_id };
  }
  if (msg.voice?.file_id) {
    return { type: "voice", file_id: msg.voice.file_id };
  }
  if (msg.document?.file_id) {
    return { type: "document", file_id: msg.document.file_id };
  }
  return null;
}

async function sendStoredMedia(token, chatId, media, caption, replyMarkup, replyToMessageId, protectContent = false) {
  if (!media?.file_id) return null;
  const base = { chat_id: chatId };
  if (replyMarkup) base.reply_markup = replyMarkup;
  if (replyToMessageId) base.reply_to_message_id = replyToMessageId;
  if (protectContent) base.protect_content = true;

  if (media.type === "animation") {
    return await safeTgApi(token, "sendAnimation", {
      ...base,
      animation: media.file_id,
      ...(caption ? { caption } : {}),
    });
  }
  if (media.type === "video") {
    return await safeTgApi(token, "sendVideo", {
      ...base,
      video: media.file_id,
      ...(caption ? { caption } : {}),
    });
  }
  if (media.type === "photo") {
    return await safeTgApi(token, "sendPhoto", {
      ...base,
      photo: media.file_id,
      ...(caption ? { caption } : {}),
    });
  }
  if (media.type === "audio") {
    return await safeTgApi(token, "sendAudio", {
      ...base,
      audio: media.file_id,
      ...(caption ? { caption } : {}),
    });
  }
  if (media.type === "voice") {
    return await safeTgApi(token, "sendVoice", {
      ...base,
      voice: media.file_id,
      ...(caption ? { caption } : {}),
    });
  }
  if (media.type === "document") {
    return await safeTgApi(token, "sendDocument", {
      ...base,
      document: media.file_id,
      ...(caption ? { caption } : {}),
    });
  }
  if (media.type === "sticker") {
    const sent = await safeTgApi(token, "sendSticker", {
      ...base,
      sticker: media.file_id,
    });
    if (caption) {
      await safeSend(token, chatId, caption, replyMarkup, replyToMessageId, protectContent);
    }
    return sent;
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
  const finalText = text || (media?.file_id ? "" : fallbackText);

  if (media?.file_id) {
    return await sendStoredMedia(token, chatId, media, finalText, replyMarkup);
  }

  return await safeSend(token, chatId, finalText, replyMarkup);
}

async function processNewMemberJoin(token, chatId, cfg, member, chat) {
  const now = Date.now();
  const rList = (raidJoinState.get(chatId) || []).filter((t) => now - t <= 20000);
  rList.push(now);
  raidJoinState.set(chatId, rList);

  if (cfg.raid.autoThreshold > 0 && rList.length >= cfg.raid.autoThreshold && !isRaidActive(cfg.raid)) {
    cfg.raid.enabled = true;
    cfg.raid.untilTs = now + (cfg.raid.actionSeconds || 600) * 1000;
    await saveChatConfig(chatId, cfg);
    await safeSend(token, chatId, `Auto-raid mode activated for ${cfg.raid.actionSeconds || 600}s.`);
  }

  if (isRaidActive(cfg.raid) && member?.id && !member.is_bot) {
    await safeTgApi(token, "banChatMember", { chat_id: chatId, user_id: member.id });
    await safeTgApi(token, "unbanChatMember", { chat_id: chatId, user_id: member.id, only_if_banned: true });
    return;
  }

  if (member?.id && !member.is_bot && !(cfg.approvedUsers || []).includes(member.id)) {
    const qKey = `quarantine:${chatId}:${member.id}`;
    const qSec = cfg.quarantine?.seconds || 0;
    if (qSec > 0) {
      await storeSet(qKey, now + qSec * 1000);
    }
  }

  if (cfg.greetings.welcomeEnabled) {
    if (cfg.greetings.cleanWelcome && cfg.greetings.lastWelcomeMsgId) {
      await safeTgApi(token, "deleteMessage", {
        chat_id: chatId,
        message_id: cfg.greetings.lastWelcomeMsgId,
      });
    }
    const sent = await sendGreetingPayload(token, chatId, cfg, "welcome", member, chat);
    if (sent?.ok && sent.result?.message_id) {
      cfg.greetings.lastWelcomeMsgId = sent.result.message_id;
      cfg.greetings.lastWelcomeTs = Date.now();
      await saveChatConfig(chatId, cfg);
    }
  }
}

async function processMemberLeave(token, chatId, cfg, member, chat) {
  if (!cfg.greetings.goodbyeEnabled || !member) return;
  const memberCountRes = await safeTgApi(token, "getChatMemberCount", { chat_id: chatId });
  const memberCount = typeof memberCountRes?.result === "number" ? memberCountRes.result : 0;
  if (memberCount <= 50) {
    await sendGreetingPayload(token, chatId, cfg, "goodbye", member, chat);
  }
}

async function handleChatMemberStatusUpdate(cm, token) {
  const chatId = cm.chat?.id;
  if (!chatId) return;
  const oldStatus = cm.old_chat_member?.status;
  const newStatus = cm.new_chat_member?.status;
  const user = cm.new_chat_member?.user || cm.old_chat_member?.user;
  if (!user || user.is_bot) return;

  const cfg = await getChatConfig(chatId);
  const wasIn = ["member", "administrator", "creator", "restricted"].includes(oldStatus);
  const isNowIn = ["member", "administrator", "creator", "restricted"].includes(newStatus);

  if (!wasIn && isNowIn) {
    await processNewMemberJoin(token, chatId, cfg, user, cm.chat);
  } else if (wasIn && !isNowIn) {
    await processMemberLeave(token, chatId, cfg, user, cm.chat);
  }
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
    const cfg = await getChatConfig(chatId);
    if (cfg.quarantine?.seconds > 0 && !joinReq.from?.is_bot && !(cfg.approvedUsers || []).includes(userId)) {
      await storeSet(`quarantine:${chatId}:${userId}`, Date.now() + cfg.quarantine.seconds * 1000);
    }
    if (cfg.greetings.welcomeEnabled && joinReq.from) {
      await sendGreetingPayload(token, chatId, cfg, "welcome", joinReq.from, joinReq.chat);
    }
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
    const menuText = `<b>📚 ${BOT_NAME} Help Menu</b>\n\nChoose a command category:`;
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
    if (messageId) {
      await safeTgApi(token, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: cat.body,
        parse_mode: "HTML",
        reply_markup: buildCategoryReturnKeyboard(),
      });
    } else {
      await safeSend(token, chatId, cat.body, buildCategoryReturnKeyboard(), undefined, false, "HTML");
    }
  }
}

function detectLockMatches(msg) {
  const matches = new Set(["all"]);
  const text = msg.text || msg.caption || "";
  const entities = msg.entities || msg.caption_entities || [];

  if (msg.media_group_id) {
    matches.add("album");
    matches.add("slideshow");
    matches.add("collage");
  }
  if (msg.sender_chat && msg.sender_chat.id === msg.chat.id) matches.add("anonchannel");
  if (msg.audio) matches.add("audio");
  if (msg.voice) {
    matches.add("voice");
    matches.add("audio");
  }
  if (msg.video_note) {
    matches.add("videonote");
    matches.add("audio");
  }
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
  if (msg.web_app_data) matches.add("widget");
  if (msg.external_reply) matches.add("externalreply");
  if (msg.dice) {
    matches.add("emojigame");
    matches.add("emoji");
  }

  if (msg.forward_origin || msg.forward_from || msg.forward_from_chat) {
    matches.add("forward");
    const t = msg.forward_origin?.type;
    if (t === "user" || t === "hidden_user" || msg.forward_from) matches.add("forwarduser");
    else if (t === "channel" || t === "chat" || msg.forward_from_chat) matches.add("forwardchannel");
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
  return { triggers: triggers.filter(Boolean), content: rest };
}

function buildDuplicateSignature(msg) {
  const txt = (msg.text || msg.caption || "").trim().toLowerCase();
  if (txt) return `txt:${txt}`;
  const m = extractMediaFromMessage(msg);
  if (m?.file_id) return `item:${m.type}:${m.file_id}`;
  return "";
}

async function sendEntryResponse(token, chatId, message, entry, isNoFormat = false, isForce = false, senderIsAdmin = false) {
  const rawContent = typeof entry === "string" ? entry : (entry?.content || "");
  const media = typeof entry === "object" && entry ? entry.media : null;

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

  const replyToId = hasReplyTag && message.reply_to_message
    ? message.reply_to_message.message_id
    : message.message_id;

  if (isNoFormat) {
    if (media?.file_id) {
      await sendStoredMedia(token, chatId, media, chosen, undefined, replyToId, hasProtect);
    } else {
      await safeSend(token, chatId, chosen || " ", undefined, replyToId, hasProtect);
    }
    return true;
  }

  const filled = applyFillings(chosen, message.from, message.chat);
  const { text, replyMarkup } = extractButtonsFromText(filled);

  if (media?.file_id) {
    await sendStoredMedia(token, chatId, media, text, replyMarkup, replyToId, hasProtect);
    return true;
  }

  await safeSend(token, chatId, text || " ", replyMarkup, replyToId, hasProtect);
  return true;
}

async function applyPunishment(token, chatId, targetUser, action, durationSeconds = 0, reason = "", logChatId = "", actorUser = null) {
  const untilDate = durationSeconds > 0 ? Math.floor(Date.now() / 1000) + durationSeconds : undefined;
  const label = targetUser?.username
    ? `@${targetUser.username}`
    : targetUser?.first_name || String(targetUser?.id || "");

  let out = "";
  if (action === "ban" || action === "tban") {
    const payload = { chat_id: chatId, user_id: targetUser.id };
    if (untilDate) payload.until_date = untilDate;
    await tgApi(token, "banChatMember", payload);
    out = action === "tban" && durationSeconds
      ? `I've temporarily banned ${label} (${durationSeconds}s)${reason ? `\nReason: ${reason}` : ""}`
      : `I've banned ${label}${reason ? `\nReason: ${reason}` : ""}`;
  } else if (action === "kick") {
    await tgApi(token, "banChatMember", { chat_id: chatId, user_id: targetUser.id });
    await tgApi(token, "unbanChatMember", { chat_id: chatId, user_id: targetUser.id, only_if_banned: true });
    out = `I've kicked ${label}${reason ? `\nReason: ${reason}` : ""}`;
  } else if (action === "mute" || action === "tmute") {
    const payload = {
      chat_id: chatId,
      user_id: targetUser.id,
      permissions: { can_send_messages: false },
    };
    if (untilDate) payload.until_date = untilDate;
    await tgApi(token, "restrictChatMember", payload);
    out = `I've muted ${label}${durationSeconds ? ` (${durationSeconds}s)` : ""}${reason ? `\nReason: ${reason}` : ""}`;
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }

  if (actorUser?.id) {
    await recordAdminActivity(chatId, actorUser, action);
  }
  if (logChatId) {
    await sendAuditLog(token, logChatId, `Chat ${chatId}: ${out.replace(/\n/g, " | ")}`);
  }
  return out;
}

async function applyWarning(token, chatId, targetUser, reason, cfg, replyToMessageId = null, logChatId = "", silent = false, actorUser = null) {
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

  if (actorUser?.id) {
    await recordAdminActivity(chatId, actorUser, "warn");
  }

  const label = targetUser?.username
    ? `@${targetUser.username}`
    : targetUser?.first_name || uid;

  if (warns.length >= (wCfg.limit || 3)) {
    await storeSet(warnKey, []);
    if (PUNISHMENT_ACTIONS.has(wCfg.mode)) {
      const msg = await applyPunishment(token, chatId, targetUser, wCfg.mode, wCfg.durationSeconds, reason, logChatId, actorUser);
      if (!silent) {
        await safeSend(token, chatId, `${msg} (reached ${wCfg.limit}/${wCfg.limit} warnings).`, undefined, replyToMessageId);
      }
      return;
    }
  }

  const text = `Warning (${warns.length}/${wCfg.limit || 3}) issued to ${label}.\nReason: ${reason || "Warning"}`;
  if (!silent) {
    await safeSend(token, chatId, text, undefined, replyToMessageId);
  }
  if (logChatId) {
    await sendAuditLog(token, logChatId, `Chat ${chatId}: ${text.replace(/\n/g, " | ")}`);
  }
}

async function runEnforcementAction(token, chatId, sender, mode, durationSeconds, reason, logChatId, actorUser = null) {
  if (!mode || mode === "nothing") return;
  if (mode === "warn") {
    await applyWarning(token, chatId, sender, reason, await getChatConfig(chatId), null, logChatId, false, actorUser);
    return;
  }
  if (!PUNISHMENT_ACTIONS.has(mode)) return;
  try {
    const resText = await applyPunishment(token, chatId, sender, mode, durationSeconds || 0, reason, logChatId, actorUser);
    await safeSend(token, chatId, resText);
  } catch (err) {
    await safeSend(token, chatId, `Action (${mode}) failed for ${sender?.first_name || sender?.id}: ${err.message}`);
  }
}

async function handleMessage(message, token, logChatId = "", isEdited = false) {
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

  if (message.reply_to_message?.from?.id) {
    const rf = message.reply_to_message.from;
    if (rf.username) {
      await storeSet(`user:${rf.username.toLowerCase()}`, {
        id: rf.id,
        first_name: rf.first_name,
        last_name: rf.last_name,
        username: rf.username,
      });
    }
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
        `<b>📚 ${BOT_NAME} Help Menu</b>\n\nChoose a command category:`,
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

  const isServiceMsg = Boolean(
    message.new_chat_members?.length > 0 ||
    message.left_chat_member ||
    message.pinned_message ||
    message.new_chat_title ||
    message.new_chat_photo ||
    message.delete_chat_photo ||
    message.group_chat_created ||
    message.supergroup_chat_created
  );

  if (isServiceMsg && cfg.cleanService) {
    await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
  }

  if (message.new_chat_members?.length > 0) {
    for (const member of message.new_chat_members) {
      if (member?.username && member?.id) {
        await storeSet(`user:${member.username.toLowerCase()}`, {
          id: member.id,
          first_name: member.first_name,
          last_name: member.last_name,
          username: member.username,
        });
      }
      await processNewMemberJoin(token, chatId, cfg, member, message.chat);
    }
    return;
  }

  if (message.left_chat_member) {
    await processMemberLeave(token, chatId, cfg, message.left_chat_member, message.chat);
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

  if (senderIsAdmin && senderId && !isEdited) {
    await recordAdminActivity(chatId, sender, null);
  }

  if (cmdName && !senderIsAdmin && (cfg.disabledCommands || []).includes(cmdName)) {
    return;
  }

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
      "promote", "demote", "title", "admincache", "anonadmin", "adminerror", "reports",
      "adminrank", "modstats", "resetmodstats", "watchlist", "unwatchlist", "checkuser",
      "karmaenable", "setkarma", "resetkarma",
      "approve", "unapprove", "approved", "unapproveall",
      "setflood", "setfloodtimer", "floodmode", "clearflood", "floodslow",
      "dupguard", "quarantine", "lockall", "unlockall", "cleanservice",
      "invite", "disable", "enable", "disabled", "resetconfig",
      "raidmode", "autoraid", "raidactiontime", "slowmode", "nightmode", "setnightmode",
      "poll", "stoppoll",
      "addblocklist", "rmblocklist", "unblocklistall", "blocklistmode",
      "blocklistdelete", "setblocklistreason", "resetblocklistreason",
      "cleancommand", "keepcommand",
      "lock", "unlock", "lockwarns", "allowlist", "rmallowlist", "rmallowlistall",
      "filter", "stop", "save", "clear",
      "welcome", "goodbye", "setwelcome", "resetwelcome", "setgoodbye", "resetgoodbye", "cleanwelcome",
      "pin", "permapin", "unpin", "unpinall", "antichannelpin", "cleanlinked",
      "purge", "spurge", "del", "purgefrom", "purgeto",
      "setrules", "privaterules", "resetrules", "setrulesbutton", "resetrulesbutton",
      "warn", "dwarn", "swarn", "rmwarn", "resetwarn", "resetallwarns",
      "warnmode", "warnlimit", "warntime",
      "ban", "dban", "sban", "tban", "unban",
      "mute", "dmute", "smute", "tmute", "unmute",
      "kick", "dkick", "skick"
    ]);
    const userKnownSet = new Set([
      "start", "help", "id", "info", "chatinfo", "adminlist", "approval", "flood", "blocklist",
      "cleancommandtypes", "locks", "locktypes", "filters", "get", "notes",
      "pinned", "rules", "warnings", "warns", "kickme", "report", "karma", "topkarma"
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
    const qUntil = Number((await storeGet(`quarantine:${chatId}:${senderId}`)) || 0);
    if (qUntil > Date.now()) {
      const hasRiskyContent = Boolean(
        rawText ||
        message.photo ||
        message.video ||
        message.animation ||
        message.document ||
        message.sticker ||
        message.forward_origin ||
        message.forward_from ||
        message.forward_from_chat
      );
      if (hasRiskyContent && !cmdName) {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
        return;
      }
    }

    if (isNightActive(cfg.nightMode)) {
      await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
      return;
    }

    const lockHits = detectLockMatches(message);
    const allowlisted = isAllowlisted(message, cfg);

    for (const lType of lockHits) {
      if (!cfg.locks[lType]) continue;
      if (allowlisted && ALLOWLISTABLE_LOCKS.has(lType)) continue;

      const delRes = await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
      if (!delRes?.ok) {
        await safeSend(
          token,
          chatId,
          `Locked (${lType}) triggered for ${sender.first_name}, but could not delete message (check bot delete permission).`
        );
      }
      const lConf = cfg.lockConfig[lType];
      const action = lConf?.action || (cfg.lockWarns ? "warn" : null);
      if (action) {
        await runEnforcementAction(
          token,
          chatId,
          sender,
          action,
          lConf?.durationSeconds || 0,
          lConf?.reason || `Locked item: ${lType}`,
          logChatId
        );
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
        await runEnforcementAction(token, chatId, sender, cfg.blocklistMode, 0, reason, logChatId);
        return;
      }
    }

    if (!isEdited && cfg.dupGuard?.limit > 1) {
      const sig = buildDuplicateSignature(message);
      if (sig) {
        const dKey = `${chatId}:${senderId}`;
        const prev = dupState.get(dKey) || { sig: "", count: 0, ts: 0 };
        const now = Date.now();
        const nextCount = prev.sig === sig && now - prev.ts <= 60000 ? prev.count + 1 : 1;
        dupState.set(dKey, { sig, count: nextCount, ts: now });
        if (nextCount >= cfg.dupGuard.limit) {
          dupState.set(dKey, { sig: "", count: 0, ts: 0 });
          await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
          await runEnforcementAction(
            token,
            chatId,
            sender,
            cfg.dupGuard.action || "warn",
            0,
            "Duplicate spam detected",
            logChatId
          );
          return;
        }
      }
    }

    if (!isEdited && (cfg.flood.limit > 0 || cfg.flood.timerCount > 0)) {
      const fKey = `${chatId}:${senderId}`;
      const now = Date.now();
      const storedSt = await storeGet(`flood:${fKey}`);
      const memSt = floodState.get(fKey);
      const st = storedSt && (!memSt || storedSt.count >= memSt.count)
        ? storedSt
        : memSt || { count: 0, ts: [] };

      st.count += 1;
      st.ts = Array.isArray(st.ts) ? [...st.ts, now] : [now];

      let tripped = false;
      if (cfg.flood.limit > 0 && st.count >= cfg.flood.limit) tripped = true;
      if (!tripped && cfg.flood.timerCount > 0 && cfg.flood.timerSeconds > 0) {
        st.ts = st.ts.filter((t) => now - t <= cfg.flood.timerSeconds * 1000);
        if (st.ts.length >= cfg.flood.timerCount) tripped = true;
      }

      floodState.set(fKey, st);
      await storeSet(`flood:${fKey}`, st);

      if (tripped) {
        const resetSt = { count: 0, ts: [] };
        floodState.set(fKey, resetSt);
        await storeSet(`flood:${fKey}`, resetSt);

        if (cfg.flood.clearFlood) {
          await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
        }

        if (cfg.flood.autoSlowSeconds > 0) {
          await safeTgApi(token, "setChatSlowModeDelay", {
            chat_id: chatId,
            slow_mode_delay: Math.min(cfg.flood.autoSlowSeconds, 21600),
          });
        }

        const action = PUNISHMENT_ACTIONS.has(cfg.flood.action) ? cfg.flood.action : "ban";
        await runEnforcementAction(
          token,
          chatId,
          sender,
          action,
          cfg.flood.durationSeconds || 0,
          "Antiflood limit reached",
          logChatId
        );
        return;
      }
    }
  } else if (senderId) {
    const resetSt = { count: 0, ts: [] };
    floodState.set(`${chatId}:${senderId}`, resetSt);
    await storeSet(`flood:${chatId}:${senderId}`, resetSt);
  }

  if (
    !isEdited &&
    cfg.karmaEnabled &&
    senderId &&
    message.reply_to_message?.from?.id &&
    !message.reply_to_message.from.is_bot &&
    message.reply_to_message.from.id !== senderId &&
    isThankYouMessage(rawText)
  ) {
    const receiver = message.reply_to_message.from;
    const cooldownKey = `karma_cd:${chatId}:${senderId}:${receiver.id}`;
    const lastGiven = Number((await storeGet(cooldownKey)) || 0);
    if (Date.now() - lastGiven >= 30000) {
      await storeSet(cooldownKey, Date.now());
      const rk = String(receiver.id);
      const curRec = cfg.karma[rk] || { name: getUserDisplayLabel(receiver, rk), points: 0 };
      curRec.name = getUserDisplayLabel(receiver, rk);
      curRec.points = (curRec.points || 0) + 1;
      cfg.karma[rk] = curRec;
      await saveChatConfig(chatId, cfg);

      const rankBadge = getKarmaRankBadge(curRec.points);
      await safeSend(
        token,
        chatId,
        `⭐ +1 Karma awarded to ${curRec.name} (Total: ${curRec.points} pts • ${rankBadge})`,
        undefined,
        message.message_id
      );
    }
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
      `<b>📚 ${BOT_NAME} Help Menu</b>\n\nChoose a command category:`,
      buildHelpMenuKeyboard(),
      undefined,
      false,
      "HTML"
    );
    return;
  }

  if (cmd === "/karma") {
    const target = await resolveTargetUser(token, message, parts);
    const uid = target.id || senderId;
    const uObj = target.user || sender;
    if (!uid) {
      await safeSend(token, chatId, "Reply to user or mention Telegram unique ID.", undefined, message.message_id);
      return;
    }
    const rec = cfg.karma?.[String(uid)] || { name: getUserDisplayLabel(uObj, uid), points: 0 };
    const pts = rec.points || 0;
    const badge = getKarmaRankBadge(pts);
    await safeSend(
      token,
      chatId,
      `⭐ Karma Profile\nUser: ${rec.name || getUserDisplayLabel(uObj, uid)}\nPoints: ${pts}\nRank: ${badge}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/topkarma") {
    const entries = Object.entries(cfg.karma || {})
      .map(([id, data]) => ({
        id,
        name: data?.name || `ID ${id}`,
        points: data?.points || 0,
      }))
      .filter((e) => e.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);

    if (!entries.length) {
      await safeSend(token, chatId, "No karma points recorded yet. Reply 'thanks' to helpful members!", undefined, message.message_id);
      return;
    }

    const lines = entries.map(
      (e, idx) => `${idx + 1}. ${e.name} — ${e.points} pts (${getKarmaRankBadge(e.points)})`
    );
    await safeSend(
      token,
      chatId,
      `🏆 Top Helpful Members\n──────────────────────\n${lines.join("\n")}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/adminrank") {
    const admins = await getChatAdminsCached(token, chatId);
    const ranked = admins
      .filter((a) => !a.user?.is_bot)
      .map((a) => {
        const uid = String(a.user.id);
        const st = cfg.modStats?.[uid] || {
          name: getUserDisplayLabel(a.user, uid),
          messages: 0,
          ban: 0,
          tban: 0,
          mute: 0,
          tmute: 0,
          kick: 0,
          warn: 0,
        };
        const actions = (st.ban || 0) + (st.tban || 0) + (st.mute || 0) + (st.tmute || 0) + (st.kick || 0) + (st.warn || 0);
        const msgs = st.messages || 0;
        const score = computeAdminScore(st);
        return {
          uid,
          name: st.name || getUserDisplayLabel(a.user, uid),
          msgs,
          actions,
          score,
          badge: getAdminRankBadge(score),
        };
      })
      .sort((a, b) => b.score - a.score);

    if (!ranked.length) {
      await safeSend(token, chatId, "No human admins found to rank.", undefined, message.message_id);
      return;
    }

    const lines = ranked.map(
      (r, idx) =>
        `${idx + 1}. ${r.name} [${r.badge}]\n   Score: ${r.score} pts (${r.msgs} msgs • ${r.actions} actions)`
    );
    await safeSend(
      token,
      chatId,
      `🛡️ Admin Activity Rankings\n──────────────────────\n${lines.join("\n")}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/id") {
    const replyId = message.reply_to_message?.from?.id;
    await safeSend(
      token,
      chatId,
      `Chat ID: ${chatId}\nYour ID: ${senderId ?? "N/A"}${replyId ? `\nReplied User ID: ${replyId}` : ""}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/info") {
    const target = await resolveTargetUser(token, message, parts);
    const u = target.user || sender;
    const watchNote = u?.id ? cfg.watchlist?.[String(u.id)] : "";
    const kPts = u?.id ? (cfg.karma?.[String(u.id)]?.points || 0) : 0;
    await safeSend(
      token,
      chatId,
      `User Info:\nName: ${u?.first_name || "N/A"}${u?.last_name ? ` ${u.last_name}` : ""}\nUsername: ${u?.username ? `@${u.username}` : "None"}\nID: ${u?.id ?? "N/A"}\nKarma: ${kPts} pts (${getKarmaRankBadge(kPts)})${watchNote ? `\nWatchlist: ${watchNote}` : ""}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/chatinfo") {
    const countRes = await safeTgApi(token, "getChatMemberCount", { chat_id: chatId });
    await safeSend(
      token,
      chatId,
      `Chat Info:\nTitle: ${message.chat.title || "Group"}\nID: ${chatId}\nType: ${message.chat.type}\nMembers: ${countRes?.result ?? "N/A"}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/report") {
    if (!cfg.reportsEnabled) {
      await safeSend(token, chatId, "Reports are disabled in this chat.", undefined, message.message_id);
      return;
    }
    if (!message.reply_to_message) {
      await safeSend(token, chatId, "Reply to user or mention Telegram unique ID.", undefined, message.message_id);
      return;
    }
    const admins = await getChatAdminsCached(token, chatId);
    const mentions = admins.map((a) => (a.user?.username ? `@${a.user.username}` : a.user?.first_name)).filter(Boolean);
    await safeSend(
      token,
      chatId,
      `Report sent to admins${mentions.length ? `: ${mentions.slice(0, 8).join(" ")}` : "."}${cmdArgsStr ? `\nReason: ${cmdArgsStr}` : ""}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (/^#[a-zA-Z0-9_-]+$/.test(normalizedText)) {
    const noteName = normalizedText.slice(1).toLowerCase();
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    if (notes[noteName]) {
      await sendEntryResponse(token, chatId, message, notes[noteName], false, false, senderIsAdmin);
    }
    return;
  }

  if (cmd === "/get") {
    const noteName = (cmdArgs[0] || "").toLowerCase();
    if (!noteName) {
      await safeSend(token, chatId, "Usage: /get <note_name>", undefined, message.message_id);
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    if (!notes[noteName]) {
      await safeSend(token, chatId, "Note not found.", undefined, message.message_id);
      return;
    }
    await sendEntryResponse(
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
      keys.length ? `Saved notes:\n${keys.map((k) => `#${k}`).join(", ")}` : "No saved notes.",
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/adminlist") {
    const admins = await getChatAdminsCached(token, chatId);
    const lines = admins.map((a) => {
      const role = a.status === "creator" ? " [Creator]" : "";
      const title = a.custom_title ? ` (${a.custom_title})` : "";
      const st = cfg.modStats?.[String(a.user.id)];
      const badge = !a.user.is_bot ? ` • ${getAdminRankBadge(computeAdminScore(st))}` : "";
      return `- ${a.user.first_name}${a.user.username ? ` (@${a.user.username})` : ""}${role}${title}${badge}`;
    });
    await safeSend(token, chatId, lines.length ? `Admins:\n${lines.join("\n")}` : "No admins found.", undefined, message.message_id);
    return;
  }

  if (cmd === "/approval") {
    const target = await resolveTargetUser(token, message, parts);
    const checkUser = target.id ? target : { id: senderId, label: sender?.username ? `@${sender.username}` : String(senderId) };
    const isApp = checkUser.id && cfg.approvedUsers.includes(checkUser.id);
    await safeSend(token, chatId, `${checkUser.label} is ${isApp ? "approved" : "not approved"}.`, undefined, message.message_id);
    return;
  }

  if (cmd === "/flood") {
    await safeSend(
      token,
      chatId,
      `Flood settings:\nLimit: ${cfg.flood.limit || "off"}\nTimer: ${cfg.flood.timerCount ? `${cfg.flood.timerCount} msgs / ${cfg.flood.timerSeconds}s` : "off"}\nAction: ${cfg.flood.action}\nClear flood: ${cfg.flood.clearFlood ? "on" : "off"}\nAuto-slow: ${cfg.flood.autoSlowSeconds ? `${cfg.flood.autoSlowSeconds}s` : "off"}`,
      undefined,
      message.message_id
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
      `Blocklist (mode: ${cfg.blocklistMode}, delete: ${cfg.blocklistDelete ? "on" : "off"}):\n${listStr}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/cleancommandtypes") {
    await safeSend(token, chatId, "Cleanable command types: all, admin, user, other", undefined, message.message_id);
    return;
  }

  if (cmd === "/locktypes") {
    await safeSend(token, chatId, `Lock types (${LOCK_TYPES.length}):\n${LOCK_TYPES.join(", ")}`, undefined, message.message_id);
    return;
  }

  if (cmd === "/locks") {
    const locked = Object.keys(cfg.locks).filter((k) => cfg.locks[k]);
    if (cmdArgs[0]?.toLowerCase() === "list") {
      await safeSend(token, chatId, `Locked: ${locked.join(", ") || "none"}\nAll: ${LOCK_TYPES.join(", ")}`, undefined, message.message_id);
    } else {
      await safeSend(token, chatId, `Currently locked:\n${locked.join(", ") || "none"}`, undefined, message.message_id);
    }
    return;
  }

  if (cmd === "/filters") {
    const filters = (await storeGet(`filters_v2:${chatId}`)) || [];
    await safeSend(
      token,
      chatId,
      filters.length ? `Active filters:\n${filters.map((f) => `- ${f.trigger}`).join("\n")}` : "No filters configured.",
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/pinned") {
    try {
      const chatRes = await tgApi(token, "getChat", { chat_id: chatId });
      const pId = chatRes?.result?.pinned_message?.message_id;
      if (!pId) {
        await safeSend(token, chatId, "No pinned message found.", undefined, message.message_id);
        return;
      }
      await safeSend(token, chatId, "Current pinned message.", undefined, pId);
    } catch (err) {
      await safeSend(token, chatId, `Failed to get pinned message: ${err.message}`, undefined, message.message_id);
    }
    return;
  }

  if (cmd === "/rules") {
    if (!cfg.rules.text) {
      await safeSend(token, chatId, "No rules have been set for this chat.", undefined, message.message_id);
      return;
    }
    if (cmdArgs[0]?.toLowerCase() === "noformat") {
      await safeSend(token, chatId, cfg.rules.text, undefined, message.message_id);
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
    await safeSend(token, chatId, text, replyMarkup, message.message_id);
    return;
  }

  if (cmd === "/warnings") {
    await safeSend(
      token,
      chatId,
      `Warning settings:\nLimit: ${cfg.warnings.limit}\nMode: ${cfg.warnings.mode}\nExpire time: ${cfg.warnings.timeSeconds ? `${cfg.warnings.timeSeconds}s` : "off"}`,
      undefined,
      message.message_id
    );
    return;
  }

  if (cmd === "/kickme") {
    if (!senderId) return;
    const right = await checkBotPermission(token, chatId, "can_restrict_members");
    if (!right.ok) {
      await safeSend(token, chatId, right.message, undefined, message.message_id);
      return;
    }
    try {
      const resText = await applyPunishment(token, chatId, sender, "kick", 0, "Used /kickme", logChatId);
      await safeSend(token, chatId, resText, undefined, message.message_id);
    } catch (err) {
      await safeSend(token, chatId, `Kick failed: ${err.message}`, undefined, message.message_id);
    }
    return;
  }

  const adminCommands = new Set([
    "/promote", "/demote", "/title", "/admincache", "/anonadmin", "/adminerror", "/reports",
    "/adminrank", "/modstats", "/resetmodstats", "/watchlist", "/unwatchlist", "/checkuser",
    "/karmaenable", "/setkarma", "/resetkarma",
    "/approve", "/unapprove", "/approved", "/unapproveall",
    "/setflood", "/setfloodtimer", "/floodmode", "/clearflood",
    "/floodslow", "/dupguard", "/quarantine", "/lockall", "/unlockall", "/cleanservice",
    "/invite", "/disable", "/enable", "/disabled", "/resetconfig",
    "/raidmode", "/autoraid", "/raidactiontime", "/slowmode", "/nightmode", "/setnightmode",
    "/poll", "/stoppoll",
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
        await safeSend(token, chatId, "Only group administrators can use this command.", undefined, message.message_id);
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
      const allowBot = /\{allow_bot\}/i.test(flt.content || "");
      if (sender?.is_bot && !allowBot) continue;
      if (matchFilterTrigger(flt.trigger, queryText)) {
        const sent = await sendEntryResponse(token, chatId, message, flt, isNoFormat, isForce, senderIsAdmin);
        if (sent) break;
      }
    }
  }
}

async function runAdminCommand(message, token, cfg, cmd, cmdName, parts, cmdArgs, cmdArgsStr, cleanLine, logChatId = "") {
  const chatId = message.chat.id;
  const senderId = message.from?.id;
  const adminMsgId = message.message_id;

  const replyAdmin = (text, replyMarkup) =>
    safeSend(token, chatId, text, replyMarkup, adminMsgId);

  if (cmd === "/karmaenable") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /karmaenable <on|off>");
      return;
    }
    cfg.karmaEnabled = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Member karma system set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/setkarma") {
    const target = await resolveTargetUser(token, message, parts);
    const val = parseInt(target.args[0], 10);
    if (!target.id || Number.isNaN(val)) {
      await replyAdmin("Usage: /setkarma [reply | @user | ID] <points>");
      return;
    }
    const rk = String(target.id);
    cfg.karma[rk] = {
      name: target.user ? getUserDisplayLabel(target.user, rk) : target.label,
      points: Math.max(0, val),
    };
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Set karma for ${target.label} to ${Math.max(0, val)} pts.`);
    return;
  }

  if (cmd === "/resetkarma") {
    cfg.karma = {};
    await saveChatConfig(chatId, cfg);
    await replyAdmin("All member karma points have been reset.");
    return;
  }

  if (cmd === "/lockall" || cmd === "/unlockall") {
    const right = await checkBotPermission(token, chatId, "can_restrict_members");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    const isLock = cmd === "/lockall";
    try {
      await tgApi(token, "setChatPermissions", {
        chat_id: chatId,
        permissions: isLock
          ? { can_send_messages: false }
          : {
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
      await replyAdmin(isLock ? "Chat locked for non-admin members." : "Chat unlocked for members.");
    } catch (err) {
      await replyAdmin(`Failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/cleanservice") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /cleanservice <on|off>");
      return;
    }
    cfg.cleanService = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Clean service messages set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/floodslow") {
    const secs = parseDurationSeconds(cmdArgs[0]);
    if (secs === null) {
      await replyAdmin("Usage: /floodslow <seconds|off>");
      return;
    }
    cfg.flood.autoSlowSeconds = secs;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(secs === 0 ? "Auto-slowmode on flood disabled." : `Auto-slowmode on flood set to ${secs}s.`);
    return;
  }

  if (cmd === "/dupguard") {
    const raw0 = (cmdArgs[0] || "").toLowerCase();
    if (["off", "no", "0"].includes(raw0)) {
      cfg.dupGuard.limit = 0;
      await saveChatConfig(chatId, cfg);
      await replyAdmin("Duplicate guard disabled.");
      return;
    }
    const n = parseInt(raw0, 10);
    const act = (cmdArgs[1] || "warn").toLowerCase();
    if (!n || n < 2 || !["warn", "ban", "mute", "kick", "tban", "tmute"].includes(act)) {
      await replyAdmin("Usage: /dupguard <count>=2+|off> [warn|ban|mute|kick]");
      return;
    }
    cfg.dupGuard.limit = n;
    cfg.dupGuard.action = act;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Duplicate guard set to ${n} repeats (${act}).`);
    return;
  }

  if (cmd === "/quarantine") {
    const secs = parseDurationSeconds(cmdArgs[0]);
    if (secs === null) {
      await replyAdmin("Usage: /quarantine <duration|off>");
      return;
    }
    cfg.quarantine.seconds = secs;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(secs === 0 ? "New member quarantine disabled." : `New member quarantine set to ${secs}s.`);
    return;
  }

  if (cmd === "/invite") {
    try {
      const chatRes = await tgApi(token, "getChat", { chat_id: chatId });
      let link = chatRes?.result?.invite_link || "";
      if (!link) {
        const exp = await tgApi(token, "exportChatInviteLink", { chat_id: chatId });
        link = exp?.result || "";
      }
      await replyAdmin(link ? `Group Invite Link:\n${link}` : "Could not fetch invite link.");
    } catch (err) {
      await replyAdmin(`Invite link failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/disable" || cmd === "/enable") {
    const targetCmd = (cmdArgs[0] || "").replace(/^\//, "").toLowerCase();
    if (!targetCmd) {
      await replyAdmin(`Usage: ${cmd} <command_name>`);
      return;
    }
    const set = new Set(cfg.disabledCommands || []);
    if (cmd === "/disable") set.add(targetCmd);
    else set.delete(targetCmd);
    cfg.disabledCommands = Array.from(set);
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`${cmd === "/disable" ? "Disabled" : "Enabled"} /${targetCmd} for non-admins.`);
    return;
  }

  if (cmd === "/disabled") {
    const list = cfg.disabledCommands || [];
    await replyAdmin(list.length ? `Disabled commands:\n${list.map((c) => `/${c}`).join(", ")}` : "No disabled commands.");
    return;
  }

  if (cmd === "/resetconfig") {
    const admins = await getChatAdminsCached(token, chatId);
    const creator = admins.find((a) => a.status === "creator");
    if (creator?.user?.id !== senderId) {
      await replyAdmin("Only the group creator can reset chat settings.");
      return;
    }
    await saveChatConfig(chatId, getDefaultChatConfig());
    await replyAdmin("Chat configuration reset to defaults.");
    return;
  }

  if (cmd === "/modstats") {
    const target = await resolveTargetUser(token, message, parts);
    const statId = target.id || senderId;
    const stats = cfg.modStats?.[String(statId)] || {
      name: target.id ? target.label : getUserDisplayLabel(message.from, statId),
      messages: 0,
      ban: 0,
      tban: 0,
      mute: 0,
      tmute: 0,
      kick: 0,
      warn: 0,
    };
    const score = computeAdminScore(stats);
    const badge = getAdminRankBadge(score);
    await replyAdmin(
      `🛡️ Admin Activity (${stats.name || `ID ${statId}`})\nRank: ${badge} (${score} pts)\nMessages: ${stats.messages || 0}\nBans: ${(stats.ban || 0) + (stats.tban || 0)} | Mutes: ${(stats.mute || 0) + (stats.tmute || 0)} | Kicks: ${stats.kick || 0} | Warns: ${stats.warn || 0}`
    );
    return;
  }

  if (cmd === "/resetmodstats") {
    cfg.modStats = {};
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Admin activity & moderation rankings reset.");
    return;
  }

  if (cmd === "/watchlist") {
    const target = await resolveTargetUser(token, message, parts);
    const noteText = target.args.join(" ").trim();
    if (!target.id || !noteText) {
      await replyAdmin("Usage: /watchlist [reply | @user | ID] <note>");
      return;
    }
    cfg.watchlist[String(target.id)] = noteText;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Watchlist note saved for ${target.label}.`);
    return;
  }

  if (cmd === "/unwatchlist") {
    const target = await resolveTargetUser(token, message, parts);
    if (!target.id) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    delete cfg.watchlist[String(target.id)];
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Removed watchlist note for ${target.label}.`);
    return;
  }

  if (cmd === "/checkuser") {
    const target = await resolveTargetUser(token, message, parts);
    if (!target.id) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    const isApp = (cfg.approvedUsers || []).includes(target.id);
    const wList = (await storeGet(`warns:${chatId}:${target.id}`)) || [];
    const wNote = cfg.watchlist?.[String(target.id)] || "None";
    const kPts = cfg.karma?.[String(target.id)]?.points || 0;
    await replyAdmin(
      `User Check (${target.label}):\nID: ${target.id}\nApproved: ${isApp ? "Yes" : "No"}\nKarma: ${kPts} pts (${getKarmaRankBadge(kPts)})\nWarnings: ${wList.length}/${cfg.warnings.limit}\nWatchlist: ${wNote}`
    );
    return;
  }

  if (cmd === "/poll") {
    const segments = cmdArgsStr
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const question = (segments[0] || "").slice(0, 300);
    const options = segments.slice(1, 11).map((o) => o.slice(0, 100));

    if (!question || options.length < 2) {
      await replyAdmin("Usage: /poll <Question> | <Option 1> | <Option 2> [| Option 3...]");
      return;
    }

    try {
      await tgApi(token, "sendPoll", {
        chat_id: chatId,
        question,
        options,
        is_anonymous: true,
        allows_multiple_answers: false,
      });
    } catch (err) {
      await replyAdmin(`Poll failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/stoppoll") {
    const targetMsgId = message.reply_to_message?.message_id;
    if (!targetMsgId) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    try {
      await tgApi(token, "stopPoll", {
        chat_id: chatId,
        message_id: targetMsgId,
      });
      await replyAdmin("Poll stopped.");
    } catch (err) {
      await replyAdmin(`Stop poll failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/promote" || cmd === "/demote") {
    const right = await checkBotPermission(token, chatId, "can_promote_members");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    const target = await resolveTargetUser(token, message, parts);
    if (!target.id) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
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
      await replyAdmin(`${isPromo ? "Promoted" : "Demoted"} ${target.label}.`);
    } catch (err) {
      await replyAdmin(`${isPromo ? "Promote" : "Demote"} failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/title") {
    const right = await checkBotPermission(token, chatId, "can_promote_members");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    const target = await resolveTargetUser(token, message, parts);
    const titleStr = target.args.join(" ").trim();
    if (!target.id || !titleStr) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    try {
      await tgApi(token, "setChatAdministratorCustomTitle", {
        chat_id: chatId,
        user_id: target.id,
        custom_title: titleStr.slice(0, 16),
      });
      adminCache.delete(chatId);
      await replyAdmin(`Updated title for ${target.label} to "${titleStr.slice(0, 16)}".`);
    } catch (err) {
      await replyAdmin(`Title update failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/admincache") {
    await getChatAdminsCached(token, chatId, true);
    await replyAdmin("Admin cache refreshed.");
    return;
  }

  if (cmd === "/anonadmin") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /anonadmin <yes/no/on/off>");
      return;
    }
    cfg.anonAdmin = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Anonymous admin bypass set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/adminerror") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /adminerror <yes/no/on/off>");
      return;
    }
    cfg.adminError = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Admin error messages set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/reports") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /reports <yes/no/on/off>");
      return;
    }
    cfg.reportsEnabled = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Reports set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/raidmode") {
    const dur = parseDurationSeconds(cmdArgs[0]);
    if (dur !== null && dur > 0) {
      cfg.raid.enabled = true;
      cfg.raid.untilTs = Date.now() + dur * 1000;
      await saveChatConfig(chatId, cfg);
      await replyAdmin(`Raid mode enabled for ${dur}s.`);
      return;
    }
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /raidmode <yes/no/on/off|duration>");
      return;
    }
    cfg.raid.enabled = flag;
    cfg.raid.untilTs = flag ? Date.now() + (cfg.raid.actionSeconds || 600) * 1000 : 0;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Raid mode ${flag ? "enabled" : "disabled"}.`);
    return;
  }

  if (cmd === "/autoraid") {
    const val = (cmdArgs[0] || "").toLowerCase();
    if (["0", "off", "no"].includes(val)) {
      cfg.raid.autoThreshold = 0;
      await saveChatConfig(chatId, cfg);
      await replyAdmin("Auto-raid disabled.");
      return;
    }
    const n = parseInt(val, 10);
    if (!n || n < 2) {
      await replyAdmin("Usage: /autoraid <number|off>");
      return;
    }
    cfg.raid.autoThreshold = n;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Auto-raid threshold set to ${n} joins.`);
    return;
  }

  if (cmd === "/raidactiontime") {
    const secs = parseDurationSeconds(cmdArgs[0]);
    if (!secs || secs < 1) {
      await replyAdmin("Usage: /raidactiontime <duration>");
      return;
    }
    cfg.raid.actionSeconds = secs;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Raid action duration set to ${secs}s.`);
    return;
  }

  if (cmd === "/slowmode") {
    const secs = parseDurationSeconds(cmdArgs[0]);
    if (secs === null) {
      await replyAdmin("Usage: /slowmode <duration|off>");
      return;
    }
    try {
      await tgApi(token, "setChatSlowModeDelay", {
        chat_id: chatId,
        slow_mode_delay: Math.min(secs, 21600),
      });
      await replyAdmin(secs === 0 ? "Slow mode disabled." : `Slow mode set to ${secs}s.`);
    } catch (err) {
      await replyAdmin(`Slow mode failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/nightmode") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin(
        `Night mode is ${cfg.nightMode.enabled ? "on" : "off"} (${cfg.nightMode.startHHMM} - ${cfg.nightMode.endHHMM} UTC).`
      );
      return;
    }
    cfg.nightMode.enabled = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Night mode set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/setnightmode") {
    const s = parseHHMMToMinutes(cmdArgs[0]);
    const e = parseHHMMToMinutes(cmdArgs[1]);
    if (s === null || e === null) {
      await replyAdmin("Usage: /setnightmode <HH:MM> <HH:MM> (UTC)");
      return;
    }
    cfg.nightMode.startHHMM = cmdArgs[0].padStart(5, "0");
    cfg.nightMode.endHHMM = cmdArgs[1].padStart(5, "0");
    cfg.nightMode.enabled = true;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Night mode window set to ${cfg.nightMode.startHHMM} - ${cfg.nightMode.endHHMM} UTC.`);
    return;
  }

  if (cmd === "/approve") {
    const target = await resolveTargetUser(token, message, parts);
    if (!target.id) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    if (!cfg.approvedUsers.includes(target.id)) cfg.approvedUsers.push(target.id);
    await storeSet(`quarantine:${chatId}:${target.id}`, 0);
    await safeTgApi(token, "restrictChatMember", {
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
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Approved ${target.label}. Locks and restrictions will not apply.`);
    return;
  }

  if (cmd === "/unapprove") {
    const target = await resolveTargetUser(token, message, parts);
    if (!target.id) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    cfg.approvedUsers = cfg.approvedUsers.filter((id) => id !== target.id);
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Unapproved ${target.label}.`);
    return;
  }

  if (cmd === "/approved") {
    await replyAdmin(
      cfg.approvedUsers.length ? `Approved IDs:\n${cfg.approvedUsers.join(", ")}` : "No approved users."
    );
    return;
  }

  if (cmd === "/unapproveall") {
    cfg.approvedUsers = [];
    await saveChatConfig(chatId, cfg);
    await replyAdmin("All users unapproved.");
    return;
  }

  if (cmd === "/setflood") {
    const val = (cmdArgs[0] || "").toLowerCase();
    if (["0", "off", "no"].includes(val)) {
      cfg.flood.limit = 0;
      await saveChatConfig(chatId, cfg);
      await replyAdmin("Antiflood disabled.");
      return;
    }
    const n = parseInt(val, 10);
    if (!n || n < 1) {
      await replyAdmin("Usage: /setflood <number/off/no>");
      return;
    }
    cfg.flood.limit = n;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Antiflood set to ${n} messages.`);
    return;
  }

  if (cmd === "/setfloodtimer") {
    if (["off", "no"].includes((cmdArgs[0] || "").toLowerCase())) {
      cfg.flood.timerCount = 0;
      cfg.flood.timerSeconds = 0;
      await saveChatConfig(chatId, cfg);
      await replyAdmin("Timed antiflood disabled.");
      return;
    }
    const count = parseInt(cmdArgs[0], 10);
    const secs = parseDurationSeconds(cmdArgs[1]);
    if (!count || !secs) {
      await replyAdmin("Usage: /setfloodtimer <count> <duration|off>");
      return;
    }
    cfg.flood.timerCount = count;
    cfg.flood.timerSeconds = secs;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Timed antiflood set to ${count} msgs / ${secs}s.`);
    return;
  }

  if (cmd === "/floodmode") {
    const m = (cmdArgs[0] || "").toLowerCase();
    if (!PUNISHMENT_ACTIONS.has(m)) {
      await replyAdmin("Usage: /floodmode <ban/mute/kick/tban/tmute> [duration]");
      return;
    }
    const dur = cmdArgs[1] ? parseDurationSeconds(cmdArgs[1]) : 0;
    if (cmdArgs[1] && dur === null) {
      await replyAdmin("Invalid duration.");
      return;
    }
    cfg.flood.action = m;
    cfg.flood.durationSeconds = dur || 0;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Flood mode set to ${m}${dur ? ` (${dur}s)` : ""}.`);
    return;
  }

  if (cmd === "/clearflood") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /clearflood <yes/no/on/off>");
      return;
    }
    cfg.flood.clearFlood = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Clear flood set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/addblocklist") {
    if (!cmdArgsStr) {
      await replyAdmin("Usage: /addblocklist <trigger> [reason]");
      return;
    }
    const qMatch = cmdArgsStr.match(/^("[^"]+")(?:\s+([\s\S]*))?$/);
    const trigger = qMatch ? qMatch[1] : cmdArgs[0];
    const reason = qMatch ? (qMatch[2] || "").trim() : cmdArgs.slice(1).join(" ");
    cfg.blocklists = cfg.blocklists.filter((b) => b.trigger !== trigger);
    cfg.blocklists.push({ trigger, reason });
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Added blocklist trigger: ${trigger}`);
    return;
  }

  if (cmd === "/rmblocklist") {
    if (!cmdArgsStr) {
      await replyAdmin("Usage: /rmblocklist <trigger>");
      return;
    }
    cfg.blocklists = cfg.blocklists.filter((b) => b.trigger !== cmdArgsStr);
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Removed blocklist trigger: ${cmdArgsStr}`);
    return;
  }

  if (cmd === "/unblocklistall") {
    const admins = await getChatAdminsCached(token, chatId);
    const creator = admins.find((a) => a.status === "creator");
    if (creator?.user?.id !== senderId) {
      await replyAdmin("Only the group creator can clear all blocklists.");
      return;
    }
    cfg.blocklists = [];
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Cleared all blocklists.");
    return;
  }

  if (cmd === "/blocklistmode") {
    const m = (cmdArgs[0] || "").toLowerCase();
    if (!BLOCKLIST_ACTIONS.has(m)) {
      await replyAdmin("Usage: /blocklistmode <nothing/ban/mute/kick/warn/tban/tmute>");
      return;
    }
    cfg.blocklistMode = m;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Blocklist mode set to ${m}.`);
    return;
  }

  if (cmd === "/blocklistdelete") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /blocklistdelete <yes/no/on/off>");
      return;
    }
    cfg.blocklistDelete = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Blocklist message deletion set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/setblocklistreason") {
    cfg.blocklistReason = cmdArgsStr;
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Default blocklist reason updated.");
    return;
  }

  if (cmd === "/resetblocklistreason") {
    cfg.blocklistReason = "";
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Default blocklist reason reset.");
    return;
  }

  if (cmd === "/cleancommand") {
    const valid = cmdArgs.map((t) => t.toLowerCase()).filter((t) => CLEAN_CMD_TYPES.has(t));
    if (!valid.length) {
      await replyAdmin("Usage: /cleancommand <all/admin/user/other>");
      return;
    }
    cfg.cleanCommands = Array.from(new Set([...cfg.cleanCommands, ...valid]));
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Clean command types: ${cfg.cleanCommands.join(", ")}`);
    return;
  }

  if (cmd === "/keepcommand") {
    const toRemove = cmdArgs.map((t) => t.toLowerCase());
    cfg.cleanCommands = cfg.cleanCommands.filter((t) => !toRemove.includes(t));
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Active clean command types: ${cfg.cleanCommands.join(", ") || "none"}`);
    return;
  }

  if (cmd === "/lockwarns") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /lockwarns <yes/no/on/off>");
      return;
    }
    cfg.lockWarns = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Lock warnings set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/lock") {
    const [leftPart, rightPart] = cmdArgsStr.split("###");
    const items = (leftPart || "").trim().split(/\s+/).map((s) => s.toLowerCase()).filter(Boolean);
    if (!items.length) {
      await replyAdmin("Usage: /lock <item(s)> [### reason {action}]");
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
        await replyAdmin("Reset custom lock action/reason.");
        return;
      }
      const actMatch = trimmedRight.match(/\{(ban|mute|kick|tban|tmute|warn)\}/i);
      const action = actMatch ? actMatch[1].toLowerCase() : null;
      const reason = trimmedRight.replace(/\{[^}]+\}/g, "").trim();
      const validCustom = items.filter((it) => LOCK_TYPES.includes(it));
      if (!validCustom.length) {
        await replyAdmin(`Unknown lock type(s): ${items.join(", ")}`);
        return;
      }
      for (const it of validCustom) {
        cfg.locks[it] = true;
        cfg.lockConfig[it] = { action, reason, durationSeconds: 0 };
      }
      await saveChatConfig(chatId, cfg);
      await replyAdmin(`Locked ${validCustom.join(", ")} with custom action/reason.`);
      return;
    }

    const invalid = items.filter((i) => !LOCK_TYPES.includes(i));
    if (invalid.length) {
      await replyAdmin(`Unknown lock type(s): ${invalid.join(", ")}`);
      return;
    }
    for (const it of items) cfg.locks[it] = true;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Locked: ${items.join(", ")}`);
    return;
  }

  if (cmd === "/unlock") {
    const items = cmdArgs.map((s) => s.toLowerCase());
    if (!items.length) {
      await replyAdmin("Usage: /unlock <item(s)>");
      return;
    }
    for (const it of items) delete cfg.locks[it];
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Unlocked: ${items.join(", ")}`);
    return;
  }

  if (cmd === "/allowlist") {
    const replyEmojis = (message.reply_to_message?.entities || [])
      .filter((e) => e.type === "custom_emoji")
      .map((e) => e.custom_emoji_id);
    if (!cmdArgs.length && !replyEmojis.length) {
      await replyAdmin(
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
    await replyAdmin("Allowlist updated.");
    return;
  }

  if (cmd === "/rmallowlist") {
    cfg.allowlist = cfg.allowlist.filter((it) => !cmdArgs.includes(it));
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Removed specified items from allowlist.");
    return;
  }

  if (cmd === "/rmallowlistall") {
    cfg.allowlist = [];
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Cleared all allowlisted items.");
    return;
  }

  if (cmd === "/filter") {
    const { triggers, content } = parseFilterInput(cmdArgsStr);
    const repliedMedia = extractMediaFromMessage(message.reply_to_message);
    const directMedia = extractMediaFromMessage(message);
    const pickedMedia = repliedMedia || directMedia;
    const replyCaption =
      typeof message.reply_to_message?.caption === "string"
        ? message.reply_to_message.caption.trim()
        : typeof message.reply_to_message?.text === "string"
          ? message.reply_to_message.text.trim()
          : "";
    const finalContent = content.trim() || (!pickedMedia ? replyCaption : "");

    if (!triggers.length || (!finalContent && !pickedMedia)) {
      await replyAdmin("Usage: /filter <trigger> <reply text> (or reply to a message with /filter <trigger>)");
      return;
    }
    const filters = (await storeGet(`filters_v2:${chatId}`)) || [];
    for (const trig of triggers) {
      const idx = filters.findIndex((f) => f.trigger === trig);
      const entry = { trigger: trig, content: finalContent, media: pickedMedia || null };
      if (idx >= 0) filters[idx] = entry;
      else filters.push(entry);
    }
    await storeSet(`filters_v2:${chatId}`, filters);
    await replyAdmin(`Filter saved: ${triggers.join(", ")}`);
    return;
  }

  if (cmd === "/stop") {
    if (!cmdArgsStr) {
      await replyAdmin("Usage: /stop <trigger>");
      return;
    }
    const filters = (await storeGet(`filters_v2:${chatId}`)) || [];
    const next = filters.filter((f) => f.trigger !== cmdArgsStr);
    await storeSet(`filters_v2:${chatId}`, next);
    await replyAdmin(`Filter removed: ${cmdArgsStr}`);
    return;
  }

  if (cmd === "/save") {
    const match = cleanLine.match(/^\/save\s+([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/i);
    const repliedMedia = extractMediaFromMessage(message.reply_to_message);
    const directMedia = extractMediaFromMessage(message);
    const pickedMedia = repliedMedia || directMedia;
    const replyCaption =
      typeof message.reply_to_message?.caption === "string"
        ? message.reply_to_message.caption.trim()
        : typeof message.reply_to_message?.text === "string"
          ? message.reply_to_message.text.trim()
          : "";

    if (!match) {
      await replyAdmin("Usage: /save <note_name> [content] (or reply to a message)");
      return;
    }
    const noteName = match[1].trim().toLowerCase();
    const inlineContent = (match[2] || "").trim();
    const finalContent = inlineContent || (!pickedMedia ? replyCaption : "");

    if (!finalContent && !pickedMedia) {
      await replyAdmin("Usage: /save <note_name> [content] (or reply to a message)");
      return;
    }

    const notes = (await storeGet(`notes:${chatId}`)) || {};
    notes[noteName] = pickedMedia
      ? { content: finalContent, media: pickedMedia }
      : finalContent;
    await storeSet(`notes:${chatId}`, notes);
    await replyAdmin(`Note saved as #${noteName}`);
    return;
  }

  if (cmd === "/clear") {
    const noteName = (cmdArgs[0] || "").trim().toLowerCase();
    if (!noteName) {
      await replyAdmin("Usage: /clear <note_name>");
      return;
    }
    const notes = (await storeGet(`notes:${chatId}`)) || {};
    delete notes[noteName];
    await storeSet(`notes:${chatId}`, notes);
    await replyAdmin(`Note #${noteName} deleted.`);
    return;
  }

  if (cmd === "/welcome") {
    if ((cmdArgs[0] || "").toLowerCase() === "noformat") {
      const raw = cfg.greetings.welcomeText || "";
      await replyAdmin(raw || "No welcome message set.");
      return;
    }
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /welcome <yes/no/on/off|noformat>");
      return;
    }
    cfg.greetings.welcomeEnabled = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Welcome messages ${flag ? "enabled" : "disabled"}.`);
    return;
  }

  if (cmd === "/goodbye") {
    if ((cmdArgs[0] || "").toLowerCase() === "noformat") {
      const raw = cfg.greetings.goodbyeText || "";
      await replyAdmin(raw || "No goodbye message set.");
      return;
    }
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /goodbye <yes/no/on/off|noformat>");
      return;
    }
    cfg.greetings.goodbyeEnabled = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Goodbye messages ${flag ? "enabled" : "disabled"}.`);
    return;
  }

  if (cmd === "/cleanwelcome") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /cleanwelcome <yes/no/on/off>");
      return;
    }
    cfg.greetings.cleanWelcome = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Clean welcome set to ${flag ? "on" : "off"}.`);
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
      await replyAdmin(`Usage: ${cmd} <text> (or reply to a message with ${cmd})`);
      return;
    }

    if (isWel) {
      if (nextText !== null) cfg.greetings.welcomeText = nextText;
      if (pickedMedia) cfg.greetings.welcomeMedia = pickedMedia;
      else if (cmdArgsStr) cfg.greetings.welcomeMedia = null;
      cfg.greetings.welcomeEnabled = true;
    } else {
      if (nextText !== null) cfg.greetings.goodbyeText = nextText;
      if (pickedMedia) cfg.greetings.goodbyeMedia = pickedMedia;
      else if (cmdArgsStr) cfg.greetings.goodbyeMedia = null;
      cfg.greetings.goodbyeEnabled = true;
    }

    await saveChatConfig(chatId, cfg);
    await replyAdmin(`${isWel ? "Welcome" : "Goodbye"} message updated and enabled.`);
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
    await replyAdmin(`${cmd === "/resetwelcome" ? "Welcome" : "Goodbye"} message reset.`);
    return;
  }

  if (cmd === "/pin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    const targetMsgId = message.reply_to_message?.message_id;
    if (!targetMsgId) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    const silent = !cmdArgs.some((a) => ["loud", "notify"].includes(a.toLowerCase()));
    try {
      await tgApi(token, "pinChatMessage", {
        chat_id: chatId,
        message_id: targetMsgId,
        disable_notification: silent,
      });
      await replyAdmin("Message pinned.");
    } catch (err) {
      await replyAdmin(`Pin failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/permapin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    if (!cmdArgsStr) {
      await replyAdmin("Usage: /permapin <text>");
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
      await replyAdmin(`Permapin failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/unpin") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    const targetMsgId = message.reply_to_message?.message_id;
    try {
      await tgApi(
        token,
        "unpinChatMessage",
        targetMsgId ? { chat_id: chatId, message_id: targetMsgId } : { chat_id: chatId }
      );
      await replyAdmin("Message unpinned.");
    } catch (err) {
      await replyAdmin(`Unpin failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/unpinall") {
    const right = await checkBotPermission(token, chatId, "can_pin_messages");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    try {
      await tgApi(token, "unpinAllChatMessages", { chat_id: chatId });
      await replyAdmin("Unpinned all messages.");
    } catch (err) {
      await replyAdmin(`Unpinall failed: ${err.message}`);
    }
    return;
  }

  if (cmd === "/antichannelpin") {
    if (!cmdArgs[0]) {
      await replyAdmin(`Anti-channel pin is ${cfg.pin.antiChannelPin ? "on" : "off"}.`);
      return;
    }
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /antichannelpin <yes/no/on/off>");
      return;
    }
    cfg.pin.antiChannelPin = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Anti-channel pin set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/cleanlinked") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /cleanlinked <yes/no/on/off>");
      return;
    }
    cfg.pin.cleanLinked = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Clean linked channel set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/del") {
    const right = await checkBotPermission(token, chatId, "can_delete_messages");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    if (message.reply_to_message) {
      await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.reply_to_message.message_id });
    }
    await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: adminMsgId });
    return;
  }

  if (cmd === "/purgefrom") {
    if (!message.reply_to_message) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    purgeFromState.set(chatId, message.reply_to_message.message_id);
    await replyAdmin(`Marked message ${message.reply_to_message.message_id} as purge start.`);
    return;
  }

  if (cmd === "/purgeto") {
    const right = await checkBotPermission(token, chatId, "can_delete_messages");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    const startId = purgeFromState.get(chatId);
    const endId = message.reply_to_message?.message_id || adminMsgId;
    if (!startId) {
      await replyAdmin("Use /purgefrom first.");
      return;
    }
    const from = Math.min(startId, endId);
    const to = Math.max(startId, endId);
    const ids = [];
    for (let id = from; id <= Math.min(to, from + 100); id++) ids.push(id);
    if (ids.length) await safeTgApi(token, "deleteMessages", { chat_id: chatId, message_ids: ids });
    purgeFromState.delete(chatId);
    await replyAdmin(`Purged ${ids.length} messages.`);
    return;
  }

  if (cmd === "/purge" || cmd === "/spurge") {
    const right = await checkBotPermission(token, chatId, "can_delete_messages");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
    if (!message.reply_to_message) {
      await replyAdmin("Reply to user or mention Telegram unique ID.");
      return;
    }
    const startId = message.reply_to_message.message_id;
    const countArg = parseInt(cmdArgs[0], 10);
    const endId = countArg && countArg > 0 ? startId + countArg : adminMsgId;
    const ids = [];
    for (let id = startId; id <= Math.min(endId, startId + 100); id++) ids.push(id);
    if (ids.length) await safeTgApi(token, "deleteMessages", { chat_id: chatId, message_ids: ids });
    await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: adminMsgId });
    if (cmd === "/purge") {
      await safeSend(token, chatId, `Purged ${ids.length} messages.`);
    }
    return;
  }

  if (cmd === "/setrules") {
    if (!cmdArgsStr) {
      await replyAdmin("Usage: /setrules <text>");
      return;
    }
    cfg.rules.text = cmdArgsStr;
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Chat rules updated.");
    return;
  }

  if (cmd === "/privaterules") {
    const flag = parseBoolFlag(cmdArgs[0]);
    if (flag === null) {
      await replyAdmin("Usage: /privaterules <yes/no/on/off>");
      return;
    }
    cfg.rules.privateRules = flag;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Private rules set to ${flag ? "on" : "off"}.`);
    return;
  }

  if (cmd === "/resetrules") {
    cfg.rules.text = "";
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Chat rules reset.");
    return;
  }

  if (cmd === "/setrulesbutton") {
    if (!cmdArgsStr) {
      await replyAdmin("Usage: /setrulesbutton <label>");
      return;
    }
    cfg.rules.buttonText = cmdArgsStr;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Rules button set to "${cmdArgsStr}".`);
    return;
  }

  if (cmd === "/resetrulesbutton") {
    cfg.rules.buttonText = "Rules";
    await saveChatConfig(chatId, cfg);
    await replyAdmin("Rules button reset to default.");
    return;
  }

  if (cmd === "/warnmode") {
    const m = (cmdArgs[0] || "").toLowerCase();
    if (!PUNISHMENT_ACTIONS.has(m)) {
      await replyAdmin("Usage: /warnmode <ban/mute/kick/tban/tmute> [duration]");
      return;
    }
    const dur = cmdArgs[1] ? parseDurationSeconds(cmdArgs[1]) : 0;
    if (cmdArgs[1] && dur === null) {
      await replyAdmin("Invalid duration.");
      return;
    }
    cfg.warnings.mode = m;
    cfg.warnings.durationSeconds = dur || 0;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Warn mode set to ${m}.`);
    return;
  }

  if (cmd === "/warnlimit") {
    const n = parseInt(cmdArgs[0], 10);
    if (!n || n < 1) {
      await replyAdmin("Usage: /warnlimit <number>");
      return;
    }
    cfg.warnings.limit = n;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(`Warn limit set to ${n}.`);
    return;
  }

  if (cmd === "/warntime") {
    const secs = parseDurationSeconds(cmdArgs[0]);
    if (secs === null) {
      await replyAdmin("Usage: /warntime <time|off>");
      return;
    }
    cfg.warnings.timeSeconds = secs;
    await saveChatConfig(chatId, cfg);
    await replyAdmin(secs === 0 ? "Warn expiration disabled." : `Warn expiration set to ${secs}s.`);
    return;
  }

  if (cmd === "/resetallwarns") {
    cfg.warnings.clearedAt = Date.now();
    await saveChatConfig(chatId, cfg);
    await replyAdmin("All warnings cleared.");
    return;
  }

  const needsRestrictRight = new Set([
    "/ban", "/dban", "/sban", "/tban", "/unban",
    "/mute", "/dmute", "/smute", "/tmute", "/unmute",
    "/kick", "/dkick", "/skick"
  ]);

  if (needsRestrictRight.has(cmd)) {
    const right = await checkBotPermission(token, chatId, "can_restrict_members");
    if (!right.ok) {
      await replyAdmin(right.message);
      return;
    }
  }

  const target = await resolveTargetUser(token, message, parts);
  if (!target.id) {
    await replyAdmin("Reply to user or mention Telegram unique ID.");
    return;
  }

  if (await isChatAdmin(token, chatId, target.id)) {
    await replyAdmin(
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
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: adminMsgId });
      }

      const resText = await applyPunishment(token, chatId, target.user || { id: target.id, username: target.label }, durSec ? "tban" : "ban", durSec || 0, reason, logChatId, message.from);
      if (cmd !== "/sban") {
        await replyAdmin(resText);
      }
      return;
    }

    if (cmd === "/unban") {
      await tgApi(token, "unbanChatMember", { chat_id: chatId, user_id: target.id, only_if_banned: true });
      await replyAdmin(`I've unbanned ${target.label}.`);
      return;
    }

    if (["/kick", "/dkick", "/skick"].includes(cmd)) {
      const reason = target.args.join(" ") || "No reason provided";
      if ((cmd === "/dkick" || cmd === "/skick") && message.reply_to_message) {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.reply_to_message.message_id });
      }
      if (cmd === "/skick") {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: adminMsgId });
      }
      const resText = await applyPunishment(token, chatId, target.user || { id: target.id, username: target.label }, "kick", 0, reason, logChatId, message.from);
      if (cmd !== "/skick") {
        await replyAdmin(resText);
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
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: adminMsgId });
      }

      const resText = await applyPunishment(token, chatId, target.user || { id: target.id, username: target.label }, durSec ? "tmute" : "mute", durSec || 0, reason, logChatId, message.from);
      if (cmd !== "/smute") {
        await replyAdmin(resText);
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
      await replyAdmin(`I've unmuted ${target.label}.`);
      return;
    }

    const warnKey = `warns:${chatId}:${target.id}`;
    let warns = (await storeGet(warnKey)) || [];
    if (cfg.warnings.clearedAt) {
      warns = warns.filter((w) => w.at > cfg.warnings.clearedAt);
    }

    if (["/warn", "/dwarn", "/swarn"].includes(cmd)) {
      const reason = target.args.join(" ") || "Warning";
      const isSilent = cmd === "/swarn";
      if (cmd === "/dwarn" && message.reply_to_message) {
        await safeTgApi(token, "deleteMessage", { chat_id: chatId, message_id: message.reply_to_message.message_id });
      }
      await applyWarning(
        token,
        chatId,
        target.user || { id: target.id, username: target.label },
        reason,
        cfg,
        isSilent ? null : adminMsgId,
        logChatId,
        isSilent,
        message.from
      );
      return;
    }

    if (cmd === "/warns") {
      if (!warns.length) {
        await replyAdmin(`${target.label} has no warnings.`);
        return;
      }
      const list = warns.map((w, idx) => `${idx + 1}. ${w.reason}`).join("\n");
      await replyAdmin(`Warnings for ${target.label} (${warns.length}/${cfg.warnings.limit}):\n${list}`);
      return;
    }

    if (cmd === "/rmwarn") {
      warns.pop();
      await storeSet(warnKey, warns);
      await replyAdmin(`Latest warning removed (${warns.length}/${cfg.warnings.limit}).`);
      return;
    }

    if (cmd === "/resetwarn") {
      await storeSet(warnKey, []);
      await replyAdmin(`All warnings cleared for ${target.label}.`);
    }
  } catch (err) {
    await replyAdmin(`Action failed: ${err.message}`);
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

  const entities = message.entities || [];
  const textMention = entities.find((e) => e.type === "text_mention" && e.user?.id);
  if (textMention?.user?.id) {
    const u = textMention.user;
    return {
      id: u.id,
      label: u.username ? `@${u.username}` : `${u.id}`,
      user: u,
      args: parts.slice(2),
    };
  }

  const firstArg = (parts[1] || "").trim();
  if (/^\d+$/.test(firstArg)) {
    const id = Number(firstArg);
    return { id, label: firstArg, user: { id, first_name: firstArg }, args: parts.slice(2) };
  }

  if (/^@[a-zA-Z0-9_]{3,}$/.test(firstArg)) {
    const cleanUname = firstArg.slice(1).toLowerCase();
    const cachedUser = await storeGet(`user:${cleanUname}`);
    if (cachedUser?.id) {
      return { id: cachedUser.id, label: firstArg, user: cachedUser, args: parts.slice(2) };
    }
    try {
      const chatRes = await tgApi(token, "getChat", { chat_id: firstArg });
      if (chatRes?.result?.id) {
        const u = chatRes.result;
        await storeSet(`user:${cleanUname}`, u);
        return { id: u.id, label: firstArg, user: u, args: parts.slice(2) };
      }
    } catch {}
    return { id: null, label: firstArg, user: null, args: parts.slice(2) };
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

import crypto from "node:crypto";

const FEED_PRIMARY_URL = "https://sportlink-tv11.pages.dev/Data.json";
const FEED_EVENTS_URL =
  "https://raw.githubusercontent.com/srhady/willow-event/refs/heads/main/live_sports.json";
const FEED_SPORTS_URL =
  "https://raw.githubusercontent.com/sm-monirulislam/Upcoming-and-Live-Sports-Data/main/Sports_data.json";

const REQUIRED_CHANNELS = [
  {
    id: String(process.env.CRICXCRATE_CHANNEL_ID || "-1003215553013").trim(),
    url: String(process.env.CRICXCRATE_CHANNEL_URL || "https://t.me/+vjCGYgxHRmhhNGI1").trim(),
    label: "CRICXCRATE",
  },
  {
    id: String(process.env.FOOTBALL_CHANNEL_ID || "-1003973221958").trim(),
    url: String(process.env.FOOTBALL_CHANNEL_URL || "https://t.me/+URLJF2-HXW44ZWU1").trim(),
    label: "FOOT X CRATE",
  },
];

const REQUIRE_ALL_CHANNELS = true;

// Yahan apni custom_emoji_id strings daal dena (message text ke liye)
const CUSTOM_EMOJI_MAP = {
  live: "",
  upcoming: "",
  ended: "",
  alert: "",
  info: "",
  tip: "",
  time: "",
  empty: "",
  item: "",
  brand: "",
  heart: "",
};

const SMALL_CAPS_MAP = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ",
  i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ",
  q: "Q", r: "ʀ", s: "ꜱ", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x",
  y: "ʏ", z: "ᴢ",
  A: "ᴀ", B: "ʙ", C: "ᴄ", D: "ᴅ", E: "ᴇ", F: "ꜰ", G: "ɢ", H: "ʜ",
  I: "ɪ", J: "ᴊ", K: "ᴋ", L: "ʟ", M: "ᴍ", N: "ɴ", O: "ᴏ", P: "ᴘ",
  Q: "Q", R: "ʀ", S: "ꜱ", T: "ᴛ", U: "ᴜ", V: "ᴠ", W: "ᴡ", X: "x",
  Y: "ʏ", Z: "ᴢ",
};

const CACHE_TTL_MS = 30000;
const MEMBER_CACHE_TTL_MS = 15000;
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value, ttlMs = CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function toSmallCaps(text) {
  return String(text ?? "")
    .split("")
    .map((ch) => SMALL_CAPS_MAP[ch] ?? ch)
    .join("");
}

function esc(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tgEmoji(keyOrId, fallback = "🧩") {
  const customId = String(CUSTOM_EMOJI_MAP[keyOrId] || keyOrId || "").trim();
  if (!/^\d+$/.test(customId)) return fallback;
  return `<tg-emoji emoji-id="${esc(customId)}">${esc(fallback)}</tg-emoji>`;
}

function extractCustomEmojis(msg) {
  const text = String(msg?.text || "");
  const entities = Array.isArray(msg?.entities) ? msg.entities : [];
  return entities
    .filter((e) => e.type === "custom_emoji" && e.custom_emoji_id)
    .map((e) => ({
      id: String(e.custom_emoji_id),
      char: text.slice(e.offset, e.offset + e.length) || "🧩",
    }));
}

function makeId(raw) {
  return crypto.createHash("sha1").update(String(raw || "").toLowerCase()).digest("hex").slice(0, 14);
}

function getStatusEmoji(status) {
  if (status === "LIVE") return tgEmoji("live", "🔺");
  if (status === "UPCOMING") return tgEmoji("upcoming", "⏳");
  return tgEmoji("ended", "🔻");
}

function getStatusButtonMark(status) {
  if (status === "LIVE") return "🔺";
  if (status === "UPCOMING") return "⏳";
  return "🔻";
}

function convertBdtToIst(bdtStr) {
  const raw = String(bdtStr || "").trim();
  if (!raw) return "TBA";

  const timeMatch = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*BDT/i);
  if (!timeMatch) return raw.replace(/\bBDT\b/gi, "IST");

  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2] || "0", 10);
  const mer = timeMatch[3].toUpperCase();

  if (mer === "PM" && hour !== 12) hour += 12;
  if (mer === "AM" && hour === 12) hour = 0;

  let totalMins = hour * 60 + minute - 30;
  let dayShift = 0;
  if (totalMins < 0) {
    totalMins += 1440;
    dayShift = -1;
  }

  const istH24 = Math.floor(totalMins / 60);
  const istMin = totalMins % 60;
  const istMer = istH24 >= 12 ? "PM" : "AM";
  const istH12 = istH24 % 12 === 0 ? 12 : istH24 % 12;
  const istTimePart = `${istH12}:${String(istMin).padStart(2, "0")} ${istMer} IST`;

  const prefix = raw.slice(0, timeMatch.index).trim();
  if (!prefix) {
    return dayShift === -1 ? `Prev Day • ${istTimePart}` : istTimePart;
  }

  if (/^live\s*at$/i.test(prefix)) {
    return dayShift === -1 ? `Live at ${istTimePart} (Prev Day)` : `Live at ${istTimePart}`;
  }

  if (/^tomorrow$/i.test(prefix)) {
    return dayShift === -1 ? `Today • ${istTimePart}` : `Tomorrow • ${istTimePart}`;
  }

  const dateMatch = prefix.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*([A-Za-z]+)\s+(\d{1,2})$/i);
  if (dateMatch && dayShift === -1) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dIdx = days.findIndex((d) => d.toLowerCase() === dateMatch[1].toLowerCase());
    const mIdx = months.findIndex((m) => m.toLowerCase() === dateMatch[2].slice(0, 3).toLowerCase());
    const dayNum = parseInt(dateMatch[3], 10);

    if (dIdx !== -1 && mIdx !== -1 && dayNum > 1) {
      const prevDayName = days[(dIdx + 6) % 7];
      return `${prevDayName}, ${months[mIdx]} ${dayNum - 1} • ${istTimePart}`;
    }
  }

  return `${prefix} • ${istTimePart}`;
}

function buildDirectPlayerLine({ streamUrl, cookie = "", keys = [], userAgent = "", referer = "" }) {
  const cleanUrl = String(streamUrl || "").trim();
  if (!cleanUrl) return "";

  const rawCookie = String(cookie || "").trim().replace(/^Cookie=/i, "");
  const sep = cleanUrl.includes("?") ? "&" : "?";
  const urlWithQuery = rawCookie ? `${cleanUrl}${sep}${rawCookie}` : cleanUrl;

  const cleanKeys = (Array.isArray(keys) ? keys : [])
    .map((k) => String(k || "").trim())
    .filter(Boolean);

  const parts = [];
  if (rawCookie) parts.push(`Cookie=${rawCookie}`);
  if (userAgent) {
    parts.push(`User-Agent=${String(userAgent).trim()}`);
  } else if (rawCookie) {
    parts.push("User-Agent=Virat");
  }
  if (referer) {
    parts.push(`Referer=${String(referer).trim()}`);
  } else if (rawCookie) {
    parts.push("Referer=https://www.jiotv.com/");
    parts.push("Origin=https://www.jiotv.com/");
  }
  if (cleanKeys.length) {
    parts.push("drmScheme=clearkey");
    parts.push(`drmLicense=${cleanKeys.join(",")}`);
  }

  return parts.length ? `${urlWithQuery}|${parts.join("&")}` : urlWithQuery;
}

function buildEventPlayerLine(streamUrl, drmKey = "") {
  const cleanUrl = String(streamUrl || "").trim();
  if (!cleanUrl) return "";

  const cleanKey = String(drmKey || "").trim();
  if (!cleanKey) return cleanUrl;

  return `${cleanUrl}|drmScheme=clearkey&drmLicense=${cleanKey}`;
}

function extractEventStreams(match) {
  const drmKey = String(match?.drm_key || "").trim();
  const streams = [];

  const groups = [
    { obj: match?.stream_url_alpha, tag: "SERVER A" },
    { obj: match?.stream_url_bravo, tag: "SERVER B" },
  ];

  for (const { obj, tag } of groups) {
    if (!obj || typeof obj !== "object") continue;
    for (const [serverName, url] of Object.entries(obj)) {
      const line = buildEventPlayerLine(url, drmKey);
      if (!line) continue;
      streams.push({
        label: `${tag} • ${String(serverName).trim()}`,
        line,
      });
    }
  }

  return streams;
}

function extractMatchStreams(rawStreams) {
  const list = Array.isArray(rawStreams) ? rawStreams : [];
  const streams = [];

  for (const s of list) {
    const streamUrl = String(s?.stream_url || "").trim();
    if (!streamUrl) continue;

    const label = String(s?.channel_name || "STREAM").trim();
    const keys = s?.kid && s?.key ? [`${String(s.kid).trim()}:${String(s.key).trim()}`] : [];
    const line = buildDirectPlayerLine({
      streamUrl,
      keys,
      userAgent: s?.user_agent || "",
      referer: s?.referer || "",
    });
    if (!line) continue;

    streams.push({ label, line });
  }

  return streams;
}

async function fetchJson(url, timeoutMs = 6000) {
  const sep = url.includes("?") ? "&" : "?";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}${sep}t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadPrimaryFeed() {
  const cached = getCached("feed:primary");
  if (cached) return cached;

  const data = await fetchJson(FEED_PRIMARY_URL);
  const rawList = Array.isArray(data?.channels) ? data.channels : [];
  const items = [];

  for (const entry of rawList) {
    const title = String(entry?.name || "").trim();
    const keys = Array.isArray(entry?.sportlink) && entry.sportlink.length
      ? entry.sportlink
      : entry?.key_id && entry?.key
        ? [`${entry.key_id}:${entry.key}`]
        : [];
    const line = buildDirectPlayerLine({
      streamUrl: entry?.stream_url,
      cookie: entry?.cookie,
      keys,
    });
    if (!title || !line) continue;

    const lower = title.toLowerCase();
    const network = lower.includes("star")
      ? "star"
      : lower.includes("sony")
        ? "sony"
        : "other";

    const id = makeId(`p|${entry?.id || ""}|${title}`);
    items.push({
      id,
      network,
      title,
      status: "LIVE",
      timingLabel: "VALID TILL",
      timingValue: entry?.cookie_expire_ist || "ACTIVE",
      streams: [{ label: "DIRECT STREAM", line }],
      searchText: `${entry?.id || ""} ${title}`.toLowerCase(),
    });
  }

  return setCached("feed:primary", items);
}

async function loadEventsFeed() {
  const cached = getCached("feed:events");
  if (cached) return cached;

  const data = await fetchJson(FEED_EVENTS_URL);
  const matches = Array.isArray(data?.Matches) ? data.Matches : [];
  const items = [];

  for (const m of matches) {
    const title = String(m?.title || "").trim();
    if (!title) continue;

    const streams = extractEventStreams(m);
    const status = String(m?.status || "UPCOMING").trim().toUpperCase();
    const istTime = convertBdtToIst(m?.time);
    const id = makeId(`e|${m?.match_id || ""}|${title}`);

    items.push({
      id,
      network: "willow",
      title,
      status,
      timingLabel: "SCHEDULE (IST)",
      timingValue: istTime,
      streams,
      searchText: `${m?.match_id || ""} ${title} ${m?.synopsis || ""} ${status} ${istTime}`.toLowerCase(),
    });
  }

  return setCached("feed:events", items);
}

async function loadSportsFeed() {
  const cached = getCached("feed:sports");
  if (cached) return cached;

  const data = await fetchJson(FEED_SPORTS_URL);
  const rawMatches = Array.isArray(data?.matches) ? data.matches : [];
  const items = [];

  for (const m of rawMatches) {
    const info = m?.eventInfo || {};
    const title = String(m?.event_name || `${info?.teamA || ""} vs ${info?.teamB || ""}`).trim();
    if (!title) continue;

    const streams = extractMatchStreams(m?.streams);
    const status = String(m?.status || "UPCOMING").trim().toUpperCase();
    const category = String(m?.Category || "").trim();
    const tournament = String(info?.eventName || "").trim();
    const startTime = String(info?.startTime || "").trim();
    const id = makeId(`sp|${title}|${startTime}`);

    const streamText = streams.map((s) => s.label).join(" ");
    items.push({
      id,
      network: "sports",
      title,
      status,
      timingLabel: "START TIME",
      timingValue: startTime || "TBA",
      streams,
      searchText: `${title} ${category} ${tournament} ${info?.teamA || ""} ${info?.teamB || ""} ${streamText} ${status}`.toLowerCase(),
    });
  }

  return setCached("feed:sports", items);
}

async function loadAllEntries(mode = "all") {
  if (mode === "willow") return loadEventsFeed();
  if (mode === "star") {
    const list = await loadPrimaryFeed();
    return list.filter((i) => i.network === "star");
  }
  if (mode === "sony") {
    const [p, sp] = await Promise.allSettled([loadPrimaryFeed(), loadSportsFeed()]);
    return [
      ...(p.status === "fulfilled" ? p.value.filter((i) => i.network === "sony") : []),
      ...(sp.status === "fulfilled"
        ? sp.value.filter((i) => i.searchText.includes("sony"))
        : []),
    ];
  }

  const [p, e, sp] = await Promise.allSettled([
    loadPrimaryFeed(),
    loadEventsFeed(),
    loadSportsFeed(),
  ]);
  return [
    ...(p.status === "fulfilled" ? p.value : []),
    ...(e.status === "fulfilled" ? e.value : []),
    ...(sp.status === "fulfilled" ? sp.value : []),
  ];
}

async function telegramApi(method, payload) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_TOKEN");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.description || `Telegram ${method} ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function isMemberOfChannel(channelId, userId, bypassCache = false) {
  if (!channelId || !userId) return false;

  const cacheKey = `sub:${channelId}:${userId}`;
  if (!bypassCache) {
    const cached = getCached(cacheKey);
    if (typeof cached === "boolean") return cached;
  }

  try {
    const res = await telegramApi("getChatMember", {
      chat_id: channelId,
      user_id: userId,
    });
    const status = String(res?.result?.status || "");
    const joined =
      ["creator", "administrator", "member", "restricted"].includes(status) &&
      (status !== "restricted" || res?.result?.is_member !== false);
    return setCached(cacheKey, joined, MEMBER_CACHE_TTL_MS);
  } catch {
    return false;
  }
}

async function checkRequiredChannels(userId, bypassCache = false) {
  const checks = await Promise.all(
    REQUIRED_CHANNELS.map(async (ch) => ({
      ...ch,
      joined: await isMemberOfChannel(ch.id, userId, bypassCache),
    }))
  );

  const joinedCount = checks.filter((c) => c.joined).length;
  const allowed = REQUIRE_ALL_CHANNELS
    ? joinedCount === checks.length
    : joinedCount > 0;

  return {
    allowed,
    missing: checks.filter((c) => !c.joined),
  };
}

async function sendJoinPrompt(chatId, missingChannels, callbackQueryId = null) {
  const targetList = missingChannels.length ? missingChannels : REQUIRED_CHANNELS;
  const listLines = targetList.map(
    (ch) => `${tgEmoji("info", "📌")}  <b>${esc(toSmallCaps(ch.label))}</b>  ⇢  <code>${esc(ch.url)}</code>`
  );

  const text = [
    `${tgEmoji("alert", "⚠️")}  <b>${esc(toSmallCaps("ACCESS LOCKED"))}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...listLines,
    `━━━━━━━━━━━━━━━━━━━━`,
    `${tgEmoji("tip", "💡")}  ${esc(toSmallCaps("JOIN ABOVE & TAP VERIFY"))}`,
  ].join("\n\n");

  const keyboardRows = targetList.map((ch) => [
    { text: `🧩  ${toSmallCaps(`JOIN ${ch.label}`)}`, url: ch.url },
  ]);
  keyboardRows.push([
    { text: `🥂  ${toSmallCaps("VERIFY JOINED")}`, callback_data: "chk:join" },
  ]);

  if (callbackQueryId) {
    await answerCallback(callbackQueryId, toSmallCaps("JOIN REQUIRED FIRST"), true);
  }
  await sendText(chatId, text, { inline_keyboard: keyboardRows });
}

function buildSelectionKeyboard(items) {
  const rows = [];
  for (const item of items.slice(0, 45)) {
    const mark = getStatusButtonMark(item.status);
    const text = `${mark}  ${toSmallCaps(item.title)}`.slice(0, 60);
    rows.push([{ text, callback_data: `pick:${item.id}` }]);
  }
  return { inline_keyboard: rows };
}

async function sendStreamCard(chatId, item) {
  const mark = getStatusEmoji(item.status);
  const lines = [
    `${mark}  <b>${esc(toSmallCaps(item.title))}</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `${tgEmoji("info", "📌")}  <b>${esc(toSmallCaps("STATE"))}</b>  ⇢  <b>${esc(toSmallCaps(item.status))}</b>`,
    `${tgEmoji("time", "⏳")}  <b>${esc(toSmallCaps(item.timingLabel))}</b>  ⇢  <code>${esc(item.timingValue)}</code>`,
  ];

  if (!item.streams?.length) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`${tgEmoji("empty", "🫥")}  <b>${esc(toSmallCaps("NO ACTIVE STREAM RIGHT NOW"))}</b>`);
    lines.push(`${tgEmoji("tip", "💡")}  ${esc(toSmallCaps("TRY AGAIN CLOSER TO START TIME"))}`);
    await sendText(chatId, lines.join("\n\n"));
    return;
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`${tgEmoji("tip", "💡")}  <b>${esc(toSmallCaps("TAP TO COPY FOR PLAYER"))}</b>`);

  for (const s of item.streams) {
    lines.push(`${tgEmoji("brand", "🥂")}  <b>${esc(toSmallCaps(s.label))}</b>\n<code>${esc(s.line)}</code>`);
  }

  await sendText(chatId, lines.join("\n\n"));
}

async function sendText(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: String(text).slice(0, 4090),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await telegramApi("sendMessage", payload);
}

async function answerCallback(id, text = "", alert = false) {
  if (!id) return;
  await telegramApi("answerCallbackQuery", {
    callback_query_id: id,
    text: String(text).slice(0, 195),
    show_alert: alert,
  }).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("Bot Active");
  if (req.method !== "POST") return res.status(405).end();

  try {
    const update = req.body || {};

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq?.message?.chat?.id;
      const userId = cq?.from?.id;
      const data = String(cq?.data || "");
      const [prefix, arg1] = data.split(":");

      if (chatId && prefix === "chk" && arg1 === "join") {
        const sub = await checkRequiredChannels(userId, true);
        if (!sub.allowed) {
          await sendJoinPrompt(chatId, sub.missing, cq.id);
          return res.status(200).json({ ok: true });
        }
        await answerCallback(cq.id, toSmallCaps("VERIFIED"), false);
        await sendText(
          chatId,
          [
            `${tgEmoji("brand", "🥂")}  <b>${esc(toSmallCaps("VERIFIED"))}</b>`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `${tgEmoji("item", "🧩")}  <code>/Willow</code>`,
            `${tgEmoji("item", "🧩")}  <code>/Star</code>`,
            `${tgEmoji("item", "🧩")}  <code>/Sony</code>`,
            `${tgEmoji("tip", "💡")}  <code>/Match name</code>  |  <code>/Tournament</code>`,
          ].join("\n\n")
        );
        return res.status(200).json({ ok: true });
      }

      if (chatId && prefix === "pick") {
        const sub = await checkRequiredChannels(userId);
        if (!sub.allowed) {
          await sendJoinPrompt(chatId, sub.missing, cq.id);
          return res.status(200).json({ ok: true });
        }

        const all = await loadAllEntries("all");
        const selected = all.find((c) => c.id === arg1);
        if (!selected) {
          await answerCallback(cq.id, toSmallCaps("UNAVAILABLE"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps(selected.title));
        await sendStreamCard(chatId, selected);
        return res.status(200).json({ ok: true });
      }

      return res.status(200).json({ ok: true });
    }

    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id;
    const rawText = String(msg?.text || "").trim();

    if (!chatId || !rawText.startsWith("/")) {
      if (chatId && msg) {
        const found = extractCustomEmojis(msg);
        if (found.length) {
          const lines = found.map((x) => `${esc(x.char)}  ⇢  <code>${esc(x.id)}</code>`);
          await sendText(
            chatId,
            `${tgEmoji("info", "📌")}  <b>${esc(toSmallCaps("CUSTOM EMOJI IDS"))}</b>\n\n${lines.join("\n")}`
          );
        }
      }
      return res.status(200).json({ ok: true });
    }

    const [first, ...rest] = rawText.split(/\s+/);
    const cmd = first.split("@")[0].toLowerCase();
    const extra = rest.join(" ").trim();

    const sub = await checkRequiredChannels(userId);
    if (!sub.allowed) {
      await sendJoinPrompt(chatId, sub.missing);
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/start" || cmd === "/help") {
      const help = [
        `${tgEmoji("brand", "🥂")}  <b>${esc(toSmallCaps("CRICXCRATE STREAM BOT"))}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `${tgEmoji("live", "🔺")}  <code>/Willow</code>`,
        `${tgEmoji("item", "🧩")}  <code>/Star</code>`,
        `${tgEmoji("item", "🧩")}  <code>/Sony</code>`,
        `${tgEmoji("tip", "💡")}  <code>/Match name</code>  |  <code>/Tournament</code>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `${tgEmoji("heart", "🤍")}  ${esc(toSmallCaps("SEND ANY COMMAND ABOVE"))}`,
      ].join("\n\n");

      await sendText(chatId, help);
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/willow" && !extra) {
      const list = await loadAllEntries("willow");
      if (!list.length) {
        await sendText(chatId, `${tgEmoji("empty", "🛑")}  <b>${esc(toSmallCaps("NOTHING AVAILABLE RIGHT NOW"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      const liveCount = list.filter((i) => i.status === "LIVE").length;
      const upcomingCount = list.filter((i) => i.status === "UPCOMING").length;

      const head = [
        `${tgEmoji("live", "🔺")}  <b>${esc(toSmallCaps("WILLOW (IST)"))}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `${tgEmoji("live", "🔺")}  <b>${esc(toSmallCaps("LIVE"))}</b>  ⇢  <b>${liveCount}</b>    |    ${tgEmoji("upcoming", "⏳")}  <b>${esc(toSmallCaps("UPCOMING"))}</b>  ⇢  <b>${upcomingCount}</b>`,
        `${tgEmoji("heart", "🤍")}  ${esc(toSmallCaps("TAP ONE BELOW"))}`,
      ].join("\n\n");

      await sendText(chatId, head, buildSelectionKeyboard(list));
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/star" && !extra) {
      const list = await loadAllEntries("star");
      if (!list.length) {
        await sendText(chatId, `${tgEmoji("empty", "🛑")}  <b>${esc(toSmallCaps("NOTHING AVAILABLE RIGHT NOW"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      const head = [
        `${tgEmoji("item", "🧩")}  <b>${esc(toSmallCaps("STAR"))}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `${tgEmoji("info", "📌")}  <b>${esc(toSmallCaps("AVAILABLE"))}</b>  ⇢  <b>${list.length}</b>`,
        `${tgEmoji("heart", "🤍")}  ${esc(toSmallCaps("TAP ONE BELOW"))}`,
      ].join("\n\n");

      await sendText(chatId, head, buildSelectionKeyboard(list));
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/sony" && !extra) {
      const list = await loadAllEntries("sony");
      if (!list.length) {
        await sendText(chatId, `${tgEmoji("empty", "🛑")}  <b>${esc(toSmallCaps("NOTHING AVAILABLE RIGHT NOW"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      const head = [
        `${tgEmoji("item", "🧩")}  <b>${esc(toSmallCaps("SONY"))}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `${tgEmoji("info", "📌")}  <b>${esc(toSmallCaps("AVAILABLE"))}</b>  ⇢  <b>${list.length}</b>`,
        `${tgEmoji("heart", "🤍")}  ${esc(toSmallCaps("TAP ONE BELOW"))}`,
      ].join("\n\n");

      await sendText(chatId, head, buildSelectionKeyboard(list));
      return res.status(200).json({ ok: true });
    }

    const query = `${cmd.slice(1)} ${extra}`.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    const all = await loadAllEntries("all");
    const matched = all.filter((item) => tokens.every((t) => item.searchText.includes(t)));

    if (!matched.length) {
      await sendText(
        chatId,
        [
          `${tgEmoji("empty", "🛑")}  <b>${esc(toSmallCaps(`NO RESULTS : ${query.toUpperCase()}`))}</b>`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `${tgEmoji("empty", "🫥")}  ${esc(toSmallCaps("TRY ANOTHER KEYWORD OR /start"))}`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    if (matched.length === 1) {
      await sendStreamCard(chatId, matched[0]);
      return res.status(200).json({ ok: true });
    }

    const head = [
      `${tgEmoji("info", "📌")}  <b>${esc(toSmallCaps(`RESULTS : ${query.toUpperCase()}`))}</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `${tgEmoji("tip", "💡")}  <b>${esc(toSmallCaps("FOUND"))}</b>  ⇢  <b>${matched.length}</b>`,
      `${tgEmoji("heart", "🤍")}  ${esc(toSmallCaps("TAP ONE BELOW"))}`,
    ].join("\n\n");

    await sendText(chatId, head, buildSelectionKeyboard(matched));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

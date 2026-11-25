import crypto from "node:crypto";

const WILLOW_URL =
  "https://raw.githubusercontent.com/srhady/willow-event/refs/heads/main/live_sports.json";
const SONY_URL =
  "https://raw.githubusercontent.com/doctor-8trange/zyphora/refs/heads/main/data/sony.json";
const SKY_BASE_URL = "https://tbx090-sky-nz-epg.vercel.app";
const FOX_BASE_URL = "https://tbx090-foxtel-epg.vercel.app";

// Dono private channels ki config:
// id: Bot se forward karke mili numeric ID (-100...)
// url: Channel ka invite link
// label: Prompt me dikhne wala naam
const REQUIRED_CHANNELS = [
  {
    id: String(process.env.FOOTBALL_CHANNEL_ID || "-1001111111111").trim(),
    url: String(process.env.FOOTBALL_CHANNEL_URL || "https://t.me/+URLJF2-HXW44ZWU1").trim(),
    label: "FOOTBALL CHANNEL",
  },
  {
    id: String(process.env.CRICXCRATE_CHANNEL_ID || "-1002222222222").trim(),
    url: String(process.env.CRICXCRATE_CHANNEL_URL || "https://t.me/+vjCGYgxHRmhhNGI1").trim(),
    label: "CRICXCRATE MAIN",
  },
];

// true = dono channels join karna zaroori | false = koi ek bhi join ho toh chalega
const REQUIRE_ALL_CHANNELS = true;

const SKY_CHANNELS = {
  SPT1: "Sky Sport 1",
  SPT2: "Sky Sport 2",
  SPT3: "Sky Sport 3",
  "0001": "Sky Sport 4",
  "0002": "Sky Sport 5",
  "0003": "Sky Sport 6",
  "0009": "Sky Sport 7",
  "0004": "Sky Sport 8",
  "0016": "Sky Sport 9",
  "0162": "Sky Sport Select",
  "0047": "Sky Sport Pop Up 1",
  "0122": "Sky Sport Pop Up 2",
  "0135": "Sky Sport Pop Up 3",
  "0136": "Sky Sport Pop Up 4",
  "0137": "Sky Sport Pop Up 5",
  "0026": "ESPN",
  "0082": "ESPN 2",
  "0093": "Trackside 1",
  "0094": "Trackside 2",
};

const FOX_CHANNELS = {
  FSN: "Fox Sports News HD (500)",
  FS1: "Fox Cricket HD (501)",
  SP2: "Fox League HD (502)",
  FS3: "Fox Sports 503 HD (503)",
  FAF: "Fox Footy HD (504)",
  FSP: "Fox Sports 505 HD (505)",
  SPS: "Fox Sports 506 HD (506)",
  FSS: "Fox Sports 507 HD (507)",
  ESP: "ESPN HD (508)",
  ES2: "ESPN2 HD (509)",
  RTV: "Racing.com HD (529)",
  UFC: "Main Event UFC (523)",
  "4KL": "Fox League 4K (CH 13)",
  "4KF1": "Fox F1 4K (CH 14)",
  "4KF": "Fox Footy 4K (CH 15)",
  "4KF2": "Fox Footy 2 4K (CH 16)",
  "4KN": "Fox Netball 4K (CH 17)",
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

function makeId(source, status, title, extra = "") {
  const raw = `${source}|${status}|${title}|${extra}`.toLowerCase();
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 14);
}

function getStatusMark(status) {
  if (status === "LIVE") return "🔺";
  if (status === "UPCOMING") return "⏳";
  return "🔻";
}

function formatIstTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function shiftDateLabel(dateStr, deltaDays) {
  const parts = String(dateStr || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
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

async function loadWillowThumbnails() {
  const cached = getCached("willow");
  if (cached) return cached;

  const data = await fetchJson(WILLOW_URL);
  const matches = Array.isArray(data?.Matches) ? data.Matches : [];
  const items = [];

  for (const m of matches) {
    const title = String(m?.title || "").trim();
    const imageUrl = String(m?.cover_image || "").trim();
    if (!title || !imageUrl) continue;

    const status = String(m?.status || "UPCOMING").trim().toUpperCase();
    const timeText = String(m?.time || "").trim();
    const matchId = String(m?.match_id || "").trim() || makeId("willow", status, title, timeText);

    items.push({
      id: matchId,
      source: "willow",
      title,
      status,
      metaLabel: "TIME",
      metaValue: timeText || "TBA",
      imageUrl,
      searchText: `${title} ${m?.synopsis || ""} ${status} ${timeText} willow`.toLowerCase(),
    });
  }

  return setCached("willow", items);
}

async function loadSonyThumbnails() {
  const cached = getCached("sony");
  if (cached) return cached;

  const data = await fetchJson(SONY_URL);
  const liveList = Array.isArray(data?.data) ? data.data : [];
  const upcomingList = Array.isArray(data?.upcoming) ? data.upcoming : [];

  const combined = [
    ...liveList.map((entry) => ({ entry, status: "LIVE" })),
    ...upcomingList.map((entry) => ({ entry, status: "UPCOMING" })),
  ];

  const items = [];
  for (const { entry, status } of combined) {
    const info = entry?.video_info || {};
    const cdn = entry?.image_cdn || {};
    const title = String(info?.title || "").trim();
    const imageUrl = String(
      cdn?.landscape_thumb || cdn?.thumbnail || cdn?.masthead_mobile_v2 || cdn?.portrait_thumb || ""
    ).trim();

    if (!title || !imageUrl) continue;

    const timeText = String(entry?.air_dates?.contractStartDate || "").trim();
    const channelText = String(entry?.stream_info?.broadcast_channel || "Sony LIV").trim();
    const id = makeId("sony", status, title, entry?.contentId || timeText);

    items.push({
      id,
      source: "sony",
      title,
      status,
      metaLabel: "CHANNEL",
      metaValue: `${channelText}${timeText ? ` • ${timeText}` : ""}`,
      imageUrl,
      searchText: `${title} ${info?.shortDescription || ""} ${channelText} ${status} sony`.toLowerCase(),
    });
  }

  return setCached("sony", items);
}

async function loadEpgThumbnails({ baseUrl, channelsMap, sourceKey, defaultChannelLabel, extraSearch }) {
  const cacheKey = `epg:${sourceKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const indexData = await fetchJson(`${baseUrl}/data/index.json`, 4500);
  const now = Date.now();
  const istToday = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const targetDates = new Set([
    shiftDateLabel(istToday, -1),
    istToday,
    shiftDateLabel(istToday, 1),
  ]);

  const tasks = [];
  for (const [tag, chName] of Object.entries(channelsMap)) {
    const labels = Array.isArray(indexData?.[tag]) ? indexData[tag] : [];
    const matchedLabels = labels.filter((lbl) => targetDates.has(String(lbl))).slice(-2);

    for (const lbl of matchedLabels) {
      tasks.push(
        fetchJson(`${baseUrl}/data/${tag}/${lbl}.json`, 4500)
          .then((d) => ({ tag, chName, events: Array.isArray(d?.events) ? d.events : [] }))
          .catch(() => ({ tag, chName, events: [] }))
      );
    }
  }

  const settled = await Promise.all(tasks);
  const items = [];
  const seen = new Set();

  for (const { chName, events } of settled) {
    for (const ev of events) {
      const imageUrl = String(ev?.imageUrl || "").trim();
      const progTitle = String(ev?.programTitle || "").trim();
      const epTitle = String(ev?.episodeTitle || "").trim();
      if (!imageUrl || (!progTitle && !epTitle)) continue;

      const fullTitle = epTitle && epTitle !== progTitle ? `${progTitle} - ${epTitle}` : progTitle || epTitle;
      const startMs = Number(ev?.scheduledDate || 0);
      const durMin = Number(ev?.duration || 0);
      const endMs = startMs + durMin * 60000;

      let status = "UPCOMING";
      if (startMs && endMs) {
        if (now >= startMs && now < endMs) status = "LIVE";
        else if (now >= endMs) status = "ENDED";
      }

      const uniqueKey = `${fullTitle}|${startMs}|${imageUrl}`.toLowerCase();
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      const timeStr = formatIstTime(startMs);
      items.push({
        id: makeId(sourceKey, status, fullTitle, `${startMs}|${imageUrl}`),
        source: sourceKey,
        title: fullTitle,
        status,
        metaLabel: "CHANNEL",
        metaValue: `${chName || defaultChannelLabel}${timeStr ? ` • ${timeStr} IST` : ""}`,
        imageUrl,
        searchText: `${fullTitle} ${ev?.competitionTitle || ""} ${ev?.sport || ""} ${chName} ${extraSearch}`.toLowerCase(),
      });
    }
  }

  return setCached(cacheKey, items);
}

async function loadSkyNzThumbnails() {
  return loadEpgThumbnails({
    baseUrl: SKY_BASE_URL,
    channelsMap: SKY_CHANNELS,
    sourceKey: "skynz",
    defaultChannelLabel: "Sky Sport NZ",
    extraSearch: "sky nz skynz",
  });
}

async function loadFoxThumbnails() {
  return loadEpgThumbnails({
    baseUrl: FOX_BASE_URL,
    channelsMap: FOX_CHANNELS,
    sourceKey: "fox",
    defaultChannelLabel: "Foxtel",
    extraSearch: "fox foxtel",
  });
}

async function loadAllThumbnails(sourceFilter = "all") {
  if (sourceFilter === "willow") return loadWillowThumbnails();
  if (sourceFilter === "sony") return loadSonyThumbnails();
  if (sourceFilter === "skynz") return loadSkyNzThumbnails();
  if (sourceFilter === "fox") return loadFoxThumbnails();

  const [w, s, k, f] = await Promise.allSettled([
    loadWillowThumbnails(),
    loadSonyThumbnails(),
    loadSkyNzThumbnails(),
    loadFoxThumbnails(),
  ]);

  return [
    ...(w.status === "fulfilled" ? w.value : []),
    ...(s.status === "fulfilled" ? s.value : []),
    ...(k.status === "fulfilled" ? k.value : []),
    ...(f.status === "fulfilled" ? f.value : []),
  ];
}

function buildStatusKeyboard(sourceKey, list) {
  const counts = { LIVE: 0, UPCOMING: 0, ENDED: 0 };
  for (const item of list) {
    if (counts[item.status] !== undefined) counts[item.status] += 1;
  }

  const rows = [
    [
      {
        text: `🔺  ${toSmallCaps("LIVE")}  ( ${counts.LIVE} )`,
        callback_data: `st:${sourceKey}:LIVE`,
      },
    ],
    [
      {
        text: `⏳  ${toSmallCaps("UPCOMING")}  ( ${counts.UPCOMING} )`,
        callback_data: `st:${sourceKey}:UPCOMING`,
      },
    ],
  ];

  if (counts.ENDED > 0) {
    rows.push([
      {
        text: `🔻  ${toSmallCaps("ENDED")}  ( ${counts.ENDED} )`,
        callback_data: `st:${sourceKey}:ENDED`,
      },
    ]);
  }

  return { inline_keyboard: rows };
}

function buildMatchKeyboard(items) {
  const rows = [];
  for (const item of items.slice(0, 45)) {
    const text = `➔  ${toSmallCaps(item.title)}  [ ${toSmallCaps(item.status)} ]`.slice(0, 60);
    rows.push([{ text, callback_data: `th:${item.id}` }]);
  }
  return { inline_keyboard: rows };
}

function formatCaption(item) {
  const lines = [
    `${getStatusMark(item.status)}  <b>${esc(toSmallCaps(item.title))}</b>`,
    `📌  ${esc(toSmallCaps("STATUS"))}  ⟶  <b>${esc(toSmallCaps(item.status))}</b>`,
    `➠  ${esc(toSmallCaps(item.metaLabel))}  ⇢  <code>${esc(item.metaValue)}</code>`,
    `➥  ${esc(toSmallCaps("SOURCE"))}  ⇢  <b>${esc(toSmallCaps(item.source))}</b>`,
  ];
  return lines.join("\n\n").slice(0, 1020);
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

async function isMemberOfChannel(channelId, userId) {
  if (!channelId || !userId) return false;
  const cacheKey = `sub:${channelId}:${userId}`;
  const cached = getCached(cacheKey);
  if (typeof cached === "boolean") return cached;

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

async function checkRequiredChannels(userId) {
  const checks = await Promise.all(
    REQUIRED_CHANNELS.map(async (ch) => ({
      ...ch,
      joined: await isMemberOfChannel(ch.id, userId),
    }))
  );

  const joinedCount = checks.filter((c) => c.joined).length;
  const allowed = REQUIRE_ALL_CHANNELS
    ? joinedCount === checks.length
    : joinedCount > 0;

  return {
    allowed,
    checks,
    missing: checks.filter((c) => !c.joined),
  };
}

async function sendJoinPrompt(chatId, missingChannels, callbackQueryId = null) {
  const targetList = missingChannels.length ? missingChannels : REQUIRED_CHANNELS;
  const listLines = targetList.map(
    (ch) => `➠  <b>${esc(toSmallCaps(ch.label))}</b>  ⇢  <code>${esc(ch.url)}</code>`
  );

  const text = [
    `🛑  <b>${esc(toSmallCaps("CHANNELS REQUIRED"))}</b>`,
    ...listLines,
    `➥  ${esc(toSmallCaps("JOIN ABOVE AND TAP VERIFY"))}  ⇢`,
  ].join("\n\n");

  const keyboardRows = targetList.map((ch) => [
    { text: `➔  ${toSmallCaps(`JOIN ${ch.label}`)}`, url: ch.url },
  ]);
  keyboardRows.push([
    { text: `✅  ${toSmallCaps("VERIFY JOINED")}`, callback_data: "chk:join" },
  ]);

  if (callbackQueryId) {
    await answerCallback(callbackQueryId, toSmallCaps("JOIN REQUIRED CHANNELS FIRST"), true);
  }
  await sendText(chatId, text, { inline_keyboard: keyboardRows });
}

async function sendPhotoCard(chatId, item) {
  const payload = {
    chat_id: chatId,
    photo: item.imageUrl,
    caption: formatCaption(item),
    parse_mode: "HTML",
  };

  if (/^https:\/\//i.test(item.imageUrl) && item.imageUrl.length <= 2048) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: `➔  ${toSmallCaps("OPEN FULL IMAGE")}`, url: item.imageUrl }]],
    };
  }

  try {
    await telegramApi("sendPhoto", payload);
  } catch {
    const fallbackText = `${formatCaption(item)}\n\n🔗  <code>${esc(item.imageUrl)}</code>`;
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: fallbackText.slice(0, 4090),
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: payload.reply_markup,
    });
  }
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
  if (req.method === "GET") return res.status(200).send("Thumbnail Bot Active");
  if (req.method !== "POST") return res.status(405).end();

  try {
    const update = req.body || {};

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq?.message?.chat?.id;
      const userId = cq?.from?.id;
      const data = String(cq?.data || "");
      const [prefix, arg1, arg2] = data.split(":");

      if (chatId && prefix === "chk" && arg1 === "join") {
        const sub = await checkRequiredChannels(userId);
        if (!sub.allowed) {
          await sendJoinPrompt(chatId, sub.missing, cq.id);
          return res.status(200).json({ ok: true });
        }
        await answerCallback(cq.id, toSmallCaps("ALL CHANNELS VERIFIED"), false);
        await sendText(
          chatId,
          `✅  <b>${esc(toSmallCaps("VERIFIED"))}</b>\n\n➥  ${esc(toSmallCaps("USE /start OR /willow"))}`
        );
        return res.status(200).json({ ok: true });
      }

      if (chatId && prefix === "st") {
        const sub = await checkRequiredChannels(userId);
        if (!sub.allowed) {
          await sendJoinPrompt(chatId, sub.missing, cq.id);
          return res.status(200).json({ ok: true });
        }

        const list = await loadAllThumbnails(arg1);
        const filtered = list.filter((i) => i.status === arg2);

        await answerCallback(cq.id, `${toSmallCaps(arg2)}  ( ${filtered.length} )`);

        if (!filtered.length) {
          await sendText(
            chatId,
            `🛑  <b>${esc(toSmallCaps(arg2))}</b>\n\n➥  ${esc(toSmallCaps("NO THUMBNAILS AVAILABLE"))}`
          );
          return res.status(200).json({ ok: true });
        }

        const msgText = [
          `🧩  <b>${esc(toSmallCaps(`${arg1} • ${arg2}`))}</b>`,
          `📌  ${esc(toSmallCaps("MATCHES"))}  ⟶  <b>${filtered.length}</b>`,
          `➥  ${esc(toSmallCaps("TAP A MATCH BELOW"))}  ⇢`,
        ].join("\n\n");

        await sendText(chatId, msgText, buildMatchKeyboard(filtered));
        return res.status(200).json({ ok: true });
      }

      if (chatId && prefix === "th") {
        const sub = await checkRequiredChannels(userId);
        if (!sub.allowed) {
          await sendJoinPrompt(chatId, sub.missing, cq.id);
          return res.status(200).json({ ok: true });
        }

        const all = await loadAllThumbnails("all");
        const selected = all.find((i) => i.id === arg1);

        if (!selected) {
          await answerCallback(cq.id, toSmallCaps("THUMBNAIL NOT FOUND"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps(selected.title));
        await sendPhotoCard(chatId, selected);
        return res.status(200).json({ ok: true });
      }

      return res.status(200).json({ ok: true });
    }

    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id;
    const rawText = String(msg?.text || "").trim();

    if (!chatId || !rawText.startsWith("/")) {
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

    if (cmd === "/willow" || cmd === "/sony" || cmd === "/skynz" || cmd === "/fox") {
      const sourceKey = cmd.slice(1);
      const list = await loadAllThumbnails(sourceKey);

      if (!list.length) {
        await sendText(
          chatId,
          `🛑  <b>${esc(toSmallCaps(sourceKey))}</b>\n\n➥  ${esc(toSmallCaps("NO DATA AVAILABLE"))}`
        );
        return res.status(200).json({ ok: true });
      }

      const prompt = [
        `🧩  <b>${esc(toSmallCaps(`${sourceKey} THUMBNAILS`))}</b>`,
        `📌  ${esc(toSmallCaps("SELECT STATUS"))}  ⟶`,
        `➥  ${esc(toSmallCaps("TAP LIVE OR UPCOMING"))}  ⇢`,
      ].join("\n\n");

      await sendText(chatId, prompt, buildStatusKeyboard(sourceKey, list));
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/start" || cmd === "/help") {
      const help = [
        `📌  <b>${esc(toSmallCaps("THUMBNAIL BOT COMMANDS"))}</b>`,
        `➠  <code>/willow</code>  ⇢  ${esc(toSmallCaps("WILLOW 16:9 COVER THUMBNAILS"))}`,
        `➠  <code>/sony</code>  ⇢  ${esc(toSmallCaps("SONY LANDSCAPE THUMBNAILS"))}`,
        `➠  <code>/skynz</code>  ⇢  ${esc(toSmallCaps("SKY SPORT NZ EPG THUMBNAILS"))}`,
        `➠  <code>/fox</code>  ⇢  ${esc(toSmallCaps("FOXTEL HD & 4K THUMBNAILS"))}`,
        `➥  <code>/&lt;keyword&gt;</code>  ⇢  ${esc(toSmallCaps("SEARCH BY TEAM, SHOW OR CHANNEL"))}`,
      ].join("\n\n");

      await sendText(chatId, help);
      return res.status(200).json({ ok: true });
    }

    const query = `${cmd.slice(1)} ${extra}`.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    const all = await loadAllThumbnails("all");
    const matched = all.filter((item) => tokens.every((t) => item.searchText.includes(t)));

    if (!matched.length) {
      await sendText(
        chatId,
        `🛑  <b>${esc(toSmallCaps(query.toUpperCase()))}</b>\n\n➥  ${esc(toSmallCaps("NO MATCHING THUMBNAILS"))}`
      );
      return res.status(200).json({ ok: true });
    }

    if (matched.length === 1) {
      await sendPhotoCard(chatId, matched[0]);
      return res.status(200).json({ ok: true });
    }

    const head = [
      `📌  <b>${esc(toSmallCaps(`RESULTS : ${query.toUpperCase()}`))}</b>`,
      `➠  ${esc(toSmallCaps("FOUND"))}  ⇢  <b>${matched.length}</b>`,
      `➥  ${esc(toSmallCaps("TAP A MATCH BELOW"))}  ⇢`,
    ].join("\n\n");

    await sendText(chatId, head, buildMatchKeyboard(matched));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

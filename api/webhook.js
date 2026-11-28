import crypto from "node:crypto";

const FEED_PRIMARY_URL = "https://sportlink-tv11.pages.dev/Data.json";
const FEED_EVENTS_URL =
  "https://raw.githubusercontent.com/srhady/willow-event/refs/heads/main/live_sports.json";
const FEED_SPORTS_URL =
  "https://raw.githubusercontent.com/sm-monirulislam/Upcoming-and-Live-Sports-Data/main/Sports_data.json";
const FEED_FANCODE_URL =
  "https://raw.githubusercontent.com/kajju027/Fancode-Events-Json/refs/heads/main/fancode.json";
const FEED_SONYLIV_URL =
  "https://raw.githubusercontent.com/drmlive/sliv-live-events/refs/heads/main/sonyliv.json";

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
const AUTO_DELETE_DELAY_SEC = 30;

const CUSTOM_EMOJI_MAP = {
  live: "5264919878082509254",
  upcoming: "6071317996704370355",
  ended: "5042040865313260562",
  finish: "5042040865313260562",
  willow: "5375177250553487549",
  cricket: "5346089086325130313",
  football: "5863894806001881819",
  fancode: "5260291556899831755",
  help: "6053062818033309122",
  questionMark: "5188540541922480562",
  alert: "6257780484281997093",
  link: "6275878213746955453",
  pin: "5397782960512444700",
  india: "6098034050495157840",
  australia: "5395748653547662674",
  austria: "5868536802360431719",
  southAfrica: "5866340003897941721",
  newZealand: "5913640044937089340",
  pakistan: "5987549508613969266",
  pointDown: "5231102735817918643",
  eyes: "5210956306952758910",
  bulb: "5422439311196834318",
  searching: "5341715473882955310",
  speaker: "5388632425314140043",
  wrong: "5240241223632954241",
  globe: "5447410659077661506",
  free: "5406756500108501710",
  sony: "6327725937957801811",
  star: "5370784581341422520",
  calendar: "6053240981866683172",
  tick: "6102570656946200544",
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

function normalizeStatus(rawStatus = "") {
  const s = String(rawStatus || "").trim().toUpperCase();
  if (s === "LIVE") return "LIVE";
  if (s === "UPCOMING") return "UPCOMING";
  if (["FINISHED", "ENDED", "COMPLETED", "FINISH", "FT"].includes(s)) return "FINISHED";
  return s || "UPCOMING";
}

function getTeamEmoji(title = "") {
  const t = String(title).toLowerCase();
  if (/\bindia\b/.test(t)) return tgEmoji("india", "🇮🇳");
  if (/\baustralia\b/.test(t)) return tgEmoji("australia", "🦘");
  if (/\baustria\b/.test(t)) return tgEmoji("austria", "🇦🇹");
  if (/south\s*africa|\bsa\b/.test(t)) return tgEmoji("southAfrica", "🇿🇦");
  if (/new\s*zealand|\bnz\b/.test(t)) return tgEmoji("newZealand", "🇳🇿");
  if (/\bpakistan\b|\bpak\b/.test(t)) return tgEmoji("pakistan", "🇵🇰");
  return "";
}

function getSportEmoji(title = "", category = "", network = "") {
  const combined = `${title} ${category} ${network}`.toLowerCase();
  if (/\b(football|soccer|premier league|la liga|serie a|bundesliga|ligue 1|champions league|uefa|fifa|isl)\b/.test(combined)) {
    return tgEmoji("football", "⚽");
  }
  if (/\b(cricket|ipl|t20|odi|test|willow|bpl|psl|bbl|sa20|icc|ashes)\b/.test(combined)) {
    return tgEmoji("cricket", "🏏");
  }
  return "";
}

function getCardLeadEmoji(item) {
  const teamMark = getTeamEmoji(item?.title || "");
  const sportMark = getSportEmoji(item?.title || "", item?.category || "", item?.network || "");
  const extras = [teamMark, sportMark].filter(Boolean).join(" ");

  if (item?.source === "sportlink") {
    return `${tgEmoji("live", "🔴")}${extras ? ` ${extras}` : ""}`;
  }
  const norm = normalizeStatus(item?.status);
  if (norm === "LIVE") return `${tgEmoji("live", "🔴")}${extras ? ` ${extras}` : ""}`;
  if (norm === "UPCOMING") return `${tgEmoji("upcoming", "⏳")}${extras ? ` ${extras}` : ""}`;
  return `${tgEmoji("ended", "🔻")}${extras ? ` ${extras}` : ""}`;
}

function getStatusButtonMark(item) {
  if (item?.source === "sportlink") return "🔴";
  const norm = normalizeStatus(item?.status);
  if (norm === "LIVE") return "🔴";
  if (norm === "UPCOMING") return "⏳";
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
    return dayShift === -1 ? `Prev Day | ${istTimePart}` : istTimePart;
  }

  if (/^live\s*at$/i.test(prefix)) {
    return dayShift === -1 ? `Live at ${istTimePart} (Prev Day)` : `Live at ${istTimePart}`;
  }

  if (/^tomorrow$/i.test(prefix)) {
    return dayShift === -1 ? `Today | ${istTimePart}` : `Tomorrow | ${istTimePart}`;
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
      return `${prevDayName}, ${months[mIdx]} ${dayNum - 1} | ${istTimePart}`;
    }
  }

  return `${prefix} | ${istTimePart}`;
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

function extractFanCodeStreams(match) {
  const streams = [];
  const seenUrls = new Set();
  const baseLang = String(match?.language || "ENGLISH").trim().toUpperCase();

  const pushUnique = (label, url) => {
    const clean = String(url || "").trim();
    if (!clean || seenUrls.has(clean)) return;
    seenUrls.add(clean);
    streams.push({ label, line: clean });
  };

  const sObj = match?.streams || {};
  if (sObj.primary) pushUnique(`${baseLang} • 1080P`, sObj.primary);
  if (sObj.fancode_cdn) pushUnique(`${baseLang} • AUTO HLS`, sObj.fancode_cdn);
  if (sObj.fancode_bd_cdn) pushUnique(`${baseLang} • BD CDN`, sObj.fancode_bd_cdn);
  if (sObj.fancode_np_cdn) pushUnique(`${baseLang} • NP CDN`, sObj.fancode_np_cdn);
  if (sObj.fancode_lk_cdn) pushUnique(`${baseLang} • LK CDN`, sObj.fancode_lk_cdn);

  if (sObj.backup && typeof sObj.backup === "object") {
    for (const [k, v] of Object.entries(sObj.backup)) {
      if (typeof v === "string") pushUnique(`BACKUP • ${k.toUpperCase()}`, v);
    }
  }

  const auto = match?.auto_streams;
  if (auto && typeof auto === "object") {
    for (const [langKey, langBlock] of Object.entries(auto)) {
      const qMap = langBlock?.streams || {};
      const cookie = String(langBlock?.cookie || "").trim();
      for (const q of ["1080p", "720p", "480p"]) {
        if (!qMap[q]) continue;
        const line = buildDirectPlayerLine({
          streamUrl: qMap[q],
          cookie,
        });
        pushUnique(`${langKey.toUpperCase()} • ${q.toUpperCase()}`, line);
      }
    }
  }

  return streams;
}

function extractSonyLivStreams(match) {
  const streams = [];
  const seen = new Set();
  const lang = String(match?.audioLanguageName || "ENG").trim().toUpperCase();
  const channel = String(match?.broadcast_channel || "SONYLIV").trim().toUpperCase();

  const pushUnique = (label, url) => {
    const clean = String(url || "").trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    streams.push({ label, line: clean });
  };

  if (match?.video_url) pushUnique(`${channel} • ${lang}`, match.video_url);
  if (match?.dai_url) pushUnique(`${channel} • DAI (${lang})`, match.dai_url);
  if (match?.pub_url) pushUnique(`${channel} • PUB (${lang})`, match.pub_url);

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
      source: "sportlink",
      network,
      title,
      status: "CHANNEL",
      category: "TV",
      tournament: "",
      timingLabel: "Valid Till",
      timingValue: entry?.cookie_expire_ist || "ACTIVE",
      streams: [{ label: "STREAM URL", line }],
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
    const status = normalizeStatus(m?.status || "UPCOMING");
    const istTime = convertBdtToIst(m?.time);
    const id = makeId(`e|${m?.match_id || ""}|${title}`);

    items.push({
      id,
      source: "willow",
      network: "willow",
      title,
      status,
      category: "Cricket",
      tournament: String(m?.synopsis || "").trim(),
      timingLabel: "Date & Time",
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
    const status = normalizeStatus(m?.status || "UPCOMING");
    const category = String(m?.Category || "").trim();
    const tournament = String(info?.eventName || "").trim();
    const startTime = String(info?.startTime || "").trim();
    const id = makeId(`sp|${title}|${startTime}`);

    const streamText = streams.map((s) => s.label).join(" ");
    items.push({
      id,
      source: "sports",
      network: "sports",
      title,
      status,
      category,
      tournament,
      timingLabel: "Date & Time",
      timingValue: startTime || "TBA",
      streams,
      searchText: `${title} ${category} ${tournament} ${info?.teamA || ""} ${info?.teamB || ""} ${streamText} ${status}`.toLowerCase(),
    });
  }

  return setCached("feed:sports", items);
}

async function loadFanCodeFeed() {
  const cached = getCached("feed:fancode");
  if (cached) return cached;

  const data = await fetchJson(FEED_FANCODE_URL);
  const rawMatches = Array.isArray(data?.matches) ? data.matches : [];
  const items = [];

  for (const m of rawMatches) {
    const rawTitle = String(m?.title || "").trim();
    const tournament = String(m?.tournament || "").trim();
    if (!rawTitle) continue;

    const displayTitle = tournament ? `${rawTitle} - ${tournament}` : rawTitle;
    const status = normalizeStatus(m?.status || "UPCOMING");
    const category = String(m?.category || "").trim();
    const startTime = String(m?.startTime || "").trim() || (status === "LIVE" ? "LIVE NOW" : "TBA");
    const streams = extractFanCodeStreams(m);
    const id = makeId(`fc|${m?.match_id || ""}|${displayTitle}`);

    items.push({
      id,
      source: "fancode",
      network: "fancode",
      title: displayTitle,
      status,
      category,
      tournament,
      timingLabel: "Date & Time",
      timingValue: startTime,
      streams,
      searchText: `fancode ${m?.match_id || ""} ${rawTitle} ${tournament} ${category} ${status} ${startTime}`.toLowerCase(),
    });
  }

  return setCached("feed:fancode", items);
}

async function loadSonyLivFeed() {
  const cached = getCached("feed:sonyliv");
  if (cached) return cached;

  const data = await fetchJson(FEED_SONYLIV_URL);
  const rawMatches = Array.isArray(data?.matches) ? data.matches : [];
  const lastUpdated = String(data?.["last update time"] || "").trim();
  const items = [];

  for (const m of rawMatches) {
    const matchName = String(m?.match_name || "").trim();
    const eventName = String(m?.event_name || "").trim();
    const rawTitle = matchName || eventName;
    if (!rawTitle) continue;

    const isLiveBool = Boolean(m?.isLive);
    const inferredStatus = isLiveBool
      ? "LIVE"
      : /\bupcoming\b/i.test(rawTitle)
        ? "UPCOMING"
        : "LIVE";
    const status = normalizeStatus(inferredStatus);
    const cleanTitle = rawTitle.replace(/^upcoming\s*-\s*/i, "").trim();
    const displayTitle = matchName && eventName && matchName !== eventName
      ? `${cleanTitle} - ${eventName}`
      : cleanTitle;
    const category = String(m?.event_category || "").trim();
    const channel = String(m?.broadcast_channel || "").trim();
    const lang = String(m?.audioLanguageName || "").trim();
    const streams = extractSonyLivStreams(m);
    const id = makeId(`sl|${m?.contentId || ""}|${displayTitle}`);

    items.push({
      id,
      source: "sonyliv",
      network: "sony",
      title: displayTitle,
      status,
      category,
      tournament: channel,
      timingLabel: "Date & Time",
      timingValue: lastUpdated || (status === "LIVE" ? "LIVE NOW" : "UPCOMING"),
      streams,
      searchText: `sony sonyliv ${m?.contentId || ""} ${matchName} ${eventName} ${category} ${channel} ${lang} ${status}`.toLowerCase(),
    });
  }

  return setCached("feed:sonyliv", items);
}

async function loadAllEntries(mode = "all") {
  if (mode === "willow") return loadEventsFeed();
  if (mode === "tv") return loadPrimaryFeed();
  if (mode === "fancode") return loadFanCodeFeed();
  if (mode === "sonyliv") return loadSonyLivFeed();
  if (mode === "star") {
    const list = await loadPrimaryFeed();
    return list.filter((i) => i.network === "star");
  }
  if (mode === "sony") {
    const [p, sl, sp] = await Promise.allSettled([
      loadPrimaryFeed(),
      loadSonyLivFeed(),
      loadSportsFeed(),
    ]);
    return [
      ...(p.status === "fulfilled" ? p.value.filter((i) => i.network === "sony") : []),
      ...(sl.status === "fulfilled" ? sl.value : []),
      ...(sp.status === "fulfilled"
        ? sp.value.filter((i) => i.searchText.includes("sony"))
        : []),
    ];
  }
  if (mode === "cricket") {
    const [e, fc, sl, sp] = await Promise.allSettled([
      loadEventsFeed(),
      loadFanCodeFeed(),
      loadSonyLivFeed(),
      loadSportsFeed(),
    ]);
    const events = e.status === "fulfilled" ? e.value : [];
    const fancode = fc.status === "fulfilled"
      ? fc.value.filter((i) => i.category.toLowerCase() === "cricket" || i.searchText.includes("cricket"))
      : [];
    const sonyliv = sl.status === "fulfilled"
      ? sl.value.filter((i) => i.category.toLowerCase() === "cricket" || i.searchText.includes("cricket"))
      : [];
    const sports = sp.status === "fulfilled"
      ? sp.value.filter((i) => i.searchText.includes("cricket"))
      : [];
    return [...events, ...fancode, ...sonyliv, ...sports];
  }

  const [p, e, fc, sl, sp] = await Promise.allSettled([
    loadPrimaryFeed(),
    loadEventsFeed(),
    loadFanCodeFeed(),
    loadSonyLivFeed(),
    loadSportsFeed(),
  ]);
  return [
    ...(p.status === "fulfilled" ? p.value : []),
    ...(e.status === "fulfilled" ? e.value : []),
    ...(fc.status === "fulfilled" ? fc.value : []),
    ...(sl.status === "fulfilled" ? sl.value : []),
    ...(sp.status === "fulfilled" ? sp.value : []),
  ];
}

function storeSearchBucket(items) {
  const ids = items.map((i) => i.id);
  const bucketId = makeId(`b|${Date.now()}|${ids.slice(0, 8).join(",")}`);
  setCached(`bucket:${bucketId}`, ids, 15 * 60 * 1000);
  return bucketId;
}

function getSearchBucket(bucketId) {
  return getCached(`bucket:${bucketId}`) || [];
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

function getWebhookTargetUrl(req) {
  if (process.env.BOT_WEBHOOK_URL) {
    return String(process.env.BOT_WEBHOOK_URL).trim();
  }
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "").trim();
  const proto = String(req?.headers?.["x-forwarded-proto"] || "https").trim();
  if (!host) return "";
  return `${proto}://${host}${req?.url?.split("?")[0] || "/"}`;
}

async function scheduleDeleteMessage(chatId, messageId, req = null, delaySec = AUTO_DELETE_DELAY_SEC) {
  if (!chatId || !messageId) return { ok: false, reason: "MISSING_IDS" };

  const qstashToken = String(process.env.QSTASH_TOKEN || "").trim();
  const qstashUrl = String(
    process.env.QSTASH_URL || "https://qstash-eu-central-1.upstash.io"
  ).trim().replace(/\/+$/, "");
  const callbackUrl = getWebhookTargetUrl(req);

  if (qstashToken && callbackUrl) {
    const sep = callbackUrl.includes("?") ? "&" : "?";
    const destination = `${callbackUrl}${sep}action=delete`;
    const res = await fetch(`${qstashUrl}/v2/publish/${encodeURIComponent(destination)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${qstashToken}`,
        "Content-Type": "application/json",
        "Upstash-Delay": `${delaySec}s`,
      },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));

    if (res?.ok) return { ok: true };
    const errText = await res?.text?.().catch(() => "unknown");
    return { ok: false, reason: `QStash (${res?.status}): ${errText}` };
  }

  const timer = setTimeout(() => {
    telegramApi("deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    }).catch(() => {});
  }, delaySec * 1000);
  if (typeof timer.unref === "function") timer.unref();

  return {
    ok: false,
    reason: `MISSING_ENV (token=${Boolean(qstashToken)}, url=${callbackUrl || "none"})`,
  };
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

function getBotCommandsGuideText() {
  return [
    `${tgEmoji("speaker", "♦️")} <b>${esc(toSmallCaps("BOT COMMANDS"))}</b>`,
    `${tgEmoji("cricket", "🏏")} ├ <code>/cricket</code> — ${esc(toSmallCaps("Live Cricket Matches & Multiple Stream Feeds"))}`,
    `${tgEmoji("sony", "📺")} ├ <code>/tv &lt;name&gt;</code> — ${esc(toSmallCaps("Search & Access Live TV Channels"))}`,
    `${tgEmoji("fancode", "🔴")} ├ <code>/fancode</code> — ${esc(toSmallCaps("FanCode Premium Sports Streams"))}`,
    `${tgEmoji("willow", "🌐")} ├ <code>/willow</code> — ${esc(toSmallCaps("Ad-Free Willow Cricket Streams"))}`,
    `${tgEmoji("star", "⭐")} ├ <code>/sonyliv</code> — ${esc(toSmallCaps("SonyLIV Sports Broadcasts"))}`,
    `${tgEmoji("help", "ℹ️")} └ <code>/help</code> — ${esc(toSmallCaps("Complete Bot Guide & Instructions"))}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `${tgEmoji("upcoming", "⏳")} <b>${esc(toSmallCaps("AUTOMATED STREAM PROTECTION"))}</b>`,
    `${esc(toSmallCaps(`All stream links are automatically deleted after ${AUTO_DELETE_DELAY_SEC} seconds to ensure temporary and secure access.`))}`,
  ].join("\n");
}

function getWelcomeMessageText(firstName = "") {
  const greetingName = String(firstName || "").trim();
  const headerLine = greetingName
    ? `${tgEmoji("speaker", "📢")} <b>${esc(toSmallCaps(`WELCOME ${greetingName.toUpperCase()} • CRICXCRATE`))}</b> ${tgEmoji("free", "🆓")}`
    : `${tgEmoji("speaker", "📢")} <b>${esc(toSmallCaps("WELCOME TO CRICXCRATE STREAM BOT"))}</b> ${tgEmoji("free", "🆓")}`;

  const channelIconsRow = [
    `${tgEmoji("cricket", "🏏")} ${esc(toSmallCaps("CRICKET"))}`,
    `${tgEmoji("football", "⚽")} ${esc(toSmallCaps("FOOTBALL"))}`,
    `${tgEmoji("fancode", "🔴")} ${esc(toSmallCaps("FANCODE"))}`,
    `${tgEmoji("willow", "🌐")} ${esc(toSmallCaps("WILLOW"))}`,
    `${tgEmoji("sony", "📺")} ${esc(toSmallCaps("SONY"))}`,
    `${tgEmoji("star", "⭐")} ${esc(toSmallCaps("STAR"))}`,
  ].join("  •  ");

  return [
    headerLine,
    `${channelIconsRow}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    getBotCommandsGuideText(),
  ].join("\n");
}

async function sendJoinPrompt(chatId, missingChannels, callbackQueryId = null) {
  const targetList = missingChannels.length ? missingChannels : REQUIRED_CHANNELS;
  const listLines = targetList.map(
    (ch) => `${tgEmoji("link", "🔗")}  <b>${esc(toSmallCaps(ch.label))}</b>  ⇢  <code>${esc(ch.url)}</code>`
  );

  const text = [
    `${tgEmoji("alert", "⚠️")}  <b>${esc(toSmallCaps("ACCESS LOCKED"))}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ...listLines,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `${tgEmoji("bulb", "💡")}  ${esc(toSmallCaps("JOIN ABOVE & TAP VERIFY"))}  ${tgEmoji("pointDown", "👇🏻")}`,
  ].join("\n\n");

  const keyboardRows = targetList.map((ch) => [
    { text: `➔  ${toSmallCaps(`JOIN ${ch.label}`)}`, url: ch.url },
  ]);
  keyboardRows.push([
    { text: `✅  ${toSmallCaps("VERIFY JOINED")}`, callback_data: "chk:join" },
  ]);

  if (callbackQueryId) {
    await answerCallback(callbackQueryId, toSmallCaps("JOIN REQUIRED FIRST"), true);
  }
  await sendText(chatId, text, { inline_keyboard: keyboardRows });
}

function hasStatusFilter(scope, list) {
  if (scope === "willow" || scope === "star" || scope === "tv") return false;
  return list.some((i) => i.source !== "sportlink");
}

function buildStatusFilterKeyboard(scope, items, bucketId = "") {
  const liveCount = items.filter((i) => normalizeStatus(i.status) === "LIVE").length;
  const upcomingCount = items.filter((i) => normalizeStatus(i.status) === "UPCOMING").length;
  const finishedCount = items.filter((i) => normalizeStatus(i.status) === "FINISHED").length;

  const target = bucketId ? `q:${bucketId}` : `m:${scope}`;

  return {
    inline_keyboard: [
      [
        {
          text: `🔴  ${toSmallCaps("LIVE")} (${liveCount})`,
          callback_data: `flt:LIVE:${target}`,
        },
        {
          text: `⏳  ${toSmallCaps("UPCOMING")} (${upcomingCount})`,
          callback_data: `flt:UPCOMING:${target}`,
        },
      ],
      [
        {
          text: `🔻  ${toSmallCaps("FINISHED")} (${finishedCount})`,
          callback_data: `flt:FINISHED:${target}`,
        },
        {
          text: `${toSmallCaps("ALL")} (${items.length})`,
          callback_data: `flt:ALL:${target}`,
        },
      ],
    ],
  };
}

function buildSelectionKeyboard(items, backData = "") {
  const rows = [];
  for (const item of items.slice(0, 45)) {
    const mark = getStatusButtonMark(item);
    const text = `${mark}  ${toSmallCaps(item.title)}`.slice(0, 60);
    rows.push([{ text, callback_data: `pick:${item.id}` }]);
  }
  if (backData) {
    rows.push([{ text: `↩  ${toSmallCaps("BACK TO OPTIONS")}`, callback_data: backData }]);
  }
  return { inline_keyboard: rows };
}

function buildCommandMenuHeader({ iconKey, fallbackIcon, title, list, showStatusCounts = true }) {
  if (!showStatusCounts) {
    return [
      `${tgEmoji(iconKey, fallbackIcon)}  <b>${esc(toSmallCaps(title))}</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `${tgEmoji("pin", "📌")}  <b>${esc(toSmallCaps("AVAILABLE"))}</b>  ⇢  <b>${list.length}</b>`,
      `${tgEmoji("pointDown", "👇🏻")}  ${esc(toSmallCaps("TAP ONE BELOW"))}`,
    ].join("\n\n");
  }

  const liveCount = list.filter((i) => normalizeStatus(i.status) === "LIVE").length;
  const upcomingCount = list.filter((i) => normalizeStatus(i.status) === "UPCOMING").length;
  const finishedCount = list.filter((i) => normalizeStatus(i.status) === "FINISHED").length;

  return [
    `${tgEmoji(iconKey, fallbackIcon)}  <b>${esc(toSmallCaps(title))}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `${tgEmoji("live", "🔴")}  <b>${esc(toSmallCaps("LIVE"))}</b>  ⇢  <b>${liveCount}</b>    |    ${tgEmoji("upcoming", "⏳")}  <b>${esc(toSmallCaps("UPCOMING"))}</b>  ⇢  <b>${upcomingCount}</b>    |    ${tgEmoji("ended", "🔻")}  <b>${esc(toSmallCaps("FINISHED"))}</b>  ⇢  <b>${finishedCount}</b>`,
    `${tgEmoji("pointDown", "👇🏻")}  ${esc(toSmallCaps("CHOOSE STATUS OPTION BELOW"))}`,
  ].join("\n\n");
}

async function sendStreamCard(chatId, item, req = null) {
  const leadMark = getCardLeadEmoji(item);
  const titleLine = `${leadMark} <b>${esc(String(item.title || "").toUpperCase())}</b>`;
  const timeLine = `${tgEmoji("calendar", "🕒")} <b>${esc(item.timingLabel || "Date & Time")}:</b> ${esc(item.timingValue || "TBA")}`;

  if (!item.streams?.length) {
    const noStreamMsg = [
      titleLine,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      timeLine,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `${tgEmoji("wrong", "❌")} <b>${esc(toSmallCaps("NO ACTIVE STREAM RIGHT NOW"))}</b>`,
      `${tgEmoji("bulb", "💡")} Copy link & open in NS Player / VLC to play stream.`,
    ].join("\n");

    await sendText(chatId, noStreamMsg);
    return;
  }

  const streamBlocks = item.streams.map((s) => {
    const streamHeading =
      item.streams.length === 1 && s.label === "STREAM URL"
        ? `${tgEmoji("bulb", "🍿")} <b>STREAM URL:</b>`
        : `${tgEmoji("link", "🍿")} <b>${esc(String(s.label || "STREAM URL").toUpperCase())}:</b>`;
    return `${streamHeading}\n<code>${esc(s.line)}</code>`;
  });

  const cardText = [
    titleLine,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    timeLine,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ...streamBlocks,
    ``,
    `${tgEmoji("bulb", "💡")} Copy link & open in NS Player / VLC to play stream.`,
    `${tgEmoji("upcoming", "⏳")} Auto-deletes in ${AUTO_DELETE_DELAY_SEC} seconds.`,
  ].join("\n");

  const sent = await sendText(chatId, cardText);
  const sentMsgId = sent?.result?.message_id;
  if (sentMsgId) {
    const sched = await scheduleDeleteMessage(chatId, sentMsgId, req, AUTO_DELETE_DELAY_SEC).catch(
      (e) => ({ ok: false, reason: e.message })
    );
    if (!sched?.ok) {
      await sendText(chatId, `⚠️ <code>${esc(sched?.reason || "QSTASH_FAILED")}</code>`).catch(() => {});
    }
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
  return await telegramApi("sendMessage", payload);
}

async function editMessage(chatId, messageId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: String(text).slice(0, 4090),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await telegramApi("editMessageText", payload).catch(async () => {
    await sendText(chatId, text, replyMarkup);
  });
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
    const queryAction = String(req.query?.action || "").toLowerCase();
    if (queryAction === "delete") {
      const { chat_id: chatId, message_id: messageId } = req.body || {};
      if (chatId && messageId) {
        await telegramApi("deleteMessage", {
          chat_id: chatId,
          message_id: messageId,
        }).catch(() => {});
      }
      return res.status(200).json({ ok: true, deleted: true });
    }

    const update = req.body || {};

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq?.message?.chat?.id;
      const messageId = cq?.message?.message_id;
      const userId = cq?.from?.id;
      const data = String(cq?.data || "");
      const [prefix, arg1, arg2, arg3] = data.split(":");

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
            `${tgEmoji("tick", "✅")}  <b>${esc(toSmallCaps("VERIFIED"))}</b>`,
            `━━━━━━━━━━━━━━━━━━━━━━━━`,
            getWelcomeMessageText(cq?.from?.first_name || ""),
          ].join("\n\n")
        );
        return res.status(200).json({ ok: true });
      }

      if (chatId && prefix === "flt") {
        const sub = await checkRequiredChannels(userId);
        if (!sub.allowed) {
          await sendJoinPrompt(chatId, sub.missing, cq.id);
          return res.status(200).json({ ok: true });
        }

        const statusFilter = String(arg1 || "ALL").toUpperCase();
        const kind = arg2;
        const val = arg3;

        const all = await loadAllEntries("all");
        let baseList = [];
        let backData = "";
        let headerTitle = "MATCHES";

        if (kind === "m") {
          backData = `menu:${val}`;
          if (val === "willow") {
            baseList = all.filter((i) => i.network === "willow");
            headerTitle = "WILLOW (IST)";
          } else if (val === "star") {
            baseList = all.filter((i) => i.network === "star");
            headerTitle = "STAR";
          } else if (val === "sony" || val === "sonyliv") {
            baseList = all.filter((i) => i.network === "sony" || i.searchText.includes("sony"));
            headerTitle = "SONYLIV";
          } else if (val === "cricket") {
            baseList = all.filter(
              (i) => i.network === "willow" || i.category.toLowerCase() === "cricket" || i.searchText.includes("cricket")
            );
            headerTitle = "CRICKET";
          } else if (val === "fancode") {
            baseList = all.filter((i) => i.source === "fancode");
            headerTitle = "FANCODE";
          } else {
            baseList = all;
            headerTitle = "ALL STREAMS";
          }
        } else if (kind === "q") {
          backData = `menu:q:${val}`;
          const ids = getSearchBucket(val);
          baseList = ids.map((id) => all.find((x) => x.id === id)).filter(Boolean);
          headerTitle = "SEARCH RESULTS";
        }

        const filtered =
          statusFilter === "ALL"
            ? baseList
            : baseList.filter((i) => i.source !== "sportlink" && normalizeStatus(i.status) === statusFilter);

        await answerCallback(cq.id, toSmallCaps(`${statusFilter} (${filtered.length})`));

        if (!filtered.length) {
          await editMessage(
            chatId,
            messageId,
            [
              `${tgEmoji("wrong", "❌")}  <b>${esc(toSmallCaps(`${headerTitle} • ${statusFilter}`))}</b>`,
              `━━━━━━━━━━━━━━━━━━━━━━━━`,
              `${tgEmoji("bulb", "💡")}  ${esc(toSmallCaps("NO ITEMS IN THIS STATUS RIGHT NOW"))}`,
            ].join("\n\n"),
            {
              inline_keyboard: [
                [{ text: `↩  ${toSmallCaps("BACK TO OPTIONS")}`, callback_data: backData }],
              ],
            }
          );
          return res.status(200).json({ ok: true });
        }

        const text = [
          `${tgEmoji("pin", "📌")}  <b>${esc(toSmallCaps(`${headerTitle} • ${statusFilter}`))}</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━━━`,
          `${tgEmoji("bulb", "💡")}  <b>${esc(toSmallCaps("SHOWING"))}</b>  ⇢  <b>${filtered.length}</b>`,
          `${tgEmoji("pointDown", "👇🏻")}  ${esc(toSmallCaps("TAP A MATCH BELOW"))}`,
        ].join("\n\n");

        await editMessage(chatId, messageId, text, buildSelectionKeyboard(filtered, backData));
        return res.status(200).json({ ok: true });
      }

      if (chatId && prefix === "menu") {
        const sub = await checkRequiredChannels(userId);
        if (!sub.allowed) {
          await sendJoinPrompt(chatId, sub.missing, cq.id);
          return res.status(200).json({ ok: true });
        }

        const all = await loadAllEntries("all");
        if (arg1 === "q" && arg2) {
          const ids = getSearchBucket(arg2);
          const list = ids.map((id) => all.find((x) => x.id === id)).filter(Boolean);
          const showStatus = hasStatusFilter("all", list);
          await answerCallback(cq.id, toSmallCaps("OPTIONS"));
          await editMessage(
            chatId,
            messageId,
            buildCommandMenuHeader({
              iconKey: "searching",
              fallbackIcon: "🔎",
              title: "MATCH RESULTS",
              list,
              showStatusCounts: showStatus,
            }),
            showStatus ? buildStatusFilterKeyboard("all", list, arg2) : buildSelectionKeyboard(list)
          );
          return res.status(200).json({ ok: true });
        }

        const scope = arg1 || "all";
        const list =
          scope === "willow"
            ? all.filter((i) => i.network === "willow")
            : scope === "star"
              ? all.filter((i) => i.network === "star")
              : scope === "sony" || scope === "sonyliv"
                ? all.filter((i) => i.network === "sony" || i.searchText.includes("sony"))
                : scope === "cricket"
                  ? all.filter(
                      (i) => i.network === "willow" || i.category.toLowerCase() === "cricket" || i.searchText.includes("cricket")
                    )
                  : scope === "fancode"
                    ? all.filter((i) => i.source === "fancode")
                    : all;

        const meta =
          scope === "willow"
            ? { iconKey: "willow", fallbackIcon: "🌐", title: "WILLOW (IST)" }
            : scope === "star"
              ? { iconKey: "star", fallbackIcon: "⭐", title: "STAR" }
              : scope === "sony" || scope === "sonyliv"
                ? { iconKey: "sony", fallbackIcon: "📺", title: "SONYLIV" }
                : scope === "cricket"
                  ? { iconKey: "cricket", fallbackIcon: "🏏", title: "CRICKET" }
                  : scope === "fancode"
                    ? { iconKey: "fancode", fallbackIcon: "🔴", title: "FANCODE" }
                    : { iconKey: "searching", fallbackIcon: "🔎", title: "ALL STREAMS" };

        const showStatus = hasStatusFilter(scope, list);
        await answerCallback(cq.id, toSmallCaps("OPTIONS"));
        await editMessage(
          chatId,
          messageId,
          buildCommandMenuHeader({ ...meta, list, showStatusCounts: showStatus }),
          showStatus ? buildStatusFilterKeyboard(scope, list) : buildSelectionKeyboard(list)
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
        await sendStreamCard(chatId, selected, req);
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
            `${tgEmoji("pin", "📌")}  <b>${esc(toSmallCaps("CUSTOM EMOJI IDS"))}</b>\n\n${lines.join("\n")}`
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

    if (cmd === "/start") {
      await sendText(chatId, getWelcomeMessageText(msg?.from?.first_name || ""));
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/help") {
      await sendText(
        chatId,
        [
          `${tgEmoji("help", "ℹ️")} <b>${esc(toSmallCaps("BOT GUIDE & COMMANDS"))}</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━━━`,
          getBotCommandsGuideText(),
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/cricket" && !extra) {
      const list = await loadAllEntries("cricket");
      if (!list.length) {
        await sendText(chatId, `${tgEmoji("wrong", "❌")}  <b>${esc(toSmallCaps("NOTHING AVAILABLE RIGHT NOW"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      await sendText(
        chatId,
        buildCommandMenuHeader({
          iconKey: "cricket",
          fallbackIcon: "🏏",
          title: "CRICKET",
          list,
          showStatusCounts: true,
        }),
        buildStatusFilterKeyboard("cricket", list)
      );
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/fancode" && !extra) {
      const list = await loadAllEntries("fancode");
      if (!list.length) {
        await sendText(chatId, `${tgEmoji("wrong", "❌")}  <b>${esc(toSmallCaps("NOTHING AVAILABLE RIGHT NOW"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      await sendText(
        chatId,
        buildCommandMenuHeader({
          iconKey: "fancode",
          fallbackIcon: "🔴",
          title: "FANCODE",
          list,
          showStatusCounts: true,
        }),
        buildStatusFilterKeyboard("fancode", list)
      );
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/tv") {
      const allTv = await loadAllEntries("tv");
      const q = extra.toLowerCase();
      const matchedTv = q
        ? allTv.filter((item) => q.split(/\s+/).every((t) => item.searchText.includes(t)))
        : allTv;

      if (!matchedTv.length) {
        await sendText(
          chatId,
          [
            `${tgEmoji("wrong", "❌")}  <b>${esc(toSmallCaps(`NO TV CHANNELS : ${extra.toUpperCase()}`))}</b>`,
            `━━━━━━━━━━━━━━━━━━━━━━━━`,
            `${tgEmoji("searching", "🔎")}  ${esc(toSmallCaps("TRY /tv OR ANOTHER CHANNEL NAME"))}`,
          ].join("\n\n")
        );
        return res.status(200).json({ ok: true });
      }

      if (matchedTv.length === 1) {
        await sendStreamCard(chatId, matchedTv[0], req);
        return res.status(200).json({ ok: true });
      }

      await sendText(
        chatId,
        buildCommandMenuHeader({
          iconKey: "sony",
          fallbackIcon: "📺",
          title: q ? `TV : ${extra.toUpperCase()}` : "LIVE TV CHANNELS",
          list: matchedTv,
          showStatusCounts: false,
        }),
        buildSelectionKeyboard(matchedTv)
      );
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/willow" && !extra) {
      const list = await loadAllEntries("willow");
      if (!list.length) {
        await sendText(chatId, `${tgEmoji("wrong", "❌")}  <b>${esc(toSmallCaps("NOTHING AVAILABLE RIGHT NOW"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      await sendText(
        chatId,
        buildCommandMenuHeader({
          iconKey: "willow",
          fallbackIcon: "🌐",
          title: "WILLOW (IST)",
          list,
          showStatusCounts: true,
        }),
        buildStatusFilterKeyboard("willow", list)
      );
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/star" && !extra) {
      const list = await loadAllEntries("star");
      if (!list.length) {
        await sendText(chatId, `${tgEmoji("wrong", "❌")}  <b>${esc(toSmallCaps("NOTHING AVAILABLE RIGHT NOW"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      await sendText(
        chatId,
        buildCommandMenuHeader({
          iconKey: "star",
          fallbackIcon: "⭐",
          title: "STAR",
          list,
          showStatusCounts: false,
        }),
        buildSelectionKeyboard(list)
      );
      return res.status(200).json({ ok: true });
    }

    if ((cmd === "/sony" || cmd === "/sonyliv") && !extra) {
      const list = await loadAllEntries("sony");
      if (!list.length) {
        await sendText(chatId, `${tgEmoji("wrong", "❌")}  <b>${esc(toSmallCaps("NOTHING AVAILABLE RIGHT NOW"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      const showStatus = hasStatusFilter("sony", list);
      await sendText(
        chatId,
        buildCommandMenuHeader({
          iconKey: "sony",
          fallbackIcon: "📺",
          title: "SONYLIV",
          list,
          showStatusCounts: showStatus,
        }),
        showStatus ? buildStatusFilterKeyboard("sony", list) : buildSelectionKeyboard(list)
      );
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
          `${tgEmoji("wrong", "❌")}  <b>${esc(toSmallCaps(`NO RESULTS : ${query.toUpperCase()}`))}</b>`,
          `━━━━━━━━━━━━━━━━━━━━━━━━`,
          `${tgEmoji("searching", "🔎")}  ${esc(toSmallCaps("TRY ANOTHER KEYWORD OR /help"))}`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    if (matched.length === 1) {
      await sendStreamCard(chatId, matched[0], req);
      return res.status(200).json({ ok: true });
    }

    const showStatus = hasStatusFilter("all", matched);
    const bucketId = showStatus ? storeSearchBucket(matched) : "";
    await sendText(
      chatId,
      buildCommandMenuHeader({
        iconKey: "searching",
        fallbackIcon: "🔎",
        title: `RESULTS : ${query.toUpperCase()}`,
        list: matched,
        showStatusCounts: showStatus,
      }),
      showStatus ? buildStatusFilterKeyboard("all", matched, bucketId) : buildSelectionKeyboard(matched)
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

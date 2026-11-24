import crypto from "node:crypto";

const TSDB_BASE = "https://www.thesportsdb.com";
const TSDB_API_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const FOOTX_WATCH_BASE = "https://footxcrate.pages.dev/45#watch";

const FOOTX_DATA_URLS = [
  "https://sonujson-v6.pages.dev/Data/events/allinone.json",
  "https://raw.githubusercontent.com/sm-monirulislam/Upcoming-and-Live-Sports-Data/main/Sports_data.json",
];

const BATCH_SIZE = 6;
const MAX_POOL = 24;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${TSDB_BASE}/`,
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

function makeBatchId(query) {
  return crypto
    .createHash("sha1")
    .update(`${String(query).toLowerCase()}|${Date.now()}|${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
}

function resolveUrl(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, TSDB_BASE).toString();
  } catch {
    return "";
  }
}

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeThumb16x9(url) {
  const clean = resolveUrl(url);
  if (!clean) return "";
  if (/\/images\/media\/event\/(poster|square|banner)\//i.test(clean)) {
    return "";
  }
  return clean.replace(/\/(preview|tiny|small)$/i, "");
}

function cleanPhrase(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\b(fc|wfc|kv|sk|sc|fk|u17|u19|u21|u23|women|men|xi|ii)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonDate(value) {
  if (!value) return null;
  let s = String(value).trim();
  if (!s || s === "null" || s === "undefined") return null;
  const ist = /\bIST\b/i.test(s);
  if (ist) s = s.replace(/\s*IST\s*$/i, "").trim();

  const m1 = s.match(
    /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (m1) {
    const [, y, mo, d, h, mi, se = "00"] = m1;
    const dt = new Date(
      `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:${se}${
        ist ? "+05:30" : "Z"
      }`
    );
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m2) {
    const [, d, mo, y, h, mi, se] = m2;
    const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatIstFromDate(dt, fallbackStr = "") {
  if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
    return (
      dt.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }) + " IST"
    );
  }
  return String(fallbackStr || "").trim();
}

function normalizeStatus(rawStatus, st, en) {
  const s = String(rawStatus || "").trim().toUpperCase();
  if (s === "LIVE") return "LIVE";
  if (s === "UPCOMING" || s === "SOON") return "UPCOMING";
  if (s === "ENDED" || s === "FINISHED" || s === "COMPLETED" || s === "DONE") {
    return "COMPLETED";
  }

  if (st instanceof Date && !Number.isNaN(st.getTime())) {
    const now = Date.now();
    const endMs =
      en instanceof Date && !Number.isNaN(en.getTime())
        ? en.getTime()
        : st.getTime() + 3 * 3600000;
    if (now >= st.getTime() && now <= endMs) return "LIVE";
    if (now > endMs) return "COMPLETED";
    return "UPCOMING";
  }
  return "SCHEDULED";
}

function getStatusBadge(status) {
  if (status === "LIVE") return "🔺";
  if (status === "UPCOMING") return "⏳";
  if (status === "COMPLETED") return "🔻";
  return "📌";
}

async function fetchResource(url, asJson = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: DEFAULT_HEADERS,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return asJson ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseFootxEvents(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
    ? data.events
    : Array.isArray(data?.matches)
    ? data.matches
    : Object.values(data || {});

  if (!Array.isArray(list)) return [];
  const parsed = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const evObj = item.event || item.eventInfo || item.matchInfo || {};
    const teamA = String(evObj.teamA || item.teamA || item.homeTeam || "").trim();
    const teamB = String(evObj.teamB || item.teamB || item.awayTeam || "").trim();
    const matchTitle = String(
      item.title ||
        evObj.name ||
        (teamA && teamB ? `${teamA} vs ${teamB}` : item.name || "")
    ).trim();

    if (!matchTitle) continue;

    const eventId = String(
      item.id ?? matchTitle.toLowerCase().replace(/[^a-z0-9]/g, "")
    ).trim();
    const sport = String(
      item.cat || item.Category || item.sport || evObj.category || ""
    ).trim();
    const comp = String(
      evObj.name !== matchTitle ? evObj.name || evObj.type || "" : evObj.type || ""
    ).trim();

    const rawStart = evObj.startTimeIST || evObj.startTime || item.startTimeIST || item.startTime || "";
    const rawEnd = evObj.endTimeIST || evObj.endTime || item.endTimeIST || item.endTime || "";
    const st = parseJsonDate(rawStart);
    let en = parseJsonDate(rawEnd);
    if (st && (!en || en <= st)) en = new Date(st.getTime() + 3 * 3600000);

    const rawStreams = Array.isArray(item.streams)
      ? item.streams
      : Array.isArray(evObj.streams)
      ? evObj.streams
      : [];

    const streams = [];
    for (let i = 0; i < rawStreams.length; i++) {
      const s = rawStreams[i];
      if (!s) continue;
      const channelName = String(
        s.title || s.channel_name || s.name || `Stream ${i + 1}`
      ).trim();
      const rawSid = s.stream_id ?? s.id ?? channelName;
      const streamId =
        String(rawSid)
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "_") || `stream_${i + 1}`;
      streams.push({ id: streamId, title: channelName });
    }

    parsed.push({
      id: eventId,
      title: matchTitle,
      teamA,
      teamB,
      sport,
      comp,
      dateDisplay: formatIstFromDate(st, rawStart),
      status: normalizeStatus(item.status, st, en),
      streams,
    });
  }

  return parsed;
}

async function loadFootxEventsCatalog() {
  const results = await Promise.allSettled(
    FOOTX_DATA_URLS.map((u) => fetchResource(u, true))
  );

  const combined = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      combined.push(...parseFootxEvents(r.value));
    }
  }

  const byKey = new Map();
  for (const ev of combined) {
    const key = ev.id ? `id:${ev.id}` : `t:${cleanPhrase(ev.title)}`;
    if (!byKey.has(key)) {
      byKey.set(key, { ...ev, streams: [...ev.streams] });
    } else {
      const existing = byKey.get(key);
      for (const st of ev.streams) {
        if (!existing.streams.some((x) => x.id === st.id)) {
          existing.streams.push(st);
        }
      }
      if (!existing.dateDisplay && ev.dateDisplay) existing.dateDisplay = ev.dateDisplay;
      if (!existing.comp && ev.comp) existing.comp = ev.comp;
      if (!existing.sport && ev.sport) existing.sport = ev.sport;
    }
  }

  return Array.from(byKey.values());
}

function buildQueryVariations(query) {
  const raw = String(query || "").trim();
  if (!raw) return [];

  const variations = new Set([raw]);
  const splitVs = raw
    .split(/\s+(?:vs?\.?|@|-|\/)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (splitVs.length >= 2) {
    const left = splitVs[0];
    const right = splitVs.slice(1).join(" ");
    variations.add(`${left} vs ${right}`);
    variations.add(`${right} vs ${left}`);
    variations.add(`${left} ${right}`);
    variations.add(`${right} ${left}`);
  } else {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      variations.add([...words].reverse().join(" "));
    }
  }

  return Array.from(variations);
}

function filterCatalogByQuery(catalog, query) {
  const cleanQ = cleanPhrase(query);
  if (!cleanQ) return [];

  const tokens = cleanQ.split(/\s+/).filter((t) => t.length >= 2);
  if (!tokens.length) return [];

  const splitVs = String(query || "")
    .split(/\s+(?:vs?\.?|@|-|\/)\s+/i)
    .map((s) => cleanPhrase(s))
    .filter(Boolean);

  const matches = [];

  for (const ev of catalog) {
    const hayTitle = cleanPhrase(ev.title);
    const hayA = cleanPhrase(ev.teamA);
    const hayB = cleanPhrase(ev.teamB);
    const hayMeta = cleanPhrase(`${ev.title} ${ev.teamA} ${ev.teamB} ${ev.comp} ${ev.sport}`);

    let matched = false;
    if (splitVs.length >= 2) {
      const side1 = splitVs[0];
      const side2 = splitVs.slice(1).join(" ");
      const hasSide1 = hayA.includes(side1) || hayB.includes(side1) || hayTitle.includes(side1);
      const hasSide2 = hayA.includes(side2) || hayB.includes(side2) || hayTitle.includes(side2);
      matched = hasSide1 && hasSide2;
    } else {
      matched = tokens.every((tok) => hayMeta.includes(tok));
    }

    if (matched) {
      const firstStreamId = ev.streams?.[0]?.id || "0";
      matches.push({
        ...ev,
        watchUrl: `${FOOTX_WATCH_BASE}?id=${encodeURIComponent(
          ev.id
        )}&stream_id=${encodeURIComponent(firstStreamId)}`,
      });
    }
  }

  return matches.slice(0, MAX_POOL);
}

function scoreCandidateEvent(candTitle, targetEv) {
  const candClean = cleanPhrase(candTitle);
  const aClean = cleanPhrase(targetEv.teamA);
  const bClean = cleanPhrase(targetEv.teamB);
  const tClean = cleanPhrase(targetEv.title);

  if (aClean && bClean) {
    const hasA = candClean.includes(aClean);
    const hasB = candClean.includes(bClean);
    if (hasA && hasB) return 100;
    if (hasA || hasB) return 40;
  }

  const targetTokens = tClean.split(/\s+/).filter((t) => t.length >= 2);
  if (!targetTokens.length) return 0;
  const hitCount = targetTokens.filter((tok) => candClean.includes(tok)).length;
  return Math.round((hitCount / targetTokens.length) * 80);
}

function extractBestThumbFromBrowseHtml(html, targetEv) {
  const eventsSectionMatch = html.match(/Events<\/h\d>([\s\S]*?)(?:<h\d|<footer|$)/i);
  const scopeHtml = eventsSectionMatch ? eventsSectionMatch[1] : html;

  const anchorRegex =
    /<a[^>]+href=["']([^"']*\/event\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  let bestThumb = "";
  let bestScore = 0;

  while ((m = anchorRegex.exec(scopeHtml)) !== null) {
    const inner = m[2] || "";
    const imgMatch =
      inner.match(/data-src=["']([^"']+)["']/i) ||
      inner.match(/src=["']([^"']+)["']/i);
    const thumb = normalizeThumb16x9(imgMatch?.[1] || "");
    if (!thumb) continue;

    const label = stripTags(inner).replace(/^[^a-zA-Z0-9]+/, "").trim();
    const sc = scoreCandidateEvent(label, targetEv);
    if (sc > bestScore) {
      bestScore = sc;
      bestThumb = thumb;
    }
  }

  return bestScore >= 60 ? bestThumb : "";
}

async function searchApiThumbForEvent(searchTerm, targetEv) {
  const formatted = String(searchTerm || "").trim().replace(/\s+/g, "_");
  if (!formatted) return "";
  const apiUrl = `${TSDB_API_BASE}/searchevents.php?e=${encodeURIComponent(formatted)}`;

  try {
    const json = await fetchResource(apiUrl, true);
    const list = Array.isArray(json?.event) ? json.event : [];
    let bestThumb = "";
    let bestScore = 0;

    for (const ev of list) {
      const thumb = normalizeThumb16x9(ev?.strThumb || "");
      if (!thumb) continue;
      const sc = scoreCandidateEvent(ev?.strEvent || "", targetEv);
      if (sc > bestScore) {
        bestScore = sc;
        bestThumb = thumb;
      }
    }

    return bestScore >= 60 ? bestThumb : "";
  } catch {
    return "";
  }
}

async function fetchThumbForJsonEvent(jsonEv, userQuery) {
  const terms = [];
  if (jsonEv.teamA && jsonEv.teamB && cleanPhrase(jsonEv.teamA) !== cleanPhrase(jsonEv.teamB)) {
    terms.push(`${jsonEv.teamA} vs ${jsonEv.teamB}`);
    terms.push(`${jsonEv.teamB} vs ${jsonEv.teamA}`);
  }
  terms.push(jsonEv.title);
  if (jsonEv.comp) terms.push(jsonEv.comp);
  for (const v of buildQueryVariations(userQuery)) {
    terms.push(v);
  }
  const uniqueTerms = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];

  for (const term of uniqueTerms) {
    const [browseRes, apiRes] = await Promise.allSettled([
      fetchResource(`${TSDB_BASE}/browse?s=${encodeURIComponent(term)}`, false),
      searchApiThumbForEvent(term, jsonEv),
    ]);

    if (apiRes.status === "fulfilled" && apiRes.value) {
      return apiRes.value;
    }
    if (browseRes.status === "fulfilled" && browseRes.value) {
      const htmlThumb = extractBestThumbFromBrowseHtml(browseRes.value, jsonEv);
      if (htmlThumb) return htmlThumb;
    }
  }

  return "";
}

async function resolveJsonMatchesWith16x9Thumbnails(query) {
  const catalog = await loadFootxEventsCatalog();
  if (!catalog.length) return [];

  let matchedEvents = [];
  for (const qVar of buildQueryVariations(query)) {
    const hits = filterCatalogByQuery(catalog, qVar);
    for (const h of hits) {
      if (!matchedEvents.some((x) => x.id === h.id)) {
        matchedEvents.push(h);
      }
    }
  }

  matchedEvents = matchedEvents.slice(0, MAX_POOL);
  if (!matchedEvents.length) return [];

  const finalCards = [];
  const seenThumbs = new Set();

  for (const ev of matchedEvents) {
    const thumb16x9 = await fetchThumbForJsonEvent(ev, query);
    if (!thumb16x9) continue;
    if (seenThumbs.has(thumb16x9)) continue;
    seenThumbs.add(thumb16x9);
    finalCards.push({ ...ev, thumb16x9 });
    if (finalCards.length >= MAX_POOL) break;
  }

  return finalCards;
}

function formatPremiumCaption(ev, positionNumber, totalCount) {
  const badge = getStatusBadge(ev.status);
  const lines = [
    `╔══════════════════════════╗`,
    `${badge}  <b>${esc(toSmallCaps(ev.title))}</b>`,
    `╚══════════════════════════╝`,
    `📌  ${esc(toSmallCaps("CARD"))}      ⟶  <code>#${positionNumber} / ${totalCount}</code>`,
    `⚡  ${esc(toSmallCaps("STATUS"))}    ⟶  <b>${esc(toSmallCaps(ev.status))}</b>`,
    `📐  ${esc(toSmallCaps("ASPECT"))}    ⟶  <code>16:9 HD</code>`,
  ];

  if (ev.dateDisplay) {
    lines.push(`🕒  ${esc(toSmallCaps("SCHEDULE"))}  ⟶  <code>${esc(ev.dateDisplay)}</code>`);
  }
  if (ev.comp) {
    lines.push(`🏆  ${esc(toSmallCaps("TOURNEY"))}   ⟶  <b>${esc(toSmallCaps(ev.comp))}</b>`);
  } else if (ev.sport) {
    lines.push(`🏆  ${esc(toSmallCaps("SPORT"))}     ⟶  <b>${esc(toSmallCaps(ev.sport))}</b>`);
  }
  if (ev.watchUrl) {
    lines.push(
      `🎬  ${esc(toSmallCaps("WATCH"))}     ⟶  <a href="${esc(ev.watchUrl)}">${esc(
        toSmallCaps("OPEN STREAM")
      )}</a>`
    );
  }

  return lines.join("\n").slice(0, 1020);
}

function buildCardKeyboard(ev, batchId, nextOffset, totalCount) {
  const rows = [];

  if (ev?.watchUrl && /^https:\/\//i.test(ev.watchUrl) && ev.watchUrl.length <= 2048) {
    rows.push([{ text: `🎬  ${toSmallCaps("WATCH STREAM")}`, url: ev.watchUrl }]);
  }

  if (batchId && nextOffset < totalCount) {
    const remaining = Math.max(0, totalCount - nextOffset);
    const nextCount = Math.min(BATCH_SIZE, remaining);
    rows.push([
      {
        text: `➔  ${toSmallCaps(`MORE ( +${nextCount} )`)}`,
        callback_data: `more:${batchId}:${nextOffset}`,
      },
    ]);
  }

  return rows.length ? { inline_keyboard: rows } : null;
}

async function sendPhotoCard(chatId, ev, positionNumber, totalCount, replyMarkup = null) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_TOKEN");

  const payload = {
    chat_id: chatId,
    photo: ev.thumb16x9,
    caption: formatPremiumCaption(ev, positionNumber, totalCount),
    parse_mode: "HTML",
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    await sendText(
      chatId,
      [
        `📌  <b>${esc(toSmallCaps(ev.title))}</b>`,
        `⚠️  ${esc(toSmallCaps("PHOTO PREVIEW UNAVAILABLE"))}`,
      ].join("\n\n"),
      replyMarkup
    );
  }
}

async function sendText(chatId, text, replyMarkup = null) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_TOKEN");

  const payload = {
    chat_id: chatId,
    text: String(text).slice(0, 4090),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

async function answerCallback(id, text = "", alert = false) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token || !id) return;

  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: id,
      text: String(text).slice(0, 195),
      show_alert: alert,
    }),
  }).catch(() => {});
}

const batchStore = new Map();

function saveBatch(batchId, items, query) {
  batchStore.set(batchId, {
    items,
    query,
    exp: Date.now() + 30 * 60 * 1000,
  });
}

function getBatch(batchId) {
  const entry = batchStore.get(batchId);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    batchStore.delete(batchId);
    return null;
  }
  return entry;
}

async function dispatchSlice(chatId, batchId, items, startIndex) {
  const total = items.length;
  const endIndex = Math.min(total, startIndex + BATCH_SIZE);
  const hasMore = endIndex < total;

  for (let i = startIndex; i < endIndex; i++) {
    const isLastInBatch = i === endIndex - 1;
    const markup = buildCardKeyboard(
      items[i],
      isLastInBatch && hasMore ? batchId : null,
      endIndex,
      total
    );
    await sendPhotoCard(chatId, items[i], i + 1, total, markup);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("JSON Match 16:9 Bot Active");
  if (req.method !== "POST") return res.status(405).end();

  try {
    const update = req.body || {};

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq?.message?.chat?.id;
      const data = String(cq?.data || "");
      const [prefix, batchId, offsetStr] = data.split(":");

      if (chatId && prefix === "more") {
        const batch = getBatch(batchId);
        const offset = Number(offsetStr || 0);

        if (!batch || !Array.isArray(batch.items) || offset >= batch.items.length) {
          await answerCallback(cq.id, toSmallCaps("NO MORE RESULTS OR EXPIRED"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps("LOADING MORE 16:9 CARDS"));
        await dispatchSlice(chatId, batchId, batch.items, offset);
        return res.status(200).json({ ok: true });
      }

      return res.status(200).json({ ok: true });
    }

    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const rawText = String(msg?.text || "").trim();

    if (!chatId || !rawText.startsWith("/")) {
      return res.status(200).json({ ok: true });
    }

    const [first, ...rest] = rawText.split(/\s+/);
    const cmd = first.split("@")[0].toLowerCase();
    const extra = rest.join(" ").trim();

    if (cmd === "/start" || cmd === "/help") {
      await sendText(
        chatId,
        [
          `╔══════════════════════════╗`,
          `📌  <b>${esc(toSmallCaps("JSON MATCH 16:9 STUDIO"))}</b>`,
          `╚══════════════════════════╝`,
          `➠  <code>/india vs new zealand</code>  ⇢  ${esc(toSmallCaps("EX: CRICKET MATCH"))}\n` +
            `➠  <code>/india vs bangladesh</code>   ⇢  ${esc(toSmallCaps("EX: REVERSE OR PARTIAL"))}\n` +
            `➥  <code>/find &lt;query&gt;</code>          ⇢  ${esc(toSmallCaps("EX: /find arsenal"))}`,
        ].join("\n")
      );
      return res.status(200).json({ ok: true });
    }

    const query =
      cmd === "/find" || cmd === "/search" ? extra : `${cmd.slice(1)} ${extra}`.trim();
    if (!query) {
      await sendText(
        chatId,
        [
          `📌  <b>${esc(toSmallCaps("ENTER A MATCH OR TEAM QUERY"))}</b>`,
          `➠  ${esc(toSmallCaps("EXAMPLE"))} 1  ⇢  <code>/india vs new zealand</code>`,
          `➥  ${esc(toSmallCaps("EXAMPLE"))} 2  ⇢  <code>/arsenal vs borussia dortmund</code>`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    const cards = await resolveJsonMatchesWith16x9Thumbnails(query);
    if (!cards.length) {
      await sendText(
        chatId,
        [
          `🛑  <b>${esc(toSmallCaps(query))}</b>`,
          `➥  ${esc(toSmallCaps("NO MATCH IN JSON OR 16:9 THUMB"))}`,
          `➠  ${esc(toSmallCaps("TRY EX"))}  ⇢  <code>/india vs new zealand</code>`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    const batchId = makeBatchId(query);
    saveBatch(batchId, cards, query);
    await dispatchSlice(chatId, batchId, cards, 0);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

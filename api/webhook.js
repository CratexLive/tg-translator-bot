import crypto from "node:crypto";

const TSDB_BASE = "https://www.thesportsdb.com";
const TSDB_API_BASE = "https://www.thesportsdb.com/api/v1/json/3";
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

function formatIstFromUtc(dateStr, timeStr) {
  const d = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const cleanTime = String(timeStr || "00:00:00").trim();
  const iso = `${d}T${/^\d{2}:\d{2}/.test(cleanTime) ? cleanTime : "00:00:00"}Z`;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return d;

  const hasClock = /^\d{2}:\d{2}/.test(cleanTime) && cleanTime !== "00:00:00";
  if (!hasClock) {
    return new Date(parsed).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    new Date(parsed).toLocaleString("en-IN", {
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

function computeMatchStatus(dateStr, timeStr) {
  const d = String(dateStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "SCHEDULED";
  const cleanTime = String(timeStr || "").trim();
  if (!/^\d{2}:\d{2}/.test(cleanTime) || cleanTime === "00:00:00") return "SCHEDULED";

  const startMs = Date.parse(`${d}T${cleanTime}Z`);
  if (!Number.isFinite(startMs)) return "SCHEDULED";

  const now = Date.now();
  const estDurationMs = 3 * 60 * 60 * 1000;
  if (now >= startMs && now <= startMs + estDurationMs) return "LIVE";
  if (now > startMs + estDurationMs) return "COMPLETED";
  return "UPCOMING";
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

function extractBrowseEventsFromHtml(html) {
  const results = [];
  const seen = new Set();

  const eventsSectionMatch = html.match(/Events<\/h\d>([\s\S]*?)(?:<h\d|<footer|$)/i);
  const scopeHtml = eventsSectionMatch ? eventsSectionMatch[1] : html;

  const anchorRegex = /<a[^>]+href=["']([^"']*\/event\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRegex.exec(scopeHtml)) !== null) {
    const eventUrl = resolveUrl(m[1]);
    const inner = m[2] || "";
    if (!eventUrl || seen.has(eventUrl.toLowerCase())) continue;

    const imgMatch =
      inner.match(/data-src=["']([^"']+)["']/i) ||
      inner.match(/src=["']([^"']+)["']/i);
    const thumbUrl = normalizeThumb16x9(imgMatch?.[1] || "");

    const titleText = stripTags(inner)
      .replace(/^[^a-zA-Z0-9]+/, "")
      .trim();
    if (!titleText) continue;

    const dateMatch = titleText.match(/\((\d{4}-\d{2}-\d{2})\)/);
    const rawDate = dateMatch ? dateMatch[1] : "";
    const cleanTitle = titleText.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, "").trim() || titleText;

    seen.add(eventUrl.toLowerCase());
    results.push({
      title: cleanTitle,
      rawDate,
      rawTime: "",
      dateDisplay: formatIstFromUtc(rawDate, ""),
      status: computeMatchStatus(rawDate, ""),
      league: "",
      venue: "",
      round: "",
      eventUrl,
      thumb16x9: thumbUrl,
    });

    if (results.length >= MAX_POOL) break;
  }

  return results;
}

async function searchEventsFromApi(query) {
  const cleanQ = String(query || "").trim();
  if (!cleanQ) return [];

  const formatted = cleanQ.replace(/\s+/g, "_");
  const apiUrl = `${TSDB_API_BASE}/searchevents.php?e=${encodeURIComponent(formatted)}`;

  try {
    const json = await fetchResource(apiUrl, true);
    const events = Array.isArray(json?.event) ? json.event : [];
    return events.slice(0, MAX_POOL).map((ev) => {
      const eventId = String(ev?.idEvent || "").trim();
      const name = String(ev?.strEvent || "").trim();
      const dateStr = String(ev?.dateEvent || "").trim();
      const timeStr = String(ev?.strTime || "").trim();
      const league = String(ev?.strLeague || "").trim();
      const venue = String(ev?.strVenue || "").trim();
      const round = String(ev?.intRound || "").trim();
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const eventUrl = eventId
        ? `${TSDB_BASE}/event/${eventId}${slug ? `-${slug}` : ""}`
        : TSDB_BASE;

      return {
        title: name,
        rawDate: dateStr,
        rawTime: timeStr,
        dateDisplay: formatIstFromUtc(dateStr, timeStr),
        status: computeMatchStatus(dateStr, timeStr),
        league,
        venue,
        round,
        eventUrl,
        thumb16x9: normalizeThumb16x9(ev?.strThumb || ""),
      };
    });
  } catch {
    return [];
  }
}

async function resolveEventDetailsAndThumb16x9(evItem) {
  let current = { ...evItem };
  if (!current.thumb16x9 && current.eventUrl && current.eventUrl !== TSDB_BASE) {
    try {
      const html = await fetchResource(current.eventUrl, false);
      const thumbMatch = html.match(
        /https?:\/\/r2\.thesportsdb\.com\/images\/media\/event\/thumb\/[^\s"'<>]+/i
      );
      if (thumbMatch?.[0]) {
        current.thumb16x9 = normalizeThumb16x9(thumbMatch[0]);
      }
      if (!current.venue) {
        const venueMatch = html.match(/Venue<\/h\d>\s*<[^>]+>([^<]+)</i);
        if (venueMatch?.[1]) current.venue = stripTags(venueMatch[1]);
      }
      if (!current.league) {
        const leagueMatch = html.match(/League<\/h\d>\s*<[^>]+>([^<]+)</i);
        if (leagueMatch?.[1]) current.league = stripTags(leagueMatch[1]);
      }
    } catch {
      // Keep available item metadata
    }
  }
  return current;
}

async function searchAll16x9Thumbnails(query) {
  const cleanQ = String(query || "").trim();
  if (!cleanQ) return [];

  const browseUrl = `${TSDB_BASE}/browse?s=${encodeURIComponent(cleanQ)}`;
  const [htmlRes, apiRes] = await Promise.allSettled([
    fetchResource(browseUrl, false),
    searchEventsFromApi(cleanQ),
  ]);

  const htmlEvents =
    htmlRes.status === "fulfilled" ? extractBrowseEventsFromHtml(htmlRes.value) : [];
  const apiEvents = apiRes.status === "fulfilled" ? apiRes.value : [];

  const merged = htmlEvents.length ? htmlEvents : apiEvents;

  if (htmlEvents.length && apiEvents.length) {
    for (const hEv of merged) {
      const hName = hEv.title.toLowerCase();
      const matchApi = apiEvents.find((aEv) => {
        const aName = aEv.title.toLowerCase();
        const sameName = aName === hName || aName.includes(hName) || hName.includes(aName);
        const sameDate = !hEv.rawDate || !aEv.rawDate || hEv.rawDate === aEv.rawDate;
        return sameName && sameDate;
      });
      if (matchApi) {
        hEv.thumb16x9 = hEv.thumb16x9 || matchApi.thumb16x9;
        hEv.league = matchApi.league || hEv.league;
        hEv.venue = matchApi.venue || hEv.venue;
        hEv.round = matchApi.round || hEv.round;
        hEv.rawDate = matchApi.rawDate || hEv.rawDate;
        hEv.rawTime = matchApi.rawTime || hEv.rawTime;
        hEv.dateDisplay = formatIstFromUtc(hEv.rawDate, hEv.rawTime) || hEv.dateDisplay;
        hEv.status = computeMatchStatus(hEv.rawDate, hEv.rawTime);
      }
    }
  }

  const withThumbs = [];
  const seenUrls = new Set();

  for (const item of merged.slice(0, MAX_POOL)) {
    const resolved = await resolveEventDetailsAndThumb16x9(item);
    if (!resolved.thumb16x9) continue;
    if (seenUrls.has(resolved.thumb16x9)) continue;
    seenUrls.add(resolved.thumb16x9);
    withThumbs.push(resolved);
    if (withThumbs.length >= MAX_POOL) break;
  }

  return withThumbs;
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
  if (ev.league) {
    lines.push(`🏆  ${esc(toSmallCaps("TOURNEY"))}   ⟶  <b>${esc(toSmallCaps(ev.league))}</b>`);
  }
  if (ev.round) {
    lines.push(`🎯  ${esc(toSmallCaps("STAGE"))}     ⟶  <code>${esc(toSmallCaps(`ROUND ${ev.round}`))}</code>`);
  }
  if (ev.venue) {
    lines.push(`🏟  ${esc(toSmallCaps("VENUE"))}     ⟶  <b>${esc(toSmallCaps(ev.venue))}</b>`);
  }

  return lines.join("\n").slice(0, 1020);
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

function buildMoreKeyboard(batchId, nextOffset, totalCount) {
  const remaining = Math.max(0, totalCount - nextOffset);
  const nextCount = Math.min(BATCH_SIZE, remaining);
  return {
    inline_keyboard: [
      [
        {
          text: `➔  ${toSmallCaps(`MORE ( +${nextCount} )`)}`,
          callback_data: `more:${batchId}:${nextOffset}`,
        },
      ],
    ],
  };
}

async function dispatchSlice(chatId, batchId, items, startIndex) {
  const total = items.length;
  const endIndex = Math.min(total, startIndex + BATCH_SIZE);
  const hasMore = endIndex < total;

  for (let i = startIndex; i < endIndex; i++) {
    const isLastInBatch = i === endIndex - 1;
    const markup = isLastInBatch && hasMore ? buildMoreKeyboard(batchId, endIndex, total) : null;
    await sendPhotoCard(chatId, items[i], i + 1, total, markup);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("16:9 Thumbnail Bot Active");
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
          `📌  <b>${esc(toSmallCaps("16:9 THUMBNAIL STUDIO"))}</b>`,
          `╚══════════════════════════╝`,
          `➠  <code>/liverpool vs man city</code>  ⇢  ${esc(toSmallCaps("EX: FOOTBALL MATCH"))}`,
          `➠  <code>/india vs australia</code>    ⇢  ${esc(toSmallCaps("EX: CRICKET SERIES"))}`,
          `➠  <code>/f1 monaco</code>           ⇢  ${esc(toSmallCaps("EX: MOTORSPORT EVENT"))}`,
          `➥  <code>/find &lt;query&gt;</code>         ⇢  ${esc(toSmallCaps("EX: /find arsenal"))}`,
        ].join("\n")
      );
      return res.status(200).json({ ok: true });
    }

    const query = cmd === "/find" || cmd === "/search" ? extra : `${cmd.slice(1)} ${extra}`.trim();
    if (!query) {
      await sendText(
        chatId,
        [
          `📌  <b>${esc(toSmallCaps("ENTER A MATCH OR EVENT QUERY"))}</b>`,
          `➠  ${esc(toSmallCaps("EXAMPLE"))} 1  ⇢  <code>/liverpool vs man city</code>`,
          `➥  ${esc(toSmallCaps("EXAMPLE"))} 2  ⇢  <code>/india vs australia</code>`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    const thumbs = await searchAll16x9Thumbnails(query);
    if (!thumbs.length) {
      await sendText(
        chatId,
        [
          `🛑  <b>${esc(toSmallCaps(query))}</b>`,
          `➥  ${esc(toSmallCaps("NO 16:9 THUMBNAILS FOUND"))}`,
          `➠  ${esc(toSmallCaps("TRY EX"))}  ⇢  <code>/liverpool vs man city</code>`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    const batchId = makeBatchId(query);
    saveBatch(batchId, thumbs, query);
    await dispatchSlice(chatId, batchId, thumbs, 0);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}


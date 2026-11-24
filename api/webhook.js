import crypto from "node:crypto";

const TSDB_BASE = "https://www.thesportsdb.com";
const TSDB_API_BASE = "https://www.thesportsdb.com/api/v1/json/3";

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

function makeId(str) {
  return crypto.createHash("sha1").update(String(str)).digest("hex").slice(0, 14);
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

function normalizeImageAsset(url) {
  const clean = resolveUrl(url);
  if (!clean) return "";
  // Strip /preview or /tiny suffix if present so full asset loads
  return clean.replace(/\/(preview|tiny|small)$/i, "");
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

  // Focus on the Events section if present
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
    const thumbUrl = normalizeImageAsset(imgMatch?.[1] || "");

    const titleText = stripTags(inner)
      .replace(/^[^a-zA-Z0-9]+/, "")
      .trim();
    if (!titleText) continue;

    const dateMatch = titleText.match(/\((\d{4}-\d{2}-\d{2})\)/);
    const dateStr = dateMatch ? dateMatch[1] : "";

    seen.add(eventUrl.toLowerCase());
    results.push({
      id: makeId(`ev:${eventUrl}`),
      title: titleText,
      date: dateStr,
      league: "",
      eventUrl,
      thumb: thumbUrl,
      poster: "",
      square: "",
      banner: "",
    });

    if (results.length >= 25) break;
  }

  return results;
}

async function searchEventsFromApi(query) {
  const cleanQ = String(query || "").trim();
  if (!cleanQ) return [];

  // TheSportsDB API expects underscores for spaces in searchevents.php
  const formatted = cleanQ.replace(/\s+/g, "_");
  const apiUrl = `${TSDB_API_BASE}/searchevents.php?e=${encodeURIComponent(formatted)}`;

  try {
    const json = await fetchResource(apiUrl, true);
    const events = Array.isArray(json?.event) ? json.event : [];
    return events.slice(0, 25).map((ev) => {
      const eventId = String(ev?.idEvent || "").trim();
      const name = String(ev?.strEvent || "").trim();
      const dateStr = String(ev?.dateEvent || "").trim();
      const timeStr = String(ev?.strTime || "").trim();
      const league = String(ev?.strLeague || "").trim();
      const title = dateStr ? `${name} (${dateStr})` : name;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const eventUrl = eventId ? `${TSDB_BASE}/event/${eventId}${slug ? `-${slug}` : ""}` : TSDB_BASE;

      return {
        id: makeId(`api:${eventId || title}`),
        title,
        date: timeStr ? `${dateStr} • ${timeStr} UTC` : dateStr,
        league,
        eventUrl,
        thumb: normalizeImageAsset(ev?.strThumb || ""),
        poster: normalizeImageAsset(ev?.strPoster || ""),
        square: normalizeImageAsset(ev?.strSquare || ""),
        banner: normalizeImageAsset(ev?.strBanner || ""),
      };
    });
  } catch {
    return [];
  }
}

async function searchTheSportsDB(query) {
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

  if (!htmlEvents.length) return apiEvents;

  // Merge API artwork fields into HTML browse results where titles/dates match
  for (const hEv of htmlEvents) {
    const baseName = hEv.title.replace(/\(\d{4}-\d{2}-\d{2}\)/g, "").trim().toLowerCase();
    const matchApi = apiEvents.find((aEv) => {
      const aBase = aEv.title.replace(/\(\d{4}-\d{2}-\d{2}\)/g, "").trim().toLowerCase();
      return aBase === baseName && (!hEv.date || aEv.date.startsWith(hEv.date));
    });
    if (matchApi) {
      hEv.thumb = hEv.thumb || matchApi.thumb;
      hEv.poster = matchApi.poster;
      hEv.square = matchApi.square;
      hEv.banner = matchApi.banner;
      hEv.league = matchApi.league;
      if (matchApi.date) hEv.date = matchApi.date;
    }
  }

  return htmlEvents;
}

async function enrichEventArtwork(evItem) {
  if (!evItem?.eventUrl || evItem.eventUrl === TSDB_BASE) return evItem;
  if (evItem.poster && evItem.thumb && evItem.square) return evItem;

  try {
    const html = await fetchResource(evItem.eventUrl, false);

    const posterMatch = html.match(
      /https?:\/\/r2\.thesportsdb\.com\/images\/media\/event\/poster\/[^\s"'<>]+/i
    );
    const thumbMatch = html.match(
      /https?:\/\/r2\.thesportsdb\.com\/images\/media\/event\/thumb\/[^\s"'<>]+/i
    );
    const squareMatch = html.match(
      /https?:\/\/r2\.thesportsdb\.com\/images\/media\/event\/square\/[^\s"'<>]+/i
    );
    const bannerMatch = html.match(
      /https?:\/\/r2\.thesportsdb\.com\/images\/media\/event\/banner\/[^\s"'<>]+/i
    );

    const dateBlockMatch = html.match(/Date\s*&amp;\s*Time<\/h\d>\s*<[^>]+>([^<]+)</i) ||
      html.match(/Date\s*&\s*Time[\s\S]{0,120}?([A-Za-z]{3}\s+\d{1,2}[a-z]{2}\s+[A-Za-z]+\s+\d{4}\s+\d{1,2}:\d{2}[ap]m\s+UTC)/i);

    return {
      ...evItem,
      poster: normalizeImageAsset(posterMatch?.[0] || evItem.poster),
      thumb: normalizeImageAsset(thumbMatch?.[0] || evItem.thumb),
      square: normalizeImageAsset(squareMatch?.[0] || evItem.square),
      banner: normalizeImageAsset(bannerMatch?.[0] || evItem.banner),
      date: dateBlockMatch?.[1]?.trim() || evItem.date,
    };
  } catch {
    return evItem;
  }
}

function buildEventListKeyboard(events) {
  const rows = [];
  for (const ev of events.slice(0, 25)) {
    const label = `➔  ${toSmallCaps(ev.title)}`.slice(0, 60);
    rows.push([{ text: label, callback_data: `tsdb_ev:${ev.id}` }]);
  }
  return { inline_keyboard: rows };
}

function buildArtworkTypeKeyboard(ev) {
  const rows = [];
  if (ev.thumb) {
    rows.push([{ text: `📌  ${toSmallCaps("THUMB (16:9)")}`, callback_data: `tsdb_img:${ev.id}:thumb` }]);
  }
  if (ev.poster) {
    rows.push([{ text: `📌  ${toSmallCaps("POSTER")}`, callback_data: `tsdb_img:${ev.id}:poster` }]);
  }
  if (ev.square) {
    rows.push([{ text: `📌  ${toSmallCaps("SQUARE POSTER")}`, callback_data: `tsdb_img:${ev.id}:square` }]);
  }
  if (ev.banner) {
    rows.push([{ text: `📌  ${toSmallCaps("BANNER")}`, callback_data: `tsdb_img:${ev.id}:banner` }]);
  }
  return { inline_keyboard: rows };
}

function formatEventCaption(ev, assetTypeLabel) {
  const lines = [
    `📌  <b>${esc(toSmallCaps(ev.title))}</b>`,
    `➠  ${esc(toSmallCaps("TYPE"))}  ⇢  <b>${esc(toSmallCaps(assetTypeLabel))}</b>`,
  ];
  if (ev.date) {
    lines.push(`⏳  ${esc(toSmallCaps("DATE & TIME"))}  ⇢  <code>${esc(ev.date)}</code>`);
  }
  if (ev.league) {
    lines.push(`🧩  ${esc(toSmallCaps("LEAGUE"))}  ⇢  <b>${esc(toSmallCaps(ev.league))}</b>`);
  }
  lines.push(`➥  ${esc(toSmallCaps("SOURCE"))}  ⇢  <b>${esc(toSmallCaps("THESPORTSDB"))}</b>`);
  return lines.join("\n\n").slice(0, 1020);
}

async function sendPhotoAsset(chatId, ev, assetKey) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_TOKEN");

  const map = {
    thumb: { url: ev.thumb, label: "THUMB (16:9)" },
    poster: { url: ev.poster, label: "POSTER" },
    square: { url: ev.square, label: "SQUARE POSTER" },
    banner: { url: ev.banner, label: "BANNER" },
  };
  const chosen = map[assetKey] || map.thumb;
  if (!chosen?.url) {
    await sendText(
      chatId,
      `🛑  <b>${esc(toSmallCaps(ev.title))}</b>\n\n➥  ${esc(toSmallCaps("IMAGE NOT AVAILABLE"))}`
    );
    return;
  }

  const buttons = [];
  if (/^https:\/\//i.test(chosen.url) && chosen.url.length <= 2048) {
    buttons.push([{ text: `➔  ${toSmallCaps("OPEN FULL IMAGE")}`, url: chosen.url }]);
  }

  const payload = {
    chat_id: chatId,
    photo: chosen.url,
    caption: formatEventCaption(ev, chosen.label),
    parse_mode: "HTML",
  };
  if (buttons.length) payload.reply_markup = { inline_keyboard: buttons };

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
        `➠  ${esc(toSmallCaps("IMAGE URL"))}  ⇢  <code>${esc(chosen.url)}</code>`,
      ].join("\n\n"),
      buttons.length ? { inline_keyboard: buttons } : null
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

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram sendMessage ${res.status}`);
  }
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

const sessionCache = new Map();

function saveSession(key, value) {
  sessionCache.set(key, { value, exp: Date.now() + 15 * 60 * 1000 });
}

function getSession(key) {
  const entry = sessionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) {
    sessionCache.delete(key);
    return null;
  }
  return entry.value;
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("TheSportsDB Thumbnail Bot Active");
  if (req.method !== "POST") return res.status(405).end();

  try {
    const update = req.body || {};

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq?.message?.chat?.id;
      const data = String(cq?.data || "");
      const [prefix, id, assetType] = data.split(":");

      if (chatId && prefix === "tsdb_ev") {
        const cached = getSession(`ev:${id}`);
        if (!cached) {
          await answerCallback(cq.id, toSmallCaps("SESSION EXPIRED SEARCH AGAIN"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps("LOADING ARTWORK"));
        const enriched = await enrichEventArtwork(cached);
        saveSession(`ev:${id}`, enriched);

        const availableCount = [
          enriched.thumb,
          enriched.poster,
          enriched.square,
          enriched.banner,
        ].filter(Boolean).length;

        if (!availableCount) {
          await sendText(
            chatId,
            `🛑  <b>${esc(toSmallCaps(enriched.title))}</b>\n\n➥  ${esc(toSmallCaps("NO THUMBNAIL OR POSTER FOUND"))}`
          );
          return res.status(200).json({ ok: true });
        }

        // If only 1 artwork exists (usually Thumb), send directly
        if (availableCount === 1) {
          const singleKey = enriched.thumb
            ? "thumb"
            : enriched.poster
            ? "poster"
            : enriched.square
            ? "square"
            : "banner";
          await sendPhotoAsset(chatId, enriched, singleKey);
          return res.status(200).json({ ok: true });
        }

        const msgLines = [
          `📌  <b>${esc(toSmallCaps(enriched.title))}</b>`,
          ...(enriched.date ? [`⏳  ${esc(toSmallCaps("DATE & TIME"))}  ⇢  <code>${esc(enriched.date)}</code>`] : []),
          `➥  ${esc(toSmallCaps("CHOOSE ARTWORK TYPE BELOW"))}  ⇢`,
        ];

        await sendText(chatId, msgLines.join("\n\n"), buildArtworkTypeKeyboard(enriched));
        return res.status(200).json({ ok: true });
      }

      if (chatId && prefix === "tsdb_img") {
        const cached = getSession(`ev:${id}`);
        if (!cached) {
          await answerCallback(cq.id, toSmallCaps("SESSION EXPIRED SEARCH AGAIN"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps("SENDING IMAGE"));
        await sendPhotoAsset(chatId, cached, assetType);
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
      const help = [
        `📌  <b>${esc(toSmallCaps("THESPORTSDB THUMBNAIL BOT"))}</b>`,
        `➠  <code>/tsdb &lt;match&gt;</code>  ⇢  ${esc(toSmallCaps("SEARCH MATCH THUMB & POSTER"))}`,
        `➥  <code>/liverpool vs man city</code>  ⇢  ${esc(toSmallCaps("DIRECT SEARCH WITHOUT PREFIX"))}`,
      ].join("\n\n");

      await sendText(chatId, help);
      return res.status(200).json({ ok: true });
    }

    const query = cmd === "/tsdb" ? extra : `${cmd.slice(1)} ${extra}`.trim();
    if (!query) {
      await sendText(
        chatId,
        `📌  <b>${esc(toSmallCaps("ENTER MATCH OR TEAM NAME"))}</b>\n\n➥  <code>/liverpool vs man city</code>`
      );
      return res.status(200).json({ ok: true });
    }

    const events = await searchTheSportsDB(query);
    if (!events.length) {
      await sendText(
        chatId,
        `🛑  <b>${esc(toSmallCaps(query))}</b>\n\n➥  ${esc(toSmallCaps("NO EVENTS FOUND"))}`
      );
      return res.status(200).json({ ok: true });
    }

    for (const ev of events) {
      saveSession(`ev:${ev.id}`, ev);
    }

    const head = [
      `📌  <b>${esc(toSmallCaps(`EVENTS : ${query}`))}</b>`,
      `➠  ${esc(toSmallCaps("FOUND"))}  ⇢  <b>${events.length}</b>`,
      `➥  ${esc(toSmallCaps("TAP AN EVENT BELOW"))}  ⇢`,
    ].join("\n\n");

    await sendText(chatId, head, buildEventListKeyboard(events));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

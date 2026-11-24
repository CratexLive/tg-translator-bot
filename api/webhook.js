import crypto from "node:crypto";

const TSDB_BASE = "https://www.thesportsdb.com";
const TSDB_API_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const MAX_DIRECT_PHOTOS = 6;

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
    const dateStr = dateMatch ? dateMatch[1] : "";

    seen.add(eventUrl.toLowerCase());
    results.push({
      title: titleText,
      date: dateStr,
      league: "",
      eventUrl,
      thumb16x9: thumbUrl,
    });

    if (results.length >= 20) break;
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
    return events.slice(0, 20).map((ev) => {
      const eventId = String(ev?.idEvent || "").trim();
      const name = String(ev?.strEvent || "").trim();
      const dateStr = String(ev?.dateEvent || "").trim();
      const timeStr = String(ev?.strTime || "").trim();
      const league = String(ev?.strLeague || "").trim();
      const title = dateStr ? `${name} (${dateStr})` : name;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const eventUrl = eventId
        ? `${TSDB_BASE}/event/${eventId}${slug ? `-${slug}` : ""}`
        : TSDB_BASE;

      return {
        title,
        date: timeStr ? `${dateStr} • ${timeStr} UTC` : dateStr,
        league,
        eventUrl,
        thumb16x9: normalizeThumb16x9(ev?.strThumb || ""),
      };
    });
  } catch {
    return [];
  }
}

async function resolveEventThumb16x9(evItem) {
  if (evItem.thumb16x9) return evItem;
  if (!evItem?.eventUrl || evItem.eventUrl === TSDB_BASE) return evItem;

  try {
    const html = await fetchResource(evItem.eventUrl, false);
    const thumbMatch = html.match(
      /https?:\/\/r2\.thesportsdb\.com\/images\/media\/event\/thumb\/[^\s"'<>]+/i
    );
    const dateBlockMatch =
      html.match(/Date\s*&amp;\s*Time<\/h\d>\s*<[^>]+>([^<]+)</i) ||
      html.match(
        /Date\s*&\s*Time[\s\S]{0,120}?([A-Za-z]{3}\s+\d{1,2}[a-z]{2}\s+[A-Za-z]+\s+\d{4}\s+\d{1,2}:\d{2}[ap]m\s+UTC)/i
      );

    return {
      ...evItem,
      thumb16x9: normalizeThumb16x9(thumbMatch?.[0] || ""),
      date: dateBlockMatch?.[1]?.trim() || evItem.date,
    };
  } catch {
    return evItem;
  }
}

async function searchDirect16x9Thumbnails(query) {
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
      const baseName = hEv.title.replace(/\(\d{4}-\d{2}-\d{2}\)/g, "").trim().toLowerCase();
      const matchApi = apiEvents.find((aEv) => {
        const aBase = aEv.title.replace(/\(\d{4}-\d{2}-\d{2}\)/g, "").trim().toLowerCase();
        return aBase === baseName && (!hEv.date || aEv.date.startsWith(hEv.date));
      });
      if (matchApi) {
        hEv.thumb16x9 = hEv.thumb16x9 || matchApi.thumb16x9;
        hEv.league = matchApi.league || hEv.league;
        if (matchApi.date) hEv.date = matchApi.date;
      }
    }
  }

  const withThumbs = [];
  const seenUrls = new Set();

  for (const item of merged.slice(0, 12)) {
    const resolved = await resolveEventThumb16x9(item);
    if (!resolved.thumb16x9) continue;
    if (seenUrls.has(resolved.thumb16x9)) continue;
    seenUrls.add(resolved.thumb16x9);
    withThumbs.push(resolved);
    if (withThumbs.length >= MAX_DIRECT_PHOTOS) break;
  }

  return withThumbs;
}

function formatCaption(ev) {
  const lines = [
    `📌  <b>${esc(toSmallCaps(ev.title))}</b>`,
    `➠  ${esc(toSmallCaps("FORMAT"))}  ⇢  <b>${esc(toSmallCaps("16:9 THUMB"))}</b>`,
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

async function sendDirectPhoto(chatId, ev) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_TOKEN");

  const payload = {
    chat_id: chatId,
    photo: ev.thumb16x9,
    caption: formatCaption(ev),
    parse_mode: "HTML",
  };

  if (/^https:\/\//i.test(ev.thumb16x9) && ev.thumb16x9.length <= 2048) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: `➔  ${toSmallCaps("OPEN FULL IMAGE")}`, url: ev.thumb16x9 }]],
    };
  }

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
        `➠  ${esc(toSmallCaps("IMAGE URL"))}  ⇢  <code>${esc(ev.thumb16x9)}</code>`,
      ].join("\n\n")
    );
  }
}

async function sendText(chatId, text) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_TOKEN");

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4090),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("TheSportsDB Direct 16:9 Bot Active");
  if (req.method !== "POST") return res.status(405).end();

  try {
    const update = req.body || {};
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
          `📌  <b>${esc(toSmallCaps("THESPORTSDB 16:9 BOT"))}</b>`,
          `➠  <code>/liverpool vs man city</code>  ⇢  ${esc(toSmallCaps("DIRECT 16:9 THUMBNAILS"))}`,
          `➥  <code>/tsdb &lt;query&gt;</code>  ⇢  ${esc(toSmallCaps("SEARCH MATCH THUMBNAILS"))}`,
        ].join("\n\n")
      );
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

    const thumbs = await searchDirect16x9Thumbnails(query);
    if (!thumbs.length) {
      await sendText(
        chatId,
        `🛑  <b>${esc(toSmallCaps(query))}</b>\n\n➥  ${esc(toSmallCaps("NO 16:9 THUMBNAILS FOUND"))}`
      );
      return res.status(200).json({ ok: true });
    }

    for (const ev of thumbs) {
      await sendDirectPhoto(chatId, ev);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

import crypto from "node:crypto";

const WP_BASE = "https://wallpapercave.com";
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${WP_BASE}/`,
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

function makeWpId(str) {
  return crypto.createHash("sha1").update(String(str)).digest("hex").slice(0, 14);
}

function resolveUrl(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, WP_BASE).toString();
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

function isJunkImageUrl(url) {
  return /logo|avatar|icon|sprite|favicon|loading|spinner|placeholder|badge|banner_ad|ads/i.test(
    String(url || "")
  );
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: DEFAULT_HEADERS,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseSearchResults(html, query) {
  const results = [];
  const seen = new Set();

  // Extract wallpaper pack/gallery links and surrounding titles/thumbnails
  const cardRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    const fullHref = resolveUrl(m[1]);
    const inner = m[2] || "";
    if (!fullHref.startsWith(`${WP_BASE}/`)) continue;

    // Skip navigation/footer/account routes
    if (
      /\/(search|login|register|dmca|privacy|terms|contact|about|random|top|categories|tags)(\?|$|\/)/i.test(
        fullHref
      )
    ) {
      continue;
    }

    const imgMatch =
      inner.match(/data-src=["']([^"']+)["']/i) ||
      inner.match(/src=["']([^"']+)["']/i);
    const thumbUrl = resolveUrl(imgMatch?.[1] || "");

    const titleAttrMatch =
      inner.match(/alt=["']([^"']+)["']/i) ||
      inner.match(/title=["']([^"']+)["']/i);
    const rawTitle =
      titleAttrMatch?.[1] ||
      stripTags(inner) ||
      fullHref.replace(WP_BASE, "").replace(/[-_/]+/g, " ").trim();

    if (!rawTitle || rawTitle.length < 2) continue;
    if (thumbUrl && isJunkImageUrl(thumbUrl)) continue;

    const key = fullHref.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: makeWpId(`pack:${fullHref}`),
      kind: "pack",
      title: rawTitle.slice(0, 120),
      pageUrl: fullHref,
      imageUrl: thumbUrl || "",
      query,
    });

    if (results.length >= 30) break;
  }

  // Fallback direct image URLs if pack links are sparse
  if (!results.length) {
    const imgMatches =
      html.match(
        /https?:\/\/(?:images\.wallpapercave\.com|wallpapercave\.com)\/[^\s"'<>\\)]+\.(?:jpg|jpeg|png|webp)/gi
      ) || [];
    const uniqueImgs = [...new Set(imgMatches.map((u) => u.replace(/\\+$/, "")))].filter(
      (u) => !isJunkImageUrl(u)
    );

    uniqueImgs.slice(0, 20).forEach((imgUrl, idx) => {
      results.push({
        id: makeWpId(`img:${imgUrl}`),
        kind: "direct",
        title: `${query} Wallpaper ${idx + 1}`,
        pageUrl: imgUrl,
        imageUrl: imgUrl,
        query,
      });
    });
  }

  return results;
}

function parseWallpaperPageImages(html, pageUrl, title) {
  const candidates = [];

  // Prefer high-res wallpaper URLs (/wp/wp... or /w/...)
  const regex =
    /(?:data-src|data-full|data-original|src|href)=["']([^"']*(?:\/wp\/wp|\/w\/|images\.wallpapercave\.com)[^"']*\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi;

  let m;
  while ((m = regex.exec(html)) !== null) {
    const resolved = resolveUrl(m[1]);
    if (!resolved || isJunkImageUrl(resolved)) continue;
    if (!candidates.includes(resolved)) {
      candidates.push(resolved);
    }
  }

  // Also check unquoted direct image links
  const plainMatches =
    html.match(
      /https?:\/\/(?:images\.wallpapercave\.com|wallpapercave\.com)\/(?:wp\/wp|w\/)[^\s"'<>\\)]+\.(?:jpg|jpeg|png|webp)/gi
    ) || [];
  for (const raw of plainMatches) {
    const clean = raw.replace(/\\+$/, "");
    if (!isJunkImageUrl(clean) && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  }

  // Sort / prioritize /wp/wp full-size assets over small thumbnails
  candidates.sort((a, b) => {
    const scoreA = /\/wp\/wp/i.test(a) ? 2 : /\/w\//i.test(a) ? 1 : 0;
    const scoreB = /\/wp\/wp/i.test(b) ? 2 : /\/w\//i.test(b) ? 1 : 0;
    return scoreB - scoreA;
  });

  return candidates.slice(0, 10).map((imgUrl, idx) => ({
    id: makeWpId(`wall:${pageUrl}:${imgUrl}`),
    title: `${title} #${idx + 1}`,
    pageUrl,
    imageUrl: imgUrl,
  }));
}

async function searchWallpaperCave(query) {
  const cleanQ = String(query || "").trim();
  if (!cleanQ) return [];
  const url = `${WP_BASE}/search?q=${encodeURIComponent(cleanQ)}`;
  const html = await fetchHtml(url);
  return parseSearchResults(html, cleanQ);
}

async function getPackWallpapers(packItem) {
  if (!packItem?.pageUrl) return [];
  if (packItem.kind === "direct" && packItem.imageUrl) {
    return [
      {
        id: packItem.id,
        title: packItem.title,
        pageUrl: packItem.pageUrl,
        imageUrl: packItem.imageUrl,
      },
    ];
  }
  const html = await fetchHtml(packItem.pageUrl);
  const walls = parseWallpaperPageImages(html, packItem.pageUrl, packItem.title);
  if (!walls.length && packItem.imageUrl) {
    return [
      {
        id: packItem.id,
        title: packItem.title,
        pageUrl: packItem.pageUrl,
        imageUrl: packItem.imageUrl,
      },
    ];
  }
  return walls;
}

function buildPackKeyboard(packs) {
  const rows = [];
  for (const p of packs.slice(0, 20)) {
    const label = `➔  ${toSmallCaps(p.title)}`.slice(0, 60);
    rows.push([{ text: label, callback_data: `wpp:${p.id}` }]);
  }
  return { inline_keyboard: rows };
}

function buildWallpaperKeyboard(walls) {
  const rows = [];
  for (let i = 0; i < Math.min(walls.length, 10); i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < Math.min(walls.length, 10); j++) {
      row.push({
        text: `📌  ${toSmallCaps("WALLPAPER")}  #${j + 1}`,
        callback_data: `wpw:${walls[j].id}`,
      });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

function formatWallpaperCaption(wall) {
  return [
    `📌  <b>${esc(toSmallCaps(wall.title))}</b>`,
    `➠  ${esc(toSmallCaps("SOURCE"))}  ⇢  <b>${esc(toSmallCaps("WALLPAPERCAVE"))}</b>`,
    `➥  ${esc(toSmallCaps("STATUS"))}  ⟶  <b>${esc(toSmallCaps("READY"))}</b>`,
  ]
    .join("\n\n")
    .slice(0, 1020);
}

async function sendPhotoWithUrl(chatId, wall) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_TOKEN");

  const buttons = [];
  if (/^https:\/\//i.test(wall.imageUrl) && wall.imageUrl.length <= 2048) {
    buttons.push([{ text: `➔  ${toSmallCaps("OPEN FULL IMAGE")}`, url: wall.imageUrl }]);
  }
  if (/^https:\/\//i.test(wall.pageUrl) && wall.pageUrl.length <= 2048) {
    buttons.push([{ text: `➥  ${toSmallCaps("OPEN PACK PAGE")}`, url: wall.pageUrl }]);
  }

  const payload = {
    chat_id: chatId,
    photo: wall.imageUrl,
    caption: formatWallpaperCaption(wall),
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
    // Fallback to text message with direct URL if Telegram cannot fetch image directly
    await sendText(
      chatId,
      [
        `📌  <b>${esc(toSmallCaps(wall.title))}</b>`,
        `➠  ${esc(toSmallCaps("IMAGE URL"))}  ⇢  <code>${esc(wall.imageUrl)}</code>`,
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

// Lightweight in-memory cache per warm serverless instance
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
  if (req.method === "GET") return res.status(200).send("WallpaperCave Bot Active");
  if (req.method !== "POST") return res.status(405).end();

  try {
    const update = req.body || {};

    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq?.message?.chat?.id;
      const data = String(cq?.data || "");
      const [prefix, id] = data.split(":");

      if (chatId && prefix === "wpp") {
        const pack = getSession(`pack:${id}`);
        if (!pack) {
          await answerCallback(cq.id, toSmallCaps("SESSION EXPIRED SEARCH AGAIN"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps("LOADING WALLPAPERS"));
        const walls = await getPackWallpapers(pack);

        if (!walls.length) {
          await sendText(
            chatId,
            `🛑  <b>${esc(toSmallCaps(pack.title))}</b>\n\n➥  ${esc(toSmallCaps("NO WALLPAPERS FOUND"))}`
          );
          return res.status(200).json({ ok: true });
        }

        for (const w of walls) {
          saveSession(`wall:${w.id}`, w);
        }

        const msgText = [
          `📌  <b>${esc(toSmallCaps(pack.title))}</b>`,
          `➠  ${esc(toSmallCaps("FOUND"))}  ⇢  <b>${walls.length}</b>`,
          `➥  ${esc(toSmallCaps("TAP A WALLPAPER NUMBER BELOW"))}  ⇢`,
        ].join("\n\n");

        await sendText(chatId, msgText, buildWallpaperKeyboard(walls));
        return res.status(200).json({ ok: true });
      }

      if (chatId && prefix === "wpw") {
        const wall = getSession(`wall:${id}`);
        if (!wall) {
          await answerCallback(cq.id, toSmallCaps("SESSION EXPIRED SEARCH AGAIN"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps("SENDING WALLPAPER"));
        await sendPhotoWithUrl(chatId, wall);
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
        `📌  <b>${esc(toSmallCaps("WALLPAPERCAVE BOT"))}</b>`,
        `➠  <code>/wp &lt;keyword&gt;</code>  ⇢  ${esc(toSmallCaps("SEARCH WALLPAPER PACKS"))}`,
        `➥  <code>/wp cricket</code>  ⇢  ${esc(toSmallCaps("EXAMPLE SEARCH QUERY"))}`,
      ].join("\n\n");

      await sendText(chatId, help);
      return res.status(200).json({ ok: true });
    }

    const query = cmd === "/wp" ? extra : `${cmd.slice(1)} ${extra}`.trim();
    if (!query) {
      await sendText(
        chatId,
        `📌  <b>${esc(toSmallCaps("ENTER A KEYWORD"))}</b>\n\n➥  <code>/wp cricket</code>`
      );
      return res.status(200).json({ ok: true });
    }

    const packs = await searchWallpaperCave(query);
    if (!packs.length) {
      await sendText(
        chatId,
        `🛑  <b>${esc(toSmallCaps(query))}</b>\n\n➥  ${esc(toSmallCaps("NO RESULTS FOUND"))}`
      );
      return res.status(200).json({ ok: true });
    }

    for (const p of packs) {
      saveSession(`pack:${p.id}`, p);
    }

    const head = [
      `📌  <b>${esc(toSmallCaps(`WALLPAPERS : ${query}`))}</b>`,
      `➠  ${esc(toSmallCaps("PACKS FOUND"))}  ⇢  <b>${packs.length}</b>`,
      `➥  ${esc(toSmallCaps("TAP A PACK BELOW"))}  ⇢`,
    ].join("\n\n");

    await sendText(chatId, head, buildPackKeyboard(packs));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}


import crypto from "node:crypto";

const CRICINFO_BASE = "https://www.espncricinfo.com";
const BATCH_SIZE = 6;
const MAX_POOL = 24;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${CRICINFO_BASE}/`,
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

function toWideCricinfoUrl(rawUrl) {
  const clean = String(rawUrl || "").trim().replace(/\\u002F/gi, "/");
  if (!clean) return "";
  const full = clean.startsWith("//") ? `https:${clean}` : clean;
  if (!/^https:\/\/img1\.hscicdn\.com\/image\/upload\//i.test(full)) {
    return "";
  }
  if (/\/lsci\/db\/PICTURES\/CMS\//i.test(full)) {
    return full.replace(
      /\/image\/upload\/[^/]+\/(lsci\/db\/PICTURES\/CMS\/.+)$/i,
      "/image/upload/f_auto,t_ds_wide_w_960,q_80/$1"
    );
  }
  return full;
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

function buildCandidatePhotoPages(query) {
  const raw = String(query || "").trim();
  if (!raw) return [];

  const urls = new Set();

  if (/^https?:\/\//i.test(raw)) {
    const u = raw.replace(/\/+$/, "");
    if (/\/cricketers\/[^/]+-\d+/i.test(u) && !/\/photos$/i.test(u)) {
      urls.add(`${u}/photos`);
    }
    urls.add(u);
    return Array.from(urls);
  }

  const directMatch = raw.match(/^(.+?)[-\s]+(\d{3,8})$/);
  if (directMatch) {
    const slug = directMatch[1]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const id = directMatch[2];
    if (slug && id) {
      urls.add(`${CRICINFO_BASE}/cricketers/${slug}-${id}/photos`);
    }
  }

  const slugOnly = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slugOnly) {
    urls.add(`${CRICINFO_BASE}/cricketers/${slugOnly}/photos`);
  }

  urls.add(`${CRICINFO_BASE}/photo`);
  urls.add(`${CRICINFO_BASE}/gallery`);

  return Array.from(urls);
}

async function resolvePlayerPhotosPage(query) {
  const raw = String(query || "").trim();
  const candidates = buildCandidatePhotoPages(raw);

  if (!/^https?:\/\//i.test(raw) && !/[-_\s]\d{3,8}$/.test(raw)) {
    const qLower = raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    const tokens = qLower.split(/\s+/).filter((t) => t.length >= 2);
    for (const basePage of [`${CRICINFO_BASE}/photo`, `${CRICINFO_BASE}/gallery`]) {
      try {
        const html = await fetchHtml(basePage);
        const linkRegex = /href=["']([^"']*\/cricketers\/[^"']*-\d+\/photos)["']/gi;
        let m;
        while ((m = linkRegex.exec(html)) !== null) {
          const href = m[1];
          const normHref = href.toLowerCase().replace(/[^a-z0-9]/g, " ");
          if (tokens.every((tok) => normHref.includes(tok))) {
            const full = href.startsWith("http") ? href : `${CRICINFO_BASE}${href}`;
            return full;
          }
        }
      } catch {
        // Continue to direct candidates
      }
    }
  }

  for (const url of candidates) {
    try {
      const html = await fetchHtml(url);
      if (/img1\.hscicdn\.com\/image\/upload\//i.test(html)) {
        return url;
      }
    } catch {
      // Try next candidate URL
    }
  }

  return candidates[0] || "";
}

function extractWidePhotosFromHtml(html, fallbackTitle) {
  const photos = [];
  const seen = new Set();

  const rawMatches =
    html.match(/https?:(?:\\u002F|\/)+img1\.hscicdn\.com(?:\\u002F|\/)+image(?:\\u002F|\/)+upload(?:\\u002F|\/)+[^\s"'<>\\)]+/gi) ||
    [];

  for (const rawUrl of rawMatches) {
    const wideUrl = toWideCricinfoUrl(rawUrl);
    if (!wideUrl) continue;
    const dedupKey = wideUrl.replace(/\/image\/upload\/[^/]+\//i, "/image/upload/");
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    photos.push({
      title: fallbackTitle,
      photoUrl: wideUrl,
    });

    if (photos.length >= MAX_POOL) break;
  }

  return photos;
}

async function fetchCricketerWidePhotos(query) {
  const pageUrl = await resolvePlayerPhotosPage(query);
  if (!pageUrl) return [];

  const slugMatch = pageUrl.match(/\/cricketers\/([a-z0-9-]+)-\d+\/photos/i);
  const titleFromSlug = slugMatch?.[1]
    ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : stripTags(query) || "Cricketer Photos";

  const html = await fetchHtml(pageUrl);
  return extractWidePhotosFromHtml(html, titleFromSlug);
}

function formatPhotoCaption(item, positionNumber, totalCount) {
  return [
    `╔══════════════════════════╗`,
    `📸  <b>${esc(toSmallCaps(item.title))}</b>`,
    `╚══════════════════════════╝`,
    `📌  ${esc(toSmallCaps("PHOTO"))}     ⟶  <code>#${positionNumber} / ${totalCount}</code>`,
    `📐  ${esc(toSmallCaps("FRAME"))}     ⟶  <code>WIDE 16:9</code>`,
  ]
    .join("\n")
    .slice(0, 1020);
}

function buildMoreKeyboard(batchId, nextOffset, totalCount) {
  if (!batchId || nextOffset >= totalCount) return null;
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

async function sendPhotoCard(chatId, item, positionNumber, totalCount, replyMarkup = null) {
  const token = String(process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_TOKEN");

  const payload = {
    chat_id: chatId,
    photo: item.photoUrl,
    caption: formatPhotoCaption(item, positionNumber, totalCount),
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
        `📸  <b>${esc(toSmallCaps(item.title))}</b>`,
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
    const markup =
      isLastInBatch && hasMore ? buildMoreKeyboard(batchId, endIndex, total) : null;
    await sendPhotoCard(chatId, items[i], i + 1, total, markup);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("Cricketer Wide Photo Bot Active");
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
          await answerCallback(cq.id, toSmallCaps("NO MORE PHOTOS OR EXPIRED"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps("LOADING MORE WIDE PHOTOS"));
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
          `📸  <b>${esc(toSmallCaps("WIDE PHOTO STUDIO"))}</b>`,
          `╚══════════════════════════╝`,
          `➠  <code>/rohit sharma 34102</code>  ⇢  ${esc(toSmallCaps("EX: PLAYER PHOTOS"))}\n` +
            `➠  <code>/rohit sharma</code>        ⇢  ${esc(toSmallCaps("EX: NAME SEARCH"))}\n` +
            `➥  <code>/photo &lt;query&gt;</code>        ⇢  ${esc(toSmallCaps("EX: /photo virat kohli"))}`,
        ].join("\n")
      );
      return res.status(200).json({ ok: true });
    }

    const query =
      cmd === "/photo" || cmd === "/photos" || cmd === "/find"
        ? extra
        : `${cmd.slice(1)} ${extra}`.trim();

    if (!query) {
      await sendText(
        chatId,
        [
          `📸  <b>${esc(toSmallCaps("ENTER PLAYER NAME OR ID"))}</b>`,
          `➠  ${esc(toSmallCaps("EXAMPLE"))} 1  ⇢  <code>/rohit sharma 34102</code>`,
          `➥  ${esc(toSmallCaps("EXAMPLE"))} 2  ⇢  <code>/rohit sharma</code>`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    const photos = await fetchCricketerWidePhotos(query);
    if (!photos.length) {
      await sendText(
        chatId,
        [
          `🛑  <b>${esc(toSmallCaps(query))}</b>`,
          `➥  ${esc(toSmallCaps("NO WIDE PHOTOS FOUND"))}`,
          `➠  ${esc(toSmallCaps("TRY EX"))}  ⇢  <code>/rohit sharma 34102</code>`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    const batchId = makeBatchId(query);
    saveBatch(batchId, photos, query);
    await dispatchSlice(chatId, batchId, photos, 0);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

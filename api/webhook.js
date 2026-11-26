import crypto from "node:crypto";

const TSDB_BASE = "https://www.thesportsdb.com";
const TSDB_API_BASE = "https://www.thesportsdb.com/api/v1/json/3";

const JSON_FEEDS = [
  "https://sonujson-v6.pages.dev/Data/events/allinone.json",
  "https://raw.githubusercontent.com/sm-monirulislam/Upcoming-and-Live-Sports-Data/main/Sports_data.json",
];

const BATCH_SIZE = 6;
const MAX_POOL = 24;

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json,text/html,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
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

function cleanPhrase(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWideThumb(rawUrl) {
  const u = String(rawUrl || "").trim();
  if (!/^https?:\/\//i.test(u)) return "";
  if (/\/images\/media\/event\/(poster|square|banner)\//i.test(u)) return "";
  if (/img1\.hscicdn\.com\/image\/upload\//i.test(u) && /\/lsci\/db\/PICTURES\/CMS\//i.test(u)) {
    return u.replace(
      /\/image\/upload\/[^/]+\/(lsci\/db\/PICTURES\/CMS\/[^"'<>\\\s?]+)/i,
      "/image/upload/f_auto,t_ds_wide_w_960,q_80/$1"
    );
  }
  return u.replace(/\/(preview|tiny|small)$/i, "");
}

async function fetchResource(url, asJson = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: DEFAULT_HEADERS,
    });
    if (!res.ok) return null;
    return asJson ? await res.json() : await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildNameVariations(query) {
  const raw = String(query || "").trim();
  if (!raw) return [];

  const list = new Set([raw]);
  const splitVs = raw
    .split(/\s+(?:vs?\.?|@|-|\/)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (splitVs.length >= 2) {
    const a = splitVs[0];
    const b = splitVs.slice(1).join(" ");
    list.add(`${a} vs ${b}`);
    list.add(`${b} vs ${a}`);
    list.add(a);
    list.add(b);
  } else {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      list.add([...words].reverse().join(" "));
      list.add(words[0]);
      list.add(words[words.length - 1]);
    }
  }

  return Array.from(list);
}

function collectJsonMatches(data, query) {
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
    ? data.events
    : Array.isArray(data?.matches)
    ? data.matches
    : Object.values(data || {});

  if (!Array.isArray(items)) return [];
  const qClean = cleanPhrase(query);
  const tokens = qClean.split(/\s+/).filter((t) => t.length >= 2);
  if (!tokens.length) return [];

  const matched = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const ev = row.event || row.eventInfo || row.matchInfo || {};
    const title = String(
      row.title ||
        ev.name ||
        (ev.teamA && ev.teamB ? `${ev.teamA} vs ${ev.teamB}` : row.name || "")
    ).trim();
    const hay = cleanPhrase(`${title} ${ev.teamA || ""} ${ev.teamB || ""} ${ev.category || ""} ${row.cat || ""}`);
    if (tokens.some((tok) => hay.includes(tok))) {
      matched.push({
        title: title || query,
        teamA: String(ev.teamA || "").trim(),
        teamB: String(ev.teamB || "").trim(),
      });
    }
  }
  return matched;
}

async function searchTsdbByName(term) {
  const formatted = String(term || "").trim().replace(/\s+/g, "_");
  if (!formatted) return [];
  const url = `${TSDB_API_BASE}/searchevents.php?e=${encodeURIComponent(formatted)}`;
  const json = await fetchResource(url, true);
  const events = Array.isArray(json?.event) ? json.event : [];

  return events
    .map((ev) => ({
      title: String(ev?.strEvent || term).trim(),
      photoUrl: normalizeWideThumb(ev?.strThumb || ""),
    }))
    .filter((x) => x.photoUrl);
}

async function fetchPhotosByName(query) {
  const variations = buildNameVariations(query);
  if (!variations.length) return [];

  const feedResults = await Promise.allSettled(
    JSON_FEEDS.map((u) => fetchResource(u, true))
  );

  const extraTerms = new Set(variations);
  for (const r of feedResults) {
    if (r.status === "fulfilled" && r.value) {
      for (const v of variations) {
        const hits = collectJsonMatches(r.value, v);
        for (const h of hits) {
          if (h.title) extraTerms.add(h.title);
          if (h.teamA) extraTerms.add(h.teamA);
          if (h.teamB) extraTerms.add(h.teamB);
        }
      }
    }
  }

  const termsToSearch = Array.from(extraTerms).slice(0, 6);
  const tsdbResults = await Promise.allSettled(
    termsToSearch.map((t) => searchTsdbByName(t))
  );

  const qTokens = cleanPhrase(query)
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const photos = [];
  const seen = new Set();

  for (const r of tsdbResults) {
    if (r.status !== "fulfilled" || !Array.isArray(r.value)) continue;
    for (const item of r.value) {
      if (seen.has(item.photoUrl)) continue;
      const hay = cleanPhrase(item.title);
      if (qTokens.length && !qTokens.some((tok) => hay.includes(tok))) continue;
      seen.add(item.photoUrl);
      photos.push({
        title: item.title || query,
        photoUrl: item.photoUrl,
      });
      if (photos.length >= MAX_POOL) break;
    }
    if (photos.length >= MAX_POOL) break;
  }

  if (!photos.length) {
    for (const r of tsdbResults) {
      if (r.status !== "fulfilled" || !Array.isArray(r.value)) continue;
      for (const item of r.value) {
        if (seen.has(item.photoUrl)) continue;
        seen.add(item.photoUrl);
        photos.push({
          title: item.title || query,
          photoUrl: item.photoUrl,
        });
        if (photos.length >= MAX_POOL) break;
      }
      if (photos.length >= MAX_POOL) break;
    }
  }

  return photos;
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
        `⚠️  ${esc(toSmallCaps("PHOTO SEND FAILED"))}`,
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
  if (req.method === "GET") return res.status(200).send("Name Photo Bot Active");
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

        await answerCallback(cq.id, toSmallCaps("LOADING MORE PHOTOS"));
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
          `📸  <b>${esc(toSmallCaps("NAME PHOTO STUDIO"))}</b>`,
          `╚══════════════════════════╝`,
          `➠  <code>/rohit sharma</code>        ⇢  ${esc(toSmallCaps("EX: NAME SEARCH"))}\n` +
            `➠  <code>/india vs new zealand</code>  ⇢  ${esc(toSmallCaps("EX: MATCH SEARCH"))}\n` +
            `➥  <code>/photo &lt;name&gt;</code>         ⇢  ${esc(toSmallCaps("EX: /photo virat kohli"))}`,
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
          `📸  <b>${esc(toSmallCaps("ENTER A NAME TO SEARCH"))}</b>`,
          `➠  ${esc(toSmallCaps("EXAMPLE"))} 1  ⇢  <code>/rohit sharma</code>`,
          `➥  ${esc(toSmallCaps("EXAMPLE"))} 2  ⇢  <code>/india vs new zealand</code>`,
        ].join("\n\n")
      );
      return res.status(200).json({ ok: true });
    }

    const photos = await fetchPhotosByName(query);
    if (!photos.length) {
      await sendText(
        chatId,
        [
          `🛑  <b>${esc(toSmallCaps(query))}</b>`,
          `➥  ${esc(toSmallCaps("NO WIDE PHOTOS FOUND FOR THIS NAME"))}`,
          `➠  ${esc(toSmallCaps("TRY EX"))}  ⇢  <code>/rohit sharma</code>`,
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

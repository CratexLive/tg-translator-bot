import crypto from "node:crypto";

const SPORTLINK_URL = "https://sportlink-tv11.pages.dev/Data.json";
const WILLOW_URL =
  "https://raw.githubusercontent.com/srhady/willow-event/refs/heads/main/live_sports.json";

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

function makeId(raw) {
  return crypto.createHash("sha1").update(String(raw || "").toLowerCase()).digest("hex").slice(0, 14);
}

function buildJioNsLink({ streamUrl, cookie = "", keys = [] }) {
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
  parts.push("User-Agent=Virat");
  parts.push("Referer=https://www.jiotv.com/");
  parts.push("Origin=https://www.jiotv.com/");
  if (cleanKeys.length) {
    parts.push("drmScheme=clearkey");
    parts.push(`drmLicense=${cleanKeys.join(",")}`);
  }

  return `${urlWithQuery}|${parts.join("&")}`;
}

function buildWillowNsLink(streamUrl, drmKey = "") {
  const cleanUrl = String(streamUrl || "").trim();
  if (!cleanUrl) return "";

  const cleanKey = String(drmKey || "").trim();
  if (!cleanKey) return cleanUrl;

  return `${cleanUrl}|drmScheme=clearkey&drmLicense=${cleanKey}`;
}

function extractWillowStreams(match) {
  const drmKey = String(match?.drm_key || "").trim();
  const streams = [];

  const groups = [
    { obj: match?.stream_url_alpha, tag: "ALPHA" },
    { obj: match?.stream_url_bravo, tag: "BRAVO" },
  ];

  for (const { obj, tag } of groups) {
    if (!obj || typeof obj !== "object") continue;
    for (const [serverName, url] of Object.entries(obj)) {
      const link = buildWillowNsLink(url, drmKey);
      if (!link) continue;
      streams.push({
        server: `${tag} • ${String(serverName).trim()}`,
        link,
      });
    }
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

async function loadSportlinkItems() {
  const cached = getCached("src:sportlink");
  if (cached) return cached;

  const data = await fetchJson(SPORTLINK_URL);
  const rawList = Array.isArray(data?.channels) ? data.channels : [];
  const items = [];

  for (const ch of rawList) {
    const name = String(ch?.name || "").trim();
    const keys = Array.isArray(ch?.sportlink) && ch.sportlink.length
      ? ch.sportlink
      : ch?.key_id && ch?.key
        ? [`${ch.key_id}:${ch.key}`]
        : [];
    const nsLink = buildJioNsLink({
      streamUrl: ch?.stream_url,
      cookie: ch?.cookie,
      keys,
    });
    if (!name || !nsLink) continue;

    const id = makeId(`sl|${ch?.id || ""}|${name}`);
    items.push({
      id,
      source: "SPORTLINK",
      title: name,
      meta: ch?.cookie_expire_ist ? `EXPIRE • ${ch.cookie_expire_ist}` : "JIO SPORTLINK",
      streams: [{ server: "JioTV MPD", link: nsLink }],
      searchText: `${ch?.id || ""} ${name} sportlink jio`.toLowerCase(),
    });
  }

  return setCached("src:sportlink", items);
}

async function loadWillowItems() {
  const cached = getCached("src:willow");
  if (cached) return cached;

  const data = await fetchJson(WILLOW_URL);
  const matches = Array.isArray(data?.Matches) ? data.Matches : [];
  const items = [];

  for (const m of matches) {
    const title = String(m?.title || "").trim();
    if (!title) continue;

    const streams = extractWillowStreams(m);
    const status = String(m?.status || "UPCOMING").trim().toUpperCase();
    const timeText = String(m?.time || "").trim();
    const id = makeId(`wl|${m?.match_id || ""}|${title}`);

    items.push({
      id,
      source: "WILLOW",
      title,
      status,
      meta: `${status}${timeText ? ` • ${timeText}` : ""}`,
      streams,
      searchText: `${m?.match_id || ""} ${title} ${m?.synopsis || ""} ${status} ${timeText} willow`.toLowerCase(),
    });
  }

  return setCached("src:willow", items);
}

async function loadAllItems(sourceFilter = "all") {
  if (sourceFilter === "sportlink") return loadSportlinkItems();
  if (sourceFilter === "willow") return loadWillowItems();

  const [sl, wl] = await Promise.allSettled([loadSportlinkItems(), loadWillowItems()]);
  return [
    ...(sl.status === "fulfilled" ? sl.value : []),
    ...(wl.status === "fulfilled" ? wl.value : []),
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

function buildItemsKeyboard(items) {
  const rows = [];
  for (const item of items.slice(0, 45)) {
    const badge = item.source === "WILLOW" ? ` [ ${toSmallCaps(item.status || "INFO")} ]` : "";
    const text = `➔  ${toSmallCaps(item.title)}${badge}`.slice(0, 60);
    rows.push([{ text, callback_data: `ns:${item.id}` }]);
  }
  return { inline_keyboard: rows };
}

async function sendNsLinksMessage(chatId, item) {
  if (!item.streams?.length) {
    await sendText(
      chatId,
      `⏳  <b>${esc(toSmallCaps(item.title))}</b>\n\n📌  <code>${esc(item.meta)}</code>\n\n➥  ${esc(toSmallCaps("STREAM LINK NOT AVAILABLE YET"))}`
    );
    return;
  }

  const streamBlocks = item.streams.map(
    (s) => `⚡  <b>${esc(toSmallCaps(s.server))}</b>\n<code>${esc(s.link)}</code>`
  );

  const message = [
    `📺  <b>${esc(toSmallCaps(item.title))}</b>`,
    `📌  <code>${esc(item.meta)}</code>`,
    ...streamBlocks,
  ].join("\n\n");

  await sendText(chatId, message);
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
  if (req.method === "GET") return res.status(200).send("NS Player Bot Active");
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
        await answerCallback(cq.id, toSmallCaps("ALL CHANNELS VERIFIED"), false);
        await sendText(
          chatId,
          `✅  <b>${esc(toSmallCaps("VERIFIED"))}</b>\n\n➥  ${esc(toSmallCaps("USE /sportlink OR /willow"))}`
        );
        return res.status(200).json({ ok: true });
      }

      if (chatId && prefix === "ns") {
        const sub = await checkRequiredChannels(userId);
        if (!sub.allowed) {
          await sendJoinPrompt(chatId, sub.missing, cq.id);
          return res.status(200).json({ ok: true });
        }

        const all = await loadAllItems("all");
        const selected = all.find((c) => c.id === arg1);
        if (!selected) {
          await answerCallback(cq.id, toSmallCaps("ITEM NOT FOUND"), true);
          return res.status(200).json({ ok: true });
        }

        await answerCallback(cq.id, toSmallCaps(selected.title));
        await sendNsLinksMessage(chatId, selected);
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

    if (cmd === "/start" || cmd === "/help") {
      const help = [
        `📌  <b>${esc(toSmallCaps("NS PLAYER BOT COMMANDS"))}</b>`,
        `➠  <code>/sportlink</code>  ⇢  ${esc(toSmallCaps("JIO SPORTLINK CHANNELS"))}`,
        `➠  <code>/willow</code>  ⇢  ${esc(toSmallCaps("WILLOW CRICKET MATCHES"))}`,
        `➥  <code>/&lt;keyword&gt;</code>  ⇢  ${esc(toSmallCaps("SEARCH CHANNEL OR MATCH"))}`,
      ].join("\n\n");

      await sendText(chatId, help);
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/sportlink" || cmd === "/channels") {
      const list = await loadAllItems("sportlink");
      if (!list.length) {
        await sendText(chatId, `🛑  <b>${esc(toSmallCaps("NO SPORTLINK CHANNELS"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      const head = [
        `📺  <b>${esc(toSmallCaps("SPORTLINK CHANNELS"))}</b>`,
        `📌  ${esc(toSmallCaps("TOTAL"))}  ⟶  <b>${list.length}</b>`,
        `➥  ${esc(toSmallCaps("TAP A CHANNEL BELOW"))}  ⇢`,
      ].join("\n\n");

      await sendText(chatId, head, buildItemsKeyboard(list));
      return res.status(200).json({ ok: true });
    }

    if (cmd === "/willow") {
      const list = await loadAllItems("willow");
      if (!list.length) {
        await sendText(chatId, `🛑  <b>${esc(toSmallCaps("NO WILLOW MATCHES"))}</b>`);
        return res.status(200).json({ ok: true });
      }

      const head = [
        `🏏  <b>${esc(toSmallCaps("WILLOW MATCHES"))}</b>`,
        `📌  ${esc(toSmallCaps("TOTAL"))}  ⟶  <b>${list.length}</b>`,
        `➥  ${esc(toSmallCaps("TAP A MATCH BELOW"))}  ⇢`,
      ].join("\n\n");

      await sendText(chatId, head, buildItemsKeyboard(list));
      return res.status(200).json({ ok: true });
    }

    const query = `${cmd.slice(1)} ${extra}`.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    const all = await loadAllItems("all");
    const matched = all.filter((item) => tokens.every((t) => item.searchText.includes(t)));

    if (!matched.length) {
      await sendText(
        chatId,
        `🛑  <b>${esc(toSmallCaps(query.toUpperCase()))}</b>\n\n➥  ${esc(toSmallCaps("NO MATCHING RESULTS"))}`
      );
      return res.status(200).json({ ok: true });
    }

    if (matched.length === 1) {
      await sendNsLinksMessage(chatId, matched[0]);
      return res.status(200).json({ ok: true });
    }

    const head = [
      `📌  <b>${esc(toSmallCaps(`RESULTS : ${query.toUpperCase()}`))}</b>`,
      `➠  ${esc(toSmallCaps("FOUND"))}  ⇢  <b>${matched.length}</b>`,
      `➥  ${esc(toSmallCaps("TAP AN ITEM BELOW"))}  ⇢`,
    ].join("\n\n");

    await sendText(chatId, head, buildItemsKeyboard(matched));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

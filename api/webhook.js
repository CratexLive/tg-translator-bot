const SOURCE_CHANNEL_ID = String(process.env.SOURCE_CHANNEL_ID || "-1004487952621").trim();
const TARGET_CHANNEL_ID = String(process.env.TARGET_CHANNEL_ID || "-1005879158157").trim();

const SOURCE_PREFIX = "https://cxc45.pages.dev/okjanu/?id=";
const TARGET_PREFIX = "https://footxcrate.pages.dev/okjanu?id=";
const DOMAIN_LINK_REGEX = /https?:\/\/cxc45\.pages\.dev\/okjanu\/?\?id=([^\s)]+)/gi;

function rewriteLinks(text = "") {
  const raw = String(text);
  DOMAIN_LINK_REGEX.lastIndex = 0;
  if (!DOMAIN_LINK_REGEX.test(raw)) return null;

  DOMAIN_LINK_REGEX.lastIndex = 0;
  return raw.replace(DOMAIN_LINK_REGEX, (_, id) => `${TARGET_PREFIX}${id}`);
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

async function forwardModifiedPost(msg) {
  const originalText = typeof msg?.text === "string" ? msg.text : msg?.caption;
  if (typeof originalText !== "string") return;

  const updatedText = rewriteLinks(originalText);
  if (updatedText === null) return;

  const entities = Array.isArray(msg?.entities) ? msg.entities : msg?.caption_entities;

  if (msg?.photo?.length) {
    const bestPhoto = msg.photo[msg.photo.length - 1];
    const payload = {
      chat_id: TARGET_CHANNEL_ID,
      photo: bestPhoto.file_id,
      caption: updatedText,
    };
    if (!entities?.length) payload.parse_mode = "HTML";
    await telegramApi("sendPhoto", payload);
    return;
  }

  if (msg?.video?.file_id) {
    const payload = {
      chat_id: TARGET_CHANNEL_ID,
      video: msg.video.file_id,
      caption: updatedText,
    };
    if (!entities?.length) payload.parse_mode = "HTML";
    await telegramApi("sendVideo", payload);
    return;
  }

  if (msg?.document?.file_id) {
    const payload = {
      chat_id: TARGET_CHANNEL_ID,
      document: msg.document.file_id,
      caption: updatedText,
    };
    if (!entities?.length) payload.parse_mode = "HTML";
    await telegramApi("sendDocument", payload);
    return;
  }

  if (msg?.animation?.file_id) {
    const payload = {
      chat_id: TARGET_CHANNEL_ID,
      animation: msg.animation.file_id,
      caption: updatedText,
    };
    if (!entities?.length) payload.parse_mode = "HTML";
    await telegramApi("sendAnimation", payload);
    return;
  }

  const payload = {
    chat_id: TARGET_CHANNEL_ID,
    text: updatedText,
    disable_web_page_preview: true,
  };
  if (!entities?.length) payload.parse_mode = "HTML";
  await telegramApi("sendMessage", payload);
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("Auto Poster Active");
  if (req.method !== "POST") return res.status(405).end();

  try {
    const update = req.body || {};
    const post = update.channel_post || update.edited_channel_post;

    if (post && String(post?.chat?.id) === SOURCE_CHANNEL_ID) {
      await forwardModifiedPost(post);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, error: err.message });
  }
}

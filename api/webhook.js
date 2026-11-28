export default async function handler(req, res) {
  const qstashToken = String(process.env.QSTASH_TOKEN || "").trim();
  const qstashUrl = String(
    process.env.QSTASH_URL || "https://qstash-eu-central-1.upstash.io"
  ).trim().replace(/\/+$/, "");
  const callbackUrl = process.env.BOT_WEBHOOK_URL
    ? String(process.env.BOT_WEBHOOK_URL).trim()
    : `https://${req.headers["x-forwarded-host"] || req.headers.host || ""}/api/webhook`;

  const sep = callbackUrl.includes("?") ? "&" : "?";
  const destination = `${callbackUrl}${sep}action=delete`;

  if (!qstashToken) {
    return res.status(200).json({
      ok: false,
      reason: "MISSING_QSTASH_TOKEN",
      qstashUrl,
      destination,
    });
  }

  const response = await fetch(`${qstashUrl}/v2/publish/${encodeURIComponent(destination)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${qstashToken}`,
      "Content-Type": "application/json",
      "Upstash-Delay": "30s",
    },
    body: JSON.stringify({ chat_id: 0, message_id: 0 }),
  });

  const bodyText = await response.text();
  return res.status(200).json({
    ok: response.ok,
    status: response.status,
    qstashUrl,
    destination,
    response: bodyText,
  });
}

// api/logs.js — Vercel Serverless Function (Node runtime)

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  // --- Upstream SmartOffice API (prefer v2, fall back to v1) ---
  const API_KEY = process.env.SMARTOFFICE_KEY || "441011112426";
  const configured = process.env.SMARTOFFICE_API?.trim();

  // If SMARTOFFICE_API is set, only try that (plus its trailing-slash variant).
  // Otherwise, try v2 first, then v1, with and without trailing slashes.
  const candidates = configured
    ? [configured, configured.endsWith("/") ? configured : configured + "/"]
    : [
        "http://103.11.117.90:89/api/v2/WebAPI/GetDeviceLogs",
        "http://103.11.117.90:89/api/v2/WebAPI/GetDeviceLogs/",
        "http://103.11.117.90:89/api/WebAPI/GetDeviceLogs",
        "http://103.11.117.90:89/api/WebAPI/GetDeviceLogs/",
      ];

  // --- Read & normalize input ---
  let input = {};
  try {
    if (req.method === "GET") input = req.query || {};
    else if (typeof req.body === "string") input = JSON.parse(req.body || "{}");
    else input = req.body || {};
  } catch {
    input = {};
  }

  // Support aliases (?from=...&to=...) and a single-day ?date=...
  const normalized = { ...input };
  if (normalized.from && !normalized.FromDate) normalized.FromDate = normalized.from;
  if (normalized.to && !normalized.ToDate) normalized.ToDate = normalized.to;
  if (normalized.date && !normalized.FromDate && !normalized.ToDate) {
    normalized.FromDate = normalized.date;
    normalized.ToDate = normalized.date;
  }
  delete normalized.from;
  delete normalized.to;
  delete normalized.date;

  // Always include API key (both names to satisfy upstream quirks)
  const payload = { APIKey: API_KEY, Key: API_KEY, ...normalized };

  const isJson =
    (req.headers["content-type"] || "").toLowerCase().includes("application/json");

  async function post(url) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": isJson
          ? "application/json"
          : "application/x-www-form-urlencoded",
      },
      body: isJson
        ? JSON.stringify(payload)
        : new URLSearchParams(payload).toString(),
    });
    const text = await resp.text();
    return { resp, text };
  }

  try {
    let last = null;

    // Try candidates until one is not 404
    for (const url of candidates) {
      last = await post(url);
      if (last.resp.status !== 404) break;
    }

    const { resp, text } = last;

    // Try JSON first; otherwise echo as text with upstream content-type
    try {
      return res.status(resp.status).json(JSON.parse(text));
    } catch {
      res.setHeader(
        "Content-Type",
        resp.headers.get("content-type") || "text/plain"
      );
      return res.status(resp.status).send(text);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || "Proxy error" });
  }
}

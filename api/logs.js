// api/logs.js — Vercel Serverless Function (Node runtime)

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Upstream SmartOffice API (POST endpoint)
  const RAW_API_URL =
    process.env.SMARTOFFICE_API ||
    "http://103.11.117.90:89/api/WebAPI/GetDeviceLogs";
  const API_KEY = process.env.SMARTOFFICE_KEY || "441011112426";

  // Read input
  let input = {};
  try {
    if (req.method === "GET") input = req.query || {};
    else if (typeof req.body === "string") input = JSON.parse(req.body || "{}");
    else input = req.body || {};
  } catch {
    input = {};
  }

  // Normalize common aliases (so GET ?from=...&to=... still works)
  const normalized = { ...input };
  if (normalized.from && !normalized.FromDate) normalized.FromDate = normalized.from;
  if (normalized.to && !normalized.ToDate) normalized.ToDate = normalized.to;
  delete normalized.from;
  delete normalized.to;

  const payload = { APIKey: API_KEY, Key: API_KEY, ...normalized };
  const isJson = (req.headers["content-type"] || "").includes("application/json");

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
    // Try without trailing slash, then with trailing slash if 404
    let { resp, text } = await post(RAW_API_URL);
    if (resp.status === 404 && !RAW_API_URL.endsWith("/")) {
      ({ resp, text } = await post(RAW_API_URL + "/"));
    }

    try {
      return res.status(resp.status).json(JSON.parse(text));
    } catch {
      res.setHeader("Content-Type", resp.headers.get("content-type") || "text/plain");
      return res.status(resp.status).send(text);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || "Proxy error" });
  }
}

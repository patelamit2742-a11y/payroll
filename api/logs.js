// api/logs.js — Vercel Serverless Function (Node runtime)

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  // --- Upstream device API (this route exists and requires POST) ---
  const API_URL =
    process.env.SMARTOFFICE_API ||
    "http://103.11.117.90:89/api/WebAPI/GetDeviceLogs"; // note: no /v1 or /v2
  const API_KEY = process.env.SMARTOFFICE_KEY || "441011112426";

  // Merge params from query + body
  const query = req.query || {};
  let bodyIn = {};
  try {
    if (req.body && typeof req.body === "string") bodyIn = JSON.parse(req.body);
    else if (req.body && typeof req.body === "object") bodyIn = req.body;
  } catch {
    // ignore bad JSON; we'll fall back to empty object
  }

  const merged = { APIKey: API_KEY, Key: API_KEY, ...query, ...bodyIn };

  try {
    // Force POST upstream (device API doesn't support GET here)
    const isJson = (req.headers["content-type"] || "").includes(
      "application/json"
    );

    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": isJson
          ? "application/json"
          : "application/x-www-form-urlencoded",
      },
      body: isJson
        ? JSON.stringify(merged)
        : new URLSearchParams(merged).toString(),
    });

    const text = await upstream.text();

    // Try JSON first; otherwise echo as text with upstream content-type
    try {
      return res.status(upstream.status).json(JSON.parse(text));
    } catch {
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "text/plain"
      );
      return res.status(upstream.status).send(text);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || "Proxy error" });
  }
}

// api/logs.js — Vercel Serverless Function
export default async function handler(req, res) {
  // Always allow CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Preflight request
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const API_URL =
    process.env.SMARTOFFICE_API ||
    "http://103.11.117.90:89/api/v2/WebAPI/GetDeviceLogs";
  const API_KEY = process.env.SMARTOFFICE_KEY || "441011112426";

  const query = req.query || {};
  let bodyIn = {};

  try {
    if (req.body && typeof req.body === "string") {
      bodyIn = JSON.parse(req.body);
    } else if (req.body && typeof req.body === "object") {
      bodyIn = req.body;
    }
  } catch {}

  const merged = { APIKey: API_KEY, Key: API_KEY, ...query, ...bodyIn };

  try {
    let upstream;

    if (req.method === "POST") {
      const isJson = (req.headers["content-type"] || "").includes(
        "application/json"
      );
      upstream = await fetch(API_URL, {
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
    } else {
      const qs = new URLSearchParams(merged).toString();
      upstream = await fetch(`${API_URL}?${qs}`);
    }

    const text = await upstream.text();

    try {
      const json = JSON.parse(text);
      return res.status(upstream.status).json(json);
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

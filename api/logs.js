// api/logs.js — Vercel Serverless Function (Node runtime)

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Upstream SmartOffice endpoint (make sure SMARTOFFICE_API points to /api/v2/WebAPI/GetDeviceLogs)
  const RAW = (process.env.SMARTOFFICE_API ||
               "http://103.11.117.90:89/api/v2/WebAPI/GetDeviceLogs").replace(/\/+$/, "");
  const API_KEY = process.env.SMARTOFFICE_KEY || "441011112426";

  // Build input (query for GET, body for POST)
  let input = {};
  try {
    if (req.method === "GET") input = req.query || {};
    else if (typeof req.body === "string") input = JSON.parse(req.body || "{}");
    else input = req.body || {};
  } catch { input = {}; }

  // Allow ?from=...&to=... aliases
  const norm = { ...input };
  if (norm.from && !norm.FromDate) norm.FromDate = norm.from;
  if (norm.to && !norm.ToDate) norm.ToDate = norm.to;
  delete norm.from; delete norm.to;

  const params = { APIKey: API_KEY, Key: API_KEY, ...norm };
  const qs = new URLSearchParams(params).toString();

  let upstream, usedMethod = "", usedUrl = "";

  const tryGET = async (base) => {
    usedMethod = "GET"; usedUrl = `${base}?${qs}`;
    return fetch(usedUrl, { method: "GET", headers: { Accept: "application/json" } });
  };

  const tryPOST = async (base, asJson = false) => {
    usedMethod = asJson ? "POST json" : "POST form";
    usedUrl = base;
    const headers = { Accept: "application/json" };
    let body;
    if (asJson) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(params);
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(params).toString();
    }
    return fetch(base, { method: "POST", headers, body });
  };

  try {
    // Prefer GET (no slash), then GET (with slash), then POST fallbacks
    upstream = await tryGET(RAW);
    if (!upstream.ok && (upstream.status === 404 || upstream.status === 405)) {
      let tmp = await tryGET(RAW + "/");
      if (!tmp.ok) {
        tmp = await tryPOST(RAW, false);
        if (!tmp.ok) tmp = await tryPOST(RAW + "/", false);
        if (!tmp.ok) tmp = await tryPOST(RAW, true);
      }
      upstream = tmp;
    }
  } catch {
    // Network issue on GET → try POSTs
    try { upstream = await tryPOST(RAW, false); }
    catch {
      try { upstream = await tryPOST(RAW + "/", false); }
      catch (e3) { return res.status(502).json({ error: "Upstream error", detail: e3.message }); }
    }
  }

  // Debug headers so you can see what was used
  res.setHeader("x-upstream-url", usedUrl);
  res.setHeader("x-upstream-method", usedMethod);
  res.setHeader("x-upstream-status", String(upstream.status));

  const text = await upstream.text();
  try {
    return res.status(upstream.status).json(JSON.parse(text));
  } catch {
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain");
    return res.status(upstream.status).send(text);
  }
}

/* ============================================================
   TALON leaderboard — Cloudflare Worker
   Free, CORS-enabled REST API backed by Workers KV.
   Routes:
     GET  /board?mode=sar|asw   -> top 25 entries (array)
     POST /score  (JSON body)   -> validated, stored, returns top 25
   ============================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
const KEY = "board";
const MAX_KEEP = 100;
const MAX_RETURN = 25;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}

async function load(env) {
  try {
    const raw = await env.TALON_LB.get(KEY);
    const o = raw ? JSON.parse(raw) : null;
    return (o && o.sar && o.asw) ? o : { sar: [], asw: [] };
  } catch (e) {
    return { sar: [], asw: [] };
  }
}

function clean(entry) {
  const mode = entry.mode === "asw" ? "asw" : "sar";
  const name = String(entry.name || "ANON").replace(/[<>]/g, "").trim().slice(0, 14) || "ANON";
  const score = Math.max(0, Math.min(99999, parseInt(entry.score, 10) || 0));
  const found = !!entry.found;
  const time = (entry.time == null || isNaN(parseInt(entry.time, 10))) ? null : parseInt(entry.time, 10);
  const pod = Math.max(0, Math.min(100, parseInt(entry.pod, 10) || 0));
  return { mode, row: { name, score, found, time, pod, ts: Date.now() } };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    if (url.pathname === "/board") {
      const mode = url.searchParams.get("mode") === "asw" ? "asw" : "sar";
      const all = await load(env);
      const list = (all[mode] || []).sort((a, b) => b.score - a.score).slice(0, MAX_RETURN);
      return json(list);
    }

    if (url.pathname === "/score" && req.method === "POST") {
      let body;
      try { body = JSON.parse(await req.text()); }
      catch (e) { return json({ error: "bad json" }, 400); }
      const { mode, row } = clean(body);
      const all = await load(env);
      all[mode] = all[mode] || [];
      all[mode].push(row);
      all[mode].sort((a, b) => b.score - a.score);
      all[mode] = all[mode].slice(0, MAX_KEEP);
      await env.TALON_LB.put(KEY, JSON.stringify(all));
      return json(all[mode].slice(0, MAX_RETURN));
    }

    return json({ ok: true, service: "TALON leaderboard" });
  }
};

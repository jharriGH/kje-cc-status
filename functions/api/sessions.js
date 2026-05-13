const BRAIN_BASE = "https://jim-brain-production.up.railway.app";
const SESSION_TAG_RE = /^(CC-[A-Z0-9-]+_[a-f0-9]{4,}|session_[a-z0-9]{3,})$/i;
const PHASE_TAG_RE = /^(phase_[a-z0-9_-]+|spawn|discovery|complete|done|verify|deploy)$/i;
const STATUS_TAGS = {
  pass: ["complete", "done", "success", "pass"],
  fail: ["fail", "fatal", "blocker", "blocked", "halt", "error"],
};

function classify(tags, content) {
  const lower = tags.map((t) => String(t).toLowerCase());
  for (const t of lower) if (STATUS_TAGS.fail.includes(t)) return "FAIL";
  for (const t of lower) if (STATUS_TAGS.pass.includes(t)) return "PASS";
  const c = (content || "").toLowerCase();
  if (/\bfail(ed)?\b|\berror\b|\bblocked\b/.test(c)) return "FAIL";
  if (/\bcomplete[d]?\b|\bdone\b|\bshipped\b|\bpass\b/.test(c)) return "PASS";
  return "RUNNING";
}

function extractSessionId(tags) {
  for (const t of tags) if (SESSION_TAG_RE.test(t)) return t;
  return null;
}

function extractPhase(tags) {
  for (const t of tags) if (PHASE_TAG_RE.test(t)) return t;
  return null;
}

function inferLabel(sessionId, content) {
  if (sessionId && sessionId.startsWith("CC-")) {
    const stripped = sessionId.replace(/_[a-f0-9]+$/i, "");
    return stripped.replace(/^CC-/, "").replace(/-/g, " ");
  }
  if (sessionId && sessionId.startsWith("session_")) {
    return sessionId.replace(/^session_/, "").toUpperCase();
  }
  return "Session";
}

export async function onRequestGet({ request, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };
  try {
    if (!env.JIM_BRAIN_KEY) {
      return new Response(
        JSON.stringify({ error: "JIM_BRAIN_KEY not configured" }),
        { status: 500, headers }
      );
    }
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "300", 10), 500);
    const upstream = await fetch(`${BRAIN_BASE}/logs?limit=${limit}`, {
      headers: { "x-brain-key": env.JIM_BRAIN_KEY },
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(
        JSON.stringify({ error: `brain ${upstream.status}`, body: text.slice(0, 500) }),
        { status: 502, headers }
      );
    }
    const data = await upstream.json();
    const logs = data.logs || [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const sessions = new Map();
    for (const log of logs) {
      const tags = log.tags || [];
      const sid = extractSessionId(tags);
      if (!sid) continue;
      const ts = log.logged_at ? new Date(log.logged_at).getTime() : 0;
      if (ts && ts < cutoff) continue;
      let s = sessions.get(sid);
      if (!s) {
        s = {
          session_id: sid,
          project: log.project || "general",
          label: inferLabel(sid, log.content),
          latest_phase_tag: null,
          latest_content_preview: "",
          latest_timestamp: null,
          status_guess: "RUNNING",
          entry_count: 0,
          all_tags: new Set(),
        };
        sessions.set(sid, s);
      }
      s.entry_count += 1;
      for (const t of tags) s.all_tags.add(t);
      if (!s.latest_timestamp || ts > new Date(s.latest_timestamp).getTime()) {
        s.latest_timestamp = log.logged_at;
        s.latest_content_preview = (log.content || "").slice(0, 240);
        s.latest_phase_tag = extractPhase(tags) || s.latest_phase_tag;
        s.status_guess = classify(tags, log.content);
      }
    }
    const out = Array.from(sessions.values())
      .map((s) => ({
        session_id: s.session_id,
        project: s.project,
        label: s.label,
        latest_phase_tag: s.latest_phase_tag,
        latest_content_preview: s.latest_content_preview,
        latest_timestamp: s.latest_timestamp,
        status_guess: s.status_guess,
        entry_count: s.entry_count,
        all_tags: Array.from(s.all_tags),
      }))
      .sort((a, b) => new Date(b.latest_timestamp) - new Date(a.latest_timestamp));
    return new Response(
      JSON.stringify({ generated_at: new Date().toISOString(), count: out.length, sessions: out }),
      { headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "proxy_exception", message: String(err && err.message || err) }),
      { status: 500, headers }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

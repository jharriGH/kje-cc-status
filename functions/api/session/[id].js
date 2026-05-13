const BRAIN_BASE = "https://jim-brain-production.up.railway.app";

export async function onRequestGet({ request, env, params }) {
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
    const sessionId = params && params.id ? String(params.id) : "";
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "missing session id" }), { status: 400, headers });
    }
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "500", 10), 500);
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
    const sidLower = sessionId.toLowerCase();
    const entries = logs
      .filter((l) => {
        const tagMatch = (l.tags || []).some((t) => String(t).toLowerCase() === sidLower);
        if (tagMatch) return true;
        return l.content && String(l.content).toLowerCase().includes(sidLower);
      })
      .map((l) => ({
        id: l.id,
        content: l.content,
        agent: l.agent,
        project: l.project,
        tags: l.tags,
        logged_at: l.logged_at,
      }))
      .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
    return new Response(
      JSON.stringify({
        session_id: sessionId,
        count: entries.length,
        entries,
        searched_limit: limit,
        generated_at: new Date().toISOString(),
      }),
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

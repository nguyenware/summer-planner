/**
 * Summer Planner API — Cloudflare Pages Function
 *
 * Routes:
 *   GET  /api      → return full state {users, activities}
 *   POST /api      → save full state (body: JSON)
 *
 * KV namespace binding: PLANNER_KV (set in wrangler.toml + Pages dashboard)
 * Single KV key: "state"
 */

const KV_KEY = "state";

// Shared CORS headers — Pages serves the same origin so this is mostly
// for local dev where the worker runs on a different port.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Verify KV binding exists
  if (!env.PLANNER_KV) {
    return json({ error: "KV namespace PLANNER_KV not bound. Check wrangler.toml and Pages settings." }, 500);
  }

  try {
    if (request.method === "GET") {
      const raw = await env.PLANNER_KV.get(KV_KEY);
      if (!raw) {
        // First load — return empty state; frontend will seed with Isaac's camps
        return json({ users: [], activities: [] });
      }
      return json(JSON.parse(raw));
    }

    if (request.method === "POST") {
      const body = await request.json();
      // Basic shape validation
      if (!Array.isArray(body.users) || !Array.isArray(body.activities)) {
        return json({ error: "Invalid payload: expected {users:[], activities:[]}" }, 400);
      }
      await env.PLANNER_KV.put(KV_KEY, JSON.stringify(body));
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

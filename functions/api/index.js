/**
 * Summer Planner API — Cloudflare Pages Function
 *
 * Routes:
 *   GET  /api      → return full state {users, activities}
 *   POST /api      → save full state (body: JSON)
 *
 * KV namespace binding : PLANNER_KV  (wrangler.toml + Pages dashboard)
 * Cloudflare secret    : PLANNER_PASS (set via wrangler CLI — never in code)
 * Single KV key        : "state"
 *
 * Auth: every request must include header  Authorization: Bearer <password>
 * Wrong/missing password → 401
 */

const KV_KEY = "state";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Constant-time string comparison — prevents timing attacks
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const aKey = await crypto.subtle.importKey(
    "raw", enc.encode(a), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", aKey, enc.encode("compare")),
    crypto.subtle.sign("HMAC", aKey, enc.encode("compare")),
  ]);
  // Actually compare a vs b using HMAC of each
  const aKey2 = await crypto.subtle.importKey(
    "raw", enc.encode(b), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigC = await crypto.subtle.sign("HMAC", aKey2, enc.encode("compare"));
  const arrA = new Uint8Array(sigA);
  const arrC = new Uint8Array(sigC);
  if (arrA.length !== arrC.length) return false;
  let diff = 0;
  for (let i = 0; i < arrA.length; i++) diff |= arrA[i] ^ arrC[i];
  return diff === 0;
}

export async function onRequest(context) {
  const { request, env } = context;

  // Preflight — no auth needed for OPTIONS
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // ── Auth check ────────────────────────────────────────────────
  const secret = env.PLANNER_PASS;
  if (!secret) {
    // Secret not configured — fail closed so the API is never open by accident
    return json({ error: "Server misconfiguration: PLANNER_PASS secret not set." }, 500);
  }

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !(await safeEqual(token, secret))) {
    return json({ error: "Unauthorized" }, 401);
  }
  // ─────────────────────────────────────────────────────────────

  // Verify KV binding exists
  if (!env.PLANNER_KV) {
    return json({ error: "KV namespace PLANNER_KV not bound." }, 500);
  }

  try {
    if (request.method === "GET") {
      const raw = await env.PLANNER_KV.get(KV_KEY);
      if (!raw) return json({ users: [], activities: [] });
      return json(JSON.parse(raw));
    }

    if (request.method === "POST") {
      const body = await request.json();
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

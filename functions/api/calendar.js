/**
 * Summer Planner — Calendar Subscription Feed
 *
 * GET /api/calendar?token=<password>
 *
 * Returns a live .ics feed generated from KV state.
 * Calendar apps poll this URL on their own schedule (Apple: ~every day,
 * Google: every 8–24 hours, Outlook: configurable).
 *
 * Auth: password passed as ?token= query param (calendar apps don't
 * support Authorization headers for subscriptions).
 */

const KV_KEY = "state";

const CAT_LABELS = {
  camp: "Camp",
  sport: "Sport",
  lesson: "Lesson",
  trip: "Trip",
  playdate: "Playdate",
  family: "Family",
  other: "Other",
};

function toIcsDate(dateStr) {
  return dateStr.replace(/-/g, "");
}

function icsEscape(s) {
  if (!s) return "";
  s = String(s);
  s = s.split("\\").join("\\\\");
  s = s.split(";").join("\\;");
  s = s.split(",").join("\\,");
  s = s.split("\r\n").join("\\n");
  s = s.split("\n").join("\\n");
  s = s.split("\r").join("\\n");
  return s;
}

function foldLine(line) {
  const out = [];
  while (line.length > 75) {
    out.push(line.slice(0, 75));
    line = " " + line.slice(75);
  }
  out.push(line);
  return out.join("\r\n");
}

function kidsFor(a) {
  if (!a.kids) return [];
  return Array.isArray(a.kids)
    ? a.kids
    : a.kids.split(",").map((s) => s.trim()).filter(Boolean);
}

function fmtCost(c) {
  if (!c && c !== 0) return null;
  return "$" + Number(c).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function buildIcs(state) {
  const now = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Summer Planner 2026//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Summer 2026",
    "X-WR-TIMEZONE:America/Los_Angeles",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  const activities = (state.activities || []).sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  for (const a of activities) {
    const kids = kidsFor(a);
    const catLabel = CAT_LABELS[a.category] || "Other";
    const user = (state.users || []).find((u) => u.id === a.userId);

    const descParts = [];
    if (kids.length) descParts.push("Kids: " + kids.join(", "));
    if (a.time) descParts.push("Time: " + a.time);
    if (a.cost) descParts.push("Cost: " + (fmtCost(a.cost) || a.cost));
    if (user) descParts.push("Added by: " + user.name);
    if (a.notes) descParts.push(a.notes);
    if (a.link) descParts.push("Link: " + a.link);

    const startDate = toIcsDate(a.startDate);
    let endDate;
    if (a.endDate && a.endDate !== a.startDate) {
      const end = new Date(a.endDate + "T12:00:00");
      end.setDate(end.getDate() + 1);
      endDate = end.toISOString().slice(0, 10).replace(/-/g, "");
    } else {
      const end = new Date(a.startDate + "T12:00:00");
      end.setDate(end.getDate() + 1);
      endDate = end.toISOString().slice(0, 10).replace(/-/g, "");
    }

    lines.push("BEGIN:VEVENT");
    lines.push(foldLine("UID:" + a.id + "@summer-planner-2026"));
    lines.push("DTSTAMP:" + now);
    lines.push("DTSTART;VALUE=DATE:" + startDate);
    lines.push("DTEND;VALUE=DATE:" + endDate);
    lines.push(foldLine("SUMMARY:" + icsEscape(a.title)));
    if (a.location) lines.push(foldLine("LOCATION:" + icsEscape(a.location)));
    if (descParts.length) lines.push(foldLine("DESCRIPTION:" + icsEscape(descParts.join("\n"))));
    lines.push("CATEGORIES:" + icsEscape(catLabel));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// Constant-time compare (copied from index.js)
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(a), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const key2 = await crypto.subtle.importKey(
    "raw", enc.encode(b), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const [s1, s2] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode("cmp")),
    crypto.subtle.sign("HMAC", key2, enc.encode("cmp")),
  ]);
  const a1 = new Uint8Array(s1), a2 = new Uint8Array(s2);
  if (a1.length !== a2.length) return false;
  let diff = 0;
  for (let i = 0; i < a1.length; i++) diff |= a1[i] ^ a2[i];
  return diff === 0;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Auth via ?token= (calendar apps can't send Authorization headers)
  const token = url.searchParams.get("token") || "";
  const secret = env.PLANNER_PASS;

  if (!secret) {
    return new Response("Server misconfiguration: PLANNER_PASS not set.", { status: 500 });
  }
  if (!token || !(await safeEqual(token, secret))) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.PLANNER_KV) {
    return new Response("KV not bound.", { status: 500 });
  }

  try {
    const raw = await env.PLANNER_KV.get(KV_KEY);
    const state = raw ? JSON.parse(raw) : { users: [], activities: [] };
    const ics = buildIcs(state);

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="summer-2026.ics"',
        "Cache-Control": "no-cache, no-store",
      },
    });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}

# Summer Planner 2026 — Claude Code Context

## What this project is
A shared multi-family summer activity planner hosted on Cloudflare Pages. Families visit the URL, enter a shared password, pick their profile, and add/view/edit summer activities for their kids. Data is stored in Cloudflare KV and shared across all visitors in real time.

## Stack
- **Frontend**: Single-file `index.html` — vanilla HTML/CSS/JS, no build step, no framework
- **Backend**: Cloudflare Pages Functions (two endpoints)
- **Storage**: Cloudflare KV (one key: `"state"`, stores `{users, activities}` as JSON)
- **Auth**: Password stored as Cloudflare secret `PLANNER_PASS`, checked on every API request via `Authorization: Bearer <password>` header. Frontend stores password in `sessionStorage` after successful gate.
- **Hosting**: Cloudflare Pages, connected to GitHub repo, auto-deploys on push to `main`

## File structure
```
summer-planner/
├── index.html              ← entire frontend (HTML + CSS + JS, ~1100 lines)
├── functions/
│   └── api/
│       ├── index.js        ← GET/POST /api — reads/writes KV state
│       └── calendar.js     ← GET /api/calendar?token=<pass> — live .ics feed
├── wrangler.toml           ← Cloudflare config + KV namespace binding
├── _redirects              ← SPA routing
├── _headers                ← security headers
└── README.md               ← Wrangler setup walkthrough
```

## Key concepts

### Data model
Everything lives in one KV key (`"state"`):
```json
{
  "users": [
    {
      "id": "user-tim",
      "name": "Tim",
      "kids": ["Isaac"],
      "colorIdx": 0
    }
  ],
  "activities": [
    {
      "id": "act-123",
      "title": "Camp name",
      "startDate": "2026-07-06",
      "endDate": "2026-07-10",
      "time": "9 AM – 4 PM",
      "category": "camp",
      "location": "Venue name",
      "link": "https://...",
      "cost": 263,
      "kids": ["Isaac", "Calvin"],
      "notes": "Free text notes",
      "userId": "user-tim",
      "createdAt": "2026-04-13T..."
    }
  ]
}
```

### Kids
Kids are stored as **arrays of strings** on each user object (`user.kids = ["Isaac", "Calvin"]`). A global pool is derived at runtime via `getGlobalKids()` which deduplicates across all users. Activities reference kids by name string in their `kids` array.

### Categories
Valid values: `camp`, `sport`, `lesson`, `trip`, `playdate`, `family`, `other`

### Auth flow
1. Page loads → `init()` runs → checks `sessionStorage` for stored password
2. If stored password exists, validates against `/api` — if 401, clears and shows gate
3. Gate screen shown → user types password → `submitGate()` fetches `/api` with `Authorization: Bearer <pw>`
4. On success, response JSON is passed directly to `boot(data)` (no second fetch)
5. `boot()` seeds KV with Tim/Isaac's camps if `users` array is empty, then shows login or app

### Calendar subscription
`/api/calendar?token=<password>` returns a live `.ics` feed of all activities. Served with `text/calendar` content type. Supports `webcal://` deep links for Apple Calendar and Google Calendar subscription URLs.

## Cloudflare setup requirements
- **KV namespace** bound as `PLANNER_KV` (set in `wrangler.toml` + Pages dashboard → Settings → Functions → KV namespace bindings)
- **Secret** `PLANNER_PASS` set via `wrangler pages secret put PLANNER_PASS --project-name summer-planner`
- Pages project connected to GitHub repo, build command blank, output directory `/`

## Local dev
```bash
wrangler pages dev . --kv PLANNER_KV
# Site at http://localhost:8788
# API at http://localhost:8788/api
# Calendar at http://localhost:8788/api/calendar?token=<pass>
```

## Common tasks

### Adding a new field to activities
1. Add the input to the add/edit modal in `index.html`
2. Include it in the `act = { ... }` object in `saveActivity()`
3. Display it in `openDetail()` and `renderList()`
4. If it should appear in calendar exports, add it to `descParts` in both `buildIcs()` (frontend) and `calendar.js` (subscription feed)

### Adding a new filter
The calendar tab has two searchable dropdowns (`calKidFilter`, `calPersonFilter`) handled by `buildFilterPanel()`. The list tab uses pill buttons via `renderFilters()`. The `filtered()` function applies both calendar filters; `filteredList(f)` applies the list filter.

### Changing the password
```bash
wrangler pages secret put PLANNER_PASS --project-name summer-planner
```
Users will be prompted to re-enter the password on next visit since their `sessionStorage` will be invalid.

### Inspecting KV data
```bash
wrangler kv key get "state" --binding PLANNER_KV
```

### Resetting all data (nuclear option)
```bash
wrangler kv key delete "state" --binding PLANNER_KV
```
Next visitor will re-seed with Tim/Isaac's preloaded camps.

## Things to be careful about
- **`index.html` is the only file that changes for most features** — `functions/api/index.js` and `calendar.js` only change for API-level work
- **No build step** — changes to `index.html` go live immediately on next Cloudflare Pages deploy (triggered by `git push`)
- **Regex in JS strings inside HTML** — previous bugs were caused by literal `\r\n` characters getting embedded in regex literals during edits. Prefer `split().join()` over regex for string manipulation in `icsEscape` and similar functions
- **KV is eventually consistent** — writes propagate within seconds; for a small family planner this is fine
- **Single KV key** — the entire state is one JSON blob. Fine for this use case (~tens of activities, handful of users) but would need pagination/sharding for large data sets
- **sessionStorage** — password clears when the browser tab is closed. This is intentional. `localStorage` is not used for the password.

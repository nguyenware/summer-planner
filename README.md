# ☀️ Summer Planner 2026

Multi-user family activity planner — Cloudflare Pages + KV persistent storage.

## Project structure

```
summer-planner/
├── index.html          ← the entire frontend
├── functions/
│   └── api.js          ← Cloudflare Pages Function (the KV API)
├── wrangler.toml       ← Wrangler config (KV binding goes here)
├── _redirects          ← SPA routing
└── _headers            ← security headers
```

---

## Setup: Wrangler + KV + Cloudflare Pages

### Prerequisites

```bash
# Install Wrangler if you don't have it
npm install -g wrangler

# Log in (opens browser)
wrangler login
```

---

### Step 1 — Create the KV namespace

```bash
# Production namespace
wrangler kv namespace create PLANNER_KV

# Preview namespace (for local dev)
wrangler kv namespace create PLANNER_KV --preview
```

Each command prints something like:

```
{ binding = "PLANNER_KV", id = "abc123..." }
```

Copy those IDs — you'll need them in the next step.

---

### Step 2 — Update wrangler.toml

Open `wrangler.toml` and paste your IDs:

```toml
[[kv_namespaces]]
binding = "PLANNER_KV"
id = "abc123..."           # ← from `wrangler kv namespace create`
preview_id = "def456..."   # ← from `wrangler kv namespace create --preview`
```

---

### Step 3 — Create a GitHub repo and push

```bash
cd summer-planner
git init
git add .
git commit -m "Initial summer planner"

# Create a new repo on GitHub (can be private), then:
git remote add origin https://github.com/YOUR_USER/summer-planner.git
git push -u origin main
```

---

### Step 4 — Connect to Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
2. Click **Create** → **Pages** → **Connect to Git**
3. Select your new repo
4. Build settings:
   - **Framework preset**: None
   - **Build command**: *(leave blank)*
   - **Build output directory**: `/` (just a slash)
5. Click **Save and Deploy**

---

### Step 5 — Bind KV to your Pages project

This is the critical step — the Pages project needs to know about PLANNER_KV.

1. In your Pages project → **Settings** → **Functions**
2. Under **KV namespace bindings** → **Add binding**
3. Set:
   - **Variable name**: `PLANNER_KV`
   - **KV namespace**: select the one you just created (it'll appear by name)
4. Click **Save**
5. Go back to **Deployments** and click **Retry deployment** (or just push a new commit)

> ⚠️ The KV binding won't take effect until the next deployment after you add it.

---

### Local dev

```bash
# Serve the site locally with the Worker running
wrangler pages dev . --kv PLANNER_KV

# The site runs at http://localhost:8788
# The API runs at http://localhost:8788/api
```

---

### Verify KV is working

```bash
# List all keys
wrangler kv key list --binding PLANNER_KV

# Read the state directly
wrangler kv key get "state" --binding PLANNER_KV
```

---

## How data flows

```
Browser → GET /api  → Pages Function (api.js) → KV.get("state") → JSON response
Browser → POST /api → Pages Function (api.js) → KV.put("state", ...) → { ok: true }
```

All users share one KV key (`"state"`) containing the full `{ users, activities }` blob.
This is optimized for a small shared group — perfectly suited for a few families.

## Sharing

Just share your Pages URL (e.g. `https://summer-planner-abc.pages.dev` or your custom domain).
Visitors add themselves on first load. All data is shared in real time.

## Preloaded camps (Isaac's booked camps — 2026)

| Dates | Camp | Location | Cost |
|-------|------|----------|------|
| Jul 6–10 | CWK Minecraft Modding & Outdoor STEAM | Frances Anderson, Edmonds | $684 |
| Jul 13–17 | Adventure Rock 1 – Climbing Camp | Edgeworks Climbing | $695 |
| Jul 20–24 | BrickCraft: LEGO® Minecraft Survival | Spartan Gymnastics Room | $230 |
| Jul 27–31 | Skyhawks Flag Football Full Day | Shoreline Park Field B | $263 |
| Aug 3–7 | Camp Shoreline – The Olympics | Meridian Park Elementary | $260 |
| Aug 10–14 | Incrediflix – Stop Motion Mash-up | Spartan Gymnastics Room | $307 |

**Total: $2,439**

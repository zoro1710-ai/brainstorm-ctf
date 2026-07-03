# Deploying the NODE ZERO CTF backend to Railway

This backend is a single Node process using `node:sqlite` (one DB file) plus
Server-Sent Events. The single-winner / race-safe guarantee depends on **exactly
one instance** writing **one** SQLite file — so we run 1 replica and put the DB on
a **persistent volume** so it survives redeploys/restarts.

Everything below assumes the service's root directory is `ctf-website/backend`.

---

## 0. What the code already does for you

- Listens on `process.env.PORT` and binds `0.0.0.0` → reachable publicly. ✅
- Frontend uses **relative** API/SSE paths → works under any domain, no rebuild. ✅
- `DATA_DIR` env var (added for cloud) → point it at the mounted volume. ✅
- `ORGANIZER_KEY` env var (added for cloud) → pin the organizer key yourself. ✅
- `engines.node >=22.5.0` + `.nvmrc` (22) → the builder installs a Node that has
  `node:sqlite`. ✅

You should not need to touch the code to deploy.

---

## 1. Create the project

> **Before you deploy — bundle the challenge content.** The backend serves each
> level's brief/hints/downloads from the `challenges/` tree, which normally lives
> one level up (`ctf-website/challenges`). Deploying only `backend/` would leave
> it out, so copy it in first:
> ```bash
> cd ctf-website/backend
> npm run bundle-challenges   # creates backend/challenges (self-contained)
> ```
> Re-run this any time you edit a `challenge.yml` or add an attachment.

### Option A — Railway CLI (works even though this folder isn't a git repo)
```bash
npm i -g @railway/cli
railway login
cd ctf-website/backend
npm run bundle-challenges   # <-- important: bundle challenges before uploading
railway init            # creates a new project
railway up              # uploads THIS folder and builds it
```

### Option B — GitHub
Push the repo to GitHub, then in the Railway dashboard:
**New Project → Deploy from GitHub repo**, and in the service **Settings → Root
Directory** set `ctf-website/backend`.

---

## 2. Add a persistent volume (critical — do this before/at first deploy)

In the Railway dashboard, open the service:
**Settings → Volumes → New Volume**
- **Mount path:** `/data`

Without this, the SQLite DB is wiped on every redeploy and every restart — you
would lose all solves and the winner record.

---

## 3. Set environment variables

Service → **Variables** → add:

| Variable | Value | Why |
|---|---|---|
| `DATA_DIR` | `/data` | Puts the DB + credentials + organizer key on the volume |
| `ORGANIZER_KEY` | *(a strong secret you choose)* | So you know the organizer key up front instead of digging it off the server |
| `NIXPACKS_NODE_VERSION` | `22` | Belt-and-suspenders: forces Node 22 for `node:sqlite` |

Do **not** set `PORT` — Railway injects it automatically.

> Keep `numReplicas` at **1** (already set in `railway.json`). Do not enable
> horizontal scaling — multiple replicas would each open their own SQLite file
> and break the single-winner guarantee.

---

## 4. Deploy & get a public URL

- CLI: `railway up` (or it deploys automatically on GitHub push).
- Then **Settings → Networking → Generate Domain**. You'll get something like
  `https://nodezero-ctf-production.up.railway.app`.

Your URLs:
- Participants: `https://<your-domain>/participant-live.html`
- Organizer:    `https://<your-domain>/organizer.html?key=<ORGANIZER_KEY>`
- Health check: `https://<your-domain>/healthz`

---

## 5. Getting the team login credentials

On first boot the backend seeds demo teams and writes plaintext logins to
`/data/team_credentials.csv` (on the volume). To retrieve them:

```bash
railway ssh          # opens a shell in the running service
cat /data/team_credentials.csv
```
(or use the dashboard's service **Shell/Terminal**.) Hand each team its
`team_code` + `password`.

If you want to **re-seed** (fresh teams/DB), clear the volume — e.g. in the shell
`rm /data/nodezero.db* /data/team_credentials.csv` — then redeploy.

---

## 6. Pre-event checklist

- [ ] Volume mounted at `/data`, `DATA_DIR=/data` set.
- [ ] `ORGANIZER_KEY` set to your secret; organizer URL loads the dashboard.
- [ ] `/healthz` returns `{ ok: true }`.
- [ ] Ran `npm run bundle-challenges` so `backend/challenges` exists in the deploy.
- [ ] Startup log says `Stages seeded 8` with **no** placeholder warning (all
      8 flags are real).
- [ ] Spot-check a level in the portal: brief text, hint reveal, and file
      download all render (e.g. Stage 1 → `blackbox_fragment.log`).
- [ ] Team credentials retrieved and distributed.
- [ ] Only 1 replica running.

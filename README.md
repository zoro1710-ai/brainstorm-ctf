# NODE ZERO — IEEE RAS Robotics CTF (CTFd build)

A **CTFd** deployment reskinned as **NODE ZERO**: Unit Zero's last transmission
cut off mid-cycle, and teams follow one continuous 10-stage trail to recover the
signal and revive the bot. You inherit teams, auth, flag checking, scoreboard,
hints, and admin for free, then overlay the theme and seed 10 gated stages.

> **Flag format:** `nodezero{...}`  •  **Race rule:** most stages cleared, then earliest final-flag time.
> **Participants** solve on their **own Ubuntu 22.04 + ROS 2 Humble** — no Docker, no browser IDE.
> ROS-workspace stages ship as a **git repo** to clone; other stages ship a file attachment.

---

## What's in this folder

```
ctf-website/
├─ README.md                  ← you are here
├─ docker-compose.yml         ← spin up the CTFd SERVER locally / on a VPS
├─ preview.html               ← static design preview (double-click to open)
├─ participant-demo.html      ← clickable Stage-1 playthrough demo
├─ theme/
│  ├─ theme-header.html       ← PASTE into Admin → Config → Theme → "Theme Header"
│  ├─ nodezero.css            ← the full stylesheet (also embedded in theme-header.html)
│  └─ home-page.html          ← PASTE into Admin → Pages → edit the index "/" page (HTML mode)
└─ challenges/
   ├─ README.md               ← import steps + 10-stage master table
   ├─ _templates/per-team-randomizer.py
   ├─ L01-static-on-the-line/  … through …  L10-full-boot/
```

> **Note on Docker:** `docker-compose.yml` runs the **CTFd server itself**
> (CTFd + MariaDB + Redis). The "no Docker" rule is about *participant* ROS 2
> environments only — server-side Docker is fine.

---

## Fast path (recommended — live in ~1 day, no theme fork)

CTFd lets you reskin without forking a theme: a global CSS/JS injection field plus
an editable home page. Lowest-risk route days before the event.

### 1. Launch CTFd
```bash
cd ctf-website
docker compose up -d            # http://localhost:8000
```
Open `http://localhost:8000`, run the setup wizard:
- **CTF name:** `NODE ZERO`
- **Mode:** **User mode** (one account per team — see `../IEEE_RAS_CTF_Plan.md` §6)
- Create your admin account.

### 2. Apply the NODE ZERO skin
- **Admin → Config → Theme** → keep the **`core-beta`** theme selected.
- Paste the entire contents of **`theme/theme-header.html`** into the **"Theme Header"** box → Save.
  (This injects the fonts + `nodezero.css` into every page — navbar, tiles, scoreboard, forms.)

### 3. Set the landing page
- **Admin → Pages → `index`** (the `/` route) → switch the editor to **HTML** (toggle off Markdown).
- Paste the contents of **`theme/home-page.html`** → Save.

### 4. Lock down access (8 teams, no self-signup)
- **Admin → Config → Visibility:** Registration **Disabled**; Account/Challenge/Score **Private**.
- **Admin → Users → + New User** ×8 — one account per team (`team01`…`team08`),
  a strong random password each. Store them in a vault; hand each to its team lead 1:1.
- **Admin → Config → Email:** disable outbound email (the team emails can be placeholders).

### 5. Seed the 10 stages (with gating + hints)
Easiest is **ctfcli** (challenge-as-code):
```bash
pip install ctfcli
ctf init                         # point it at your CTFd URL, paste an admin token
                                 # (Admin → Settings → Access Tokens)
for d in challenges/L0*-* challenges/L10-*; do ctf challenge install ./$d; done
ctf challenge sync ./challenges/L0*-* ./challenges/L10-*
```
Then **verify gating** in Admin → Challenges → each stage → **Requirements**:
Stage N requires Stage N-1, behaviour **Hidden until unlocked**. (ctfcli sets this
from each `challenge.yml`; if your version doesn't, add it with two clicks here.)

> Prefer no CLI? Recreate the 10 challenges by hand in **Admin → Challenges → +**,
> copy the description/flag/hints from each `challenge.yml`, and set **Requirements**
> on Stages 2–10. See `challenges/README.md` for the master table.

### 6. Make the scoreboard a race
Points are `stage × 100`, so **"most stages cleared" == highest score**, and CTFd's
natural tiebreak (earliest last solve) crowns the first crew to finish Stage 10.
Open `/scoreboard` to confirm.

---

## Deeper fork (optional, only if you want pixel control)

If you outgrow the inject-CSS route, copy the stock theme and edit templates directly:
```bash
docker compose exec ctfd cp -r /opt/CTFd/CTFd/themes/core-beta /opt/CTFd/CTFd/themes/nodezero
# drop theme/nodezero.css into themes/nodezero/static/...  and <link> it from base.html
# edit themes/nodezero/templates/index.html for the hero
```
Then pick **`nodezero`** in Admin → Config → Theme. More power, more maintenance —
not needed for the event.

---

## Per-stage wiring (files + git repos)

Each challenge description contains placeholder links — **replace before go-live**:
- `⬇ Download …` → attach the file directly to the CTFd challenge
  (Admin → Challenge → **Files**) — simplest for the log/image/wav/text artifacts.
- `<REPLACE-git-repo-url>/…` → the clonable **git repo** for each ROS-workspace stage
  (Cold Start, Mission 047, Wake Sequence, Full Boot). Internal Gitea or a GitHub org
  — must be clonable without Docker or a browser IDE. **No Gitpod / code-server.**

Per-team randomize the finale (and Stages 5/9) with `challenges/_templates/per-team-randomizer.py`.

---

## Go-live checklist
- [ ] User mode ON, registration **disabled**, 8 team accounts provisioned
- [ ] All 10 stages present; Stages 2–10 show **🔒 locked** until prereq solved
- [ ] Real flags set (replace `REPLACE` placeholders); finale flag randomized per team
- [ ] File attachments + git repo links live and tested from a clean Humble VM
- [ ] Each handoff string (e.g. the wake word `hawksbill`) matches byte-for-byte across stages
- [ ] Hints created with (time-)costs
- [ ] `/submit` brute-force: enable **Admin → Config → Security → rate limiting** / keep flags non-guessable
- [ ] TLS via reverse proxy; set a long `SECRET_KEY` in `docker-compose.yml`
- [ ] Backup: `docker compose exec ctfd python manage.py export_ctf` before doors open

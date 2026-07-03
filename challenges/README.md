# Challenges — NODE ZERO (8-stage linear trail)

Eight gated stages = one continuous trail to revive Unit Zero. Each stage is one
CTFd challenge; solving it reveals the next. The kit goes to the **first team to
clear Stage 8** (ties broken by that stage's submission timestamp — a race, not
a point total).

- **Flag format:** `nodezero{...}`
- **Environment:** participants use their own **Ubuntu 22.04 + ROS 2 Humble**.
  **No Docker, no browser IDE for participants.** ROS-workspace stages ship as a
  **git repo** teams clone and `colcon build` locally.
- **Points** are `stage × 100` purely so the scoreboard orders by stages-cleared;
  the real ranking rule is levels cleared → earliest final-flag timestamp.

## Master table

| Stage | Challenge | Type | Delivery | Unlocks after |
|---|---|---|---|---|
| 1 | STATIC ON THE LINE | Docs treasure-hunt (non-ROS) | `blackbox_fragment.log` (Files) | — (open) |
| 2 | SIGN OF LIFE | ROS 2 service call (wake word) | **git repo** | Stage 1 |
| 3 | COLD START | Broken colcon build | **git repo** | Stage 2 |
| 4 | CORRUPTED LOG | Cipher I (Caesar + Morse-coded key) | `corrupted.log` (Files) | Stage 3 |
| 5 | MISSION 047 | Rosbag forensics (with noise-filtering) | **git repo** (per-team) | Stage 4 |
| 6 | WAKE SEQUENCE | Broken launch + ROS 2 action call | **git repo** | Stage 5 |
| 7 | DIAGNOSTIC BEEP | Audio / Morse timing | `diagnostic_beep.wav` (Files) | Stage 6 |
| 8 | FULL BOOT (finale) | turtlesim square-tracing (teleop) | **git repo** (per-team flag) | Stage 7 |

> All 8 stages have built, verified artifacts. Stage 8's flag is a single
> shared value for testing — **per-team randomize Stages 5 and 8**
> (anti-share) using `_templates/per-team-randomizer.py` before
> go-live.

## The chain / clue handoffs

1 → 2 : the recovered wake word (`hawksbill`) is the input Stage 2 needs.
2 → 3 : Unit Zero's response names the git repo + tag for Cold Start.
3 → 4 : the `package.xml` `<version>` IS the Caesar shift.
4 → 5 : decoded plaintext names the `mission_047` rosbag.
5 → 6 : reconstructed message (after filtering noise from the channel) names
        the `node_zero_wakeseq` repo + the code (= its own tail).
6 → 7 : action result references `diagnostic_beep.wav`.
7 → 8 : decoded Morse word points to the full-boot repo (no key needed there
        anymore -- Stage 8 is pure piloting).

## Import (ctfcli)

```bash
pip install ctfcli
ctf init                                   # URL + admin access token
for d in L01-static-on-the-line L02-sign-of-life L03-cold-start \
         L04-corrupted-log L05-mission-047 L06-wake-sequence \
         L07-diagnostic-beep L08-full-boot; do
  ctf challenge install ./$d
done
ctf challenge sync ./*                      # pushes hints, values, requirements
```

## Import (manual, no CLI)

Admin → Challenges → **+** for each stage. Copy `name`, `description`, `value`,
`flags`, `hints`. Then on Stages 2–8 open the challenge → **Requirements** → add
the previous stage, behaviour **Hidden until unlocked** — that produces the 🔒
locked tiles and the linear trail.

## Attachments & repos — replace before go-live

- `⬇ Download …` links → attach the file directly to the CTFd challenge
  (Admin → Challenge → **Files**), simplest for small artifacts.
- `<REPLACE-git-repo-url>/…` → the clonable git repo for that ROS-workspace
  stage (internal Gitea / a GitHub org — must be clonable without Docker or a
  browser IDE). **No Gitpod / code-server links anywhere** (superseded).

## Pushing the workspace (ws) repos to git

ROS-workspace stages ship as a **standalone git repo** the team clones — push only
the package folder, NOT this `challenges/` tree (which holds flags + solutions).

- **Stage 2:** push `L02-sign-of-life/node_zero_handshake/` as its own repo.
  Its flag is stored base64 in `handshake_node.py` and decoded at runtime, so a
  `grep nodezero` on the clone finds nothing — it's safe to host where teams reach it.
- **Stage 3:** push `L03-cold-start/node_zero_coldstart/`. Same base64-at-runtime rule.
- **Stage 5:** push `L05-mission-047/node_zero_mission047/`. The flag lives inside the
  compiled rosbag, spread one character per message and mixed with noise — not
  reconstructable via a plain `grep`/`strings` scan. The organizer-only
  `_organizer_generate_bag.py` (has the plaintext message in the clear) stays out
  of this folder and is never pushed to the participant-facing repo.
- **Stage 6:** push `L06-wake-sequence/node_zero_wakeseq/`. Same base64-at-runtime rule.
- **Stage 8:** push `L08-full-boot/node_zero_fullboot/`. Same base64-at-runtime rule
  (the flag is only decoded once the square is confirmed).
- Each repo already has a `.gitignore` for `build/ install/ log/ __pycache__/`.

```bash
# example — publish the Stage 2 workspace repo
cd challenges/L02-sign-of-life/node_zero_handshake
git init && git add . && git commit -m "NODE ZERO Stage 2: handshake"
git remote add origin <your-host>/node_zero_handshake.git
git push -u origin main
# then paste that clone URL into the Stage 2 challenge.yml (replace <REPLACE-git-repo-url>)
```

## Per-team randomization

`_templates/per-team-randomizer.py` builds a unique `nodezero{...}` flag per team
and an organizer-only `answer_key.csv`. Use it for Stages 5, 7, and 8. Give each
team ONLY its own artifact.

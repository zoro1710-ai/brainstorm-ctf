# Challenges — NODE ZERO (10-stage linear trail)

Ten gated stages = one continuous trail to revive Unit Zero. Each stage is one
CTFd challenge; solving it reveals the next. The kit goes to the **first team to
clear Stage 10** (ties broken by that stage's submission timestamp — a race, not
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
| 2 | SIGN OF LIFE | ROS 2 topics + params (wake word) | **git repo** | Stage 1 |
| 3 | COLD START | Broken colcon build | **git repo** | Stage 2 |
| 4 | CORRUPTED LOG | Cipher I (Caesar/Vigenère) | `corrupted.log` (Files) | Stage 3 |
| 5 | MISSION 047 | Rosbag forensics | **git repo** (per-team) | Stage 4 |
| 6 | UPLINK DUMP | Cipher II (Base64 + XOR) | `uplink_dump.txt` (Files) | Stage 5 |
| 7 | QUIET SPACES ⭐ | Whitespace steganography | `archive_notes.log` (Files) | Stage 6 |
| 8 | WAKE SEQUENCE | Multi-step ROS 2 debug | **git repo** | Stage 7 |
| 9 | DIAGNOSTIC BEEP | Audio / Morse timing | `diagnostic_beep.wav` (+CSV) | Stage 8 |
| 10 | FULL BOOT (finale) | Full synthesis | **git repo** (per-team flag) | Stage 9 |

> Only Stage 1's flag (`nodezero{wake_word_hawksbill}`) is final. Every other
> `flags:` value marked `REPLACE` is a placeholder — set it to whatever the
> real authored artifact produces, and **per-team randomize Stages 5, 9, 10**
> (anti-share) using `_templates/per-team-randomizer.py`.

## The chain / clue handoffs

1 → 2 : the recovered wake word (`hawksbill`) is the input Stage 2 needs.
2 → 3 : Unit Zero's response names the git repo + tag for Cold Start.
3 → 4 : the `package.xml` `<version>` IS the Caesar shift.
4 → 5 : decoded plaintext names the `mission_047` rosbag + topic.
5 → 6 : reconstructed message names the uplink dump + XOR key (= its own tail).
6 → 7 : decoded text says "mind the quiet spaces" + names `archive_notes.log`.
7 → 8 : whitespace bits spell the service name + code for the wake call.
8 → 9 : service response references `diagnostic_beep.wav`.
9 → 10 : decoded Morse word = finale key + names the full-boot repo.

## Import (ctfcli)

```bash
pip install ctfcli
ctf init                                   # URL + admin access token
for d in L01-static-on-the-line L02-last-frame L03-cold-start \
         L04-corrupted-log L05-mission-047 L06-uplink-dump \
         L07-quiet-spaces L08-wake-sequence L09-diagnostic-beep L10-full-boot; do
  ctf challenge install ./$d
done
ctf challenge sync ./*                      # pushes hints, values, requirements
```

## Import (manual, no CLI)

Admin → Challenges → **+** for each stage. Copy `name`, `description`, `value`,
`flags`, `hints`. Then on Stages 2–10 open the challenge → **Requirements** → add
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
- Same rule for future ws stages (Cold Start, Wake Sequence, Full Boot): extract the
  package into its own repo and **never commit the literal flag** in greppable form.
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
and an organizer-only `answer_key.csv`. Use it for Stages 5, 9, 10. Give each
team ONLY its own artifact.

#!/usr/bin/env python3
"""
NODE ZERO — per-team challenge/flag generator (REUSABLE TEMPLATE).

Ported forward from the old L1-drivetrain draft. Use this for any stage that
should hand each team a UNIQUE flag so a leaked flag is useless to other teams
and no answer can be looked up online. Recommended for the randomizable stages:
  - L5 // MISSION 047   (flag spread through a per-team rosbag / topic dump)
  - L7 // DIAGNOSTIC BEEP (per-team Morse key)
  - L8 // FULL BOOT     (finale token emitted on full wake — MUST be per-team)

What it does, per team:
  1. builds a UNIQUE flag                 -> nodezero{<prefix>_<token>}
  2. encodes it into the stage artifact   (override encode_flag_to_ticks for the
     stage's real medium: rosbag chars, WAV timing, sim token, etc.)
  3. writes the team's file               -> dist/<team>/<artifact>
  4. records the answer key (organizer)   -> answer_key.csv  (KEEP PRIVATE)

Run:  python per-team-randomizer.py team01 team02 ... team08
      python per-team-randomizer.py --from teams.txt
"""
import csv, os, random, sys, secrets

FLAG_PREFIX = "m047"                       # change per stage, e.g. beep / boot
REAL_MIN, REAL_MAX = 180, 240              # plausible noise range (tick example)


def make_flag() -> str:
    token = secrets.token_hex(3)           # e.g. 'a7f3c1' — unguessable, unique
    return f"nodezero{{{FLAG_PREFIX}_{token}}}"


def encode_flag_to_ticks(flag: str) -> list[int]:
    """
    EXAMPLE encoder (from the drivetrain draft): hide the flag as ASCII codes
    between two 0 markers, surrounded by realistic noise. Replace the body of
    this function with the actual medium for your stage (rosbag payloads, WAV
    pulse timings, sim token file, etc.).
    """
    stream = []
    for _ in range(random.randint(8, 14)):
        stream.append(random.randint(REAL_MIN, REAL_MAX))
    stream.append(0)                                   # START marker
    for ch in flag:
        stream.append(ord(ch))                         # ASCII code of each char
    stream.append(0)                                   # END marker
    for _ in range(random.randint(8, 14)):
        stream.append(random.randint(REAL_MIN, REAL_MAX))
    return stream


def write_team_file(team: str, ticks: list[int]) -> str:
    outdir = os.path.join("dist", team)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, "artifact.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["seq", "value"])
        for i, t in enumerate(ticks):
            w.writerow([i, t])
    return path


def main(teams: list[str]):
    if not teams:
        print("usage: python per-team-randomizer.py <team1> <team2> ...")
        sys.exit(1)
    os.makedirs("dist", exist_ok=True)
    with open("answer_key.csv", "w", newline="") as keyf:
        kw = csv.writer(keyf)
        kw.writerow(["team", "flag"])
        for team in teams:
            flag = make_flag()
            path = write_team_file(team, encode_flag_to_ticks(flag))
            kw.writerow([team, flag])
            print(f"[+] {team:14s} -> {path}   flag={flag}")
    print("\nAnswer key -> answer_key.csv  (KEEP PRIVATE — organizers only)")
    print("Give each team ONLY their own dist/<team>/ artifact.")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--from":
        with open(args[1]) as f:
            teams = [ln.strip() for ln in f if ln.strip()]
    else:
        teams = args
    main(teams)

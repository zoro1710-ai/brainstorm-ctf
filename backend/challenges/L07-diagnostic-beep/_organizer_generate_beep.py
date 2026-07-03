#!/usr/bin/env python3
"""
NODE ZERO -- Stage 7 organizer tool: builds diagnostic_beep.wav from
beep_timing.csv (the two must always describe the exact same pattern).

Reads beep_timing.csv (index,state,start_ms,duration_ms) and synthesizes a
WAV: a tone during each ON window, silence during each OFF window. The
on/off envelope is Morse timing (short=dot, long=dash), deliberately not a
cipher -- kept distinct from the medium-tier cipher stages.

Run:
    python3 _organizer_generate_beep.py [outdir]
"""
import csv
import math
import os
import struct
import sys
import wave

SAMPLE_RATE = 44100
TONE_HZ = 800.0
AMPLITUDE = 0.6  # of full scale, keeps headroom / avoids clipping
FADE_MS = 5      # short fade in/out per tone to avoid audible clicks


def read_timing(csv_path):
    rows = []
    with open(csv_path, newline='') as f:
        for r in csv.DictReader(f):
            rows.append((r['state'], int(r['start_ms']), int(r['duration_ms'])))
    return rows


def synth(rows):
    samples = []
    for state, _start_ms, duration_ms in rows:
        n = int(SAMPLE_RATE * duration_ms / 1000)
        fade_n = min(int(SAMPLE_RATE * FADE_MS / 1000), n // 2)
        for i in range(n):
            if state == 'ON':
                v = AMPLITUDE * math.sin(2 * math.pi * TONE_HZ * (i / SAMPLE_RATE))
                if i < fade_n:
                    v *= i / fade_n
                elif i > n - fade_n:
                    v *= (n - i) / fade_n
            else:
                v = 0.0
            samples.append(int(v * 32767))
    return samples


def write_wav(path, samples):
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(struct.pack('<%dh' % len(samples), *samples))


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else '.'
    csv_path = os.path.join(os.path.dirname(__file__), 'beep_timing.csv')
    rows = read_timing(csv_path)
    samples = synth(rows)
    out_path = os.path.join(outdir, 'diagnostic_beep.wav')
    write_wav(out_path, samples)
    total_ms = rows[-1][1] + rows[-1][2]
    print(f'[+] wrote {out_path} ({total_ms/1000:.2f}s, {len(rows)} on/off segments)')


if __name__ == '__main__':
    main()

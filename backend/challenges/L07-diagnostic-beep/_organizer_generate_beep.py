#!/usr/bin/env python3
"""
NODE ZERO -- Stage 7 organizer tool: builds diagnostic_beep.wav.

Synthesizes a WAV from the on/off timing below: a tone during each ON
window, silence during each OFF window. The on/off envelope is Morse
timing (short=dot, long=dash) for the word REVIVE, deliberately not a
cipher -- kept distinct from the medium-tier cipher stages.

Run:
    python3 _organizer_generate_beep.py [outdir]
"""
import math
import os
import struct
import sys
import wave

SAMPLE_RATE = 44100
TONE_HZ = 800.0
AMPLITUDE = 0.6  # of full scale, keeps headroom / avoids clipping
FADE_MS = 5      # short fade in/out per tone to avoid audible clicks

# (state, start_ms, duration_ms) -- decodes to REVIVE in Morse timing.
TIMING = [
    ('ON', 0, 120), ('OFF', 120, 120), ('ON', 240, 360), ('OFF', 600, 120),
    ('ON', 720, 120), ('OFF', 840, 360), ('ON', 1200, 120), ('OFF', 1320, 360),
    ('ON', 1680, 120), ('OFF', 1800, 120), ('ON', 1920, 120), ('OFF', 2040, 120),
    ('ON', 2160, 120), ('OFF', 2280, 120), ('ON', 2400, 360), ('OFF', 2760, 360),
    ('ON', 3120, 120), ('OFF', 3240, 120), ('ON', 3360, 120), ('OFF', 3480, 360),
    ('ON', 3840, 120), ('OFF', 3960, 120), ('ON', 4080, 120), ('OFF', 4200, 120),
    ('ON', 4320, 120), ('OFF', 4440, 120), ('ON', 4560, 360), ('OFF', 4920, 360),
    ('ON', 5280, 120),
]


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
    samples = synth(TIMING)
    out_path = os.path.join(outdir, 'diagnostic_beep.wav')
    write_wav(out_path, samples)
    total_ms = TIMING[-1][1] + TIMING[-1][2]
    print(f'[+] wrote {out_path} ({total_ms/1000:.2f}s, {len(TIMING)} on/off segments)')


if __name__ == '__main__':
    main()

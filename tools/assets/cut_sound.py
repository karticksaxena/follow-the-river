"""Cut a sound from a 16-bit WAV: trim, optional mono / high-pass / seamless loop, 30 ms fades, peak -3 dBFS, 48 kHz.
usage: cut_sound.py in.wav out.wav --start S --end S [--hp HZ] [--mono] [--loop SECONDS] [--peak DB] [--fadein S] [--fadeout S]   (stdlib only)
Order: trim, mono, resample to 48 kHz, high-pass, loop crossfade, fades (not when looping), normalise.
Encode afterwards: afconvert -f m4af -d aac -b 96000 [-c 1] out.wav out.m4a"""
import argparse, math

from wavio import read_wav, write_wav

RATE = 48000
FADE_S = 0.03
PEAK_DB = -3.0


def trim(chans, sr, start, end):
    """Keep seconds [start, end) of every channel (end None = to the end)."""
    a, b = int(start * sr), None if end is None else int(end * sr)
    return [c[a:b] for c in chans]


def to_mono(chans):
    """Average the channels into one."""
    return [[sum(v) / len(chans) for v in zip(*chans)]]


def resample(x, sr, to=RATE):
    """Linear-interpolation resample of one channel."""
    if sr == to:
        return x
    n = int(len(x) * to / sr)
    out = []
    for i in range(n):
        p = i * sr / to
        j = int(p)
        f = p - j
        out.append(x[j] * (1 - f) + x[min(j + 1, len(x) - 1)] * f)
    return out


def highpass(x, sr, hz):
    """One-pole high-pass: y[i] = a * (y[i-1] + x[i] - x[i-1])."""
    a = 1 / (1 + 2 * math.pi * hz / sr)
    out, y, prev = [], 0.0, x[0]
    for v in x:
        y = a * (y + v - prev)
        prev = v
        out.append(y)
    return out


def loop_crossfade(x, sr, seconds):
    """Make x loop seamlessly: fade the last `seconds` out while fading the matching head in, drop the tail.
    out[-1] is followed by out[0] == x[n-L] (the sample after the last kept one), so the seam is continuous."""
    n, L = len(x), int(seconds * sr)
    keep = n - L
    out = x[:keep]
    for i in range(L):
        t = (i + 0.5) / L
        out[i] = x[i] * math.sin(t * math.pi / 2) + x[keep + i] * math.cos(t * math.pi / 2)  # equal-power
    return out


def fade_edges(x, sr, seconds=FADE_S, fade_in=FADE_S):
    """Linear fade out over `seconds` and fade in over `fade_in` (0 keeps a transient's attack)."""
    n = min(int(seconds * sr), len(x) // 2)
    for i in range(n):
        x[-1 - i] *= i / n
    m = min(int(fade_in * sr), len(x) // 2)
    for i in range(m):
        x[i] *= i / m
    return x


def peak_of(chans):
    """Largest absolute sample over all channels."""
    return max(max(abs(v) for v in c) for c in chans)


def normalise(chans, db=PEAK_DB):
    """Scale all channels together so the peak lands at `db` dBFS."""
    g = 10 ** (db / 20) / peak_of(chans)
    return [[v * g for v in c] for c in chans]


def process(chans, sr, start, end, mono=False, hp=0.0, loop=0.0, peak=PEAK_DB, fade_in=FADE_S, fade_out=FADE_S):
    """Run the whole chain on per-channel lists; returns the new channels (at RATE)."""
    chans = trim(chans, sr, start, end)
    if mono and len(chans) > 1:
        chans = to_mono(chans)
    chans = [resample(c, sr) for c in chans]
    if hp:
        chans = [highpass(c, RATE, hp) for c in chans]
    chans = [loop_crossfade(c, RATE, loop) if loop else fade_edges(c, RATE, fade_out, fade_in) for c in chans]
    return normalise(chans, peak)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--hp", type=float, default=0, help="high-pass corner in Hz")
    ap.add_argument("--mono", action="store_true")
    ap.add_argument("--loop", type=float, default=0, help="crossfade the last N seconds into the start")
    ap.add_argument("--peak", type=float, default=PEAK_DB, help="peak level in dBFS (AAC can overshoot a little)")
    ap.add_argument("--fadein", type=float, default=FADE_S, help="fade-in seconds (0 for a sharp attack)")
    ap.add_argument("--fadeout", type=float, default=FADE_S, help="fade-out seconds")
    a = ap.parse_args()
    _, sr, chans = read_wav(a.src)
    write_wav(a.dst, RATE, process(chans, sr, a.start, a.end, a.mono, a.hp, a.loop, a.peak, a.fadein, a.fadeout))


if __name__ == "__main__":
    main()

"""Draw a WAV's spectrogram as a PNG, to pick clean calls by eye (stdlib only: zlib + struct, own radix-2 FFT).
usage: spectrogram.py in.wav out.png [--start S] [--end S] [--pps PIXELS_PER_SECOND] [--fmax HZ]
Time runs left to right (ticks each second, longer each 5 s, labelled in seconds), frequency bottom to top."""
import argparse, cmath, math, struct, zlib

from wavio import read_wav

N = 512      # FFT size; with ~11 kHz after decimation, 21 Hz per bin
HOP = 128    # samples between frames
DB_RANGE = 70.0
GLYPHS = {   # 3x5 digit font, one row per 3-bit int
    "0": (7, 5, 5, 5, 7), "1": (2, 6, 2, 2, 7), "2": (7, 1, 7, 4, 7), "3": (7, 1, 7, 1, 7), "4": (5, 5, 7, 1, 1),
    "5": (7, 4, 7, 1, 7), "6": (7, 4, 7, 5, 7), "7": (7, 1, 1, 1, 1), "8": (7, 5, 7, 5, 7), "9": (7, 5, 7, 1, 7),
}


def read_mono(path):
    """Return (samples in -1..1 averaged over channels, sample rate) of a 16-bit WAV."""
    ch, sr, chans = read_wav(path)
    return [sum(v) / ch for v in zip(*chans)], sr


def decimate(x, sr, target=11025):
    """Box-average by an integer factor so the rate lands near `target`; returns (samples, new rate)."""
    k = max(1, round(sr / target))
    return [sum(x[i:i + k]) / k for i in range(0, len(x) - k + 1, k)], sr // k


def fft(a):
    """Recursive radix-2 FFT of a power-of-two list of complex numbers."""
    n = len(a)
    if n == 1:
        return a
    ev, od = fft(a[0::2]), fft(a[1::2])
    tw = [cmath.exp(-2j * math.pi * k / n) * od[k] for k in range(n // 2)]
    return [ev[k] + tw[k] for k in range(n // 2)] + [ev[k] - tw[k] for k in range(n // 2)]


def frames_db(x, win):
    """Yield one list of N/2 log-magnitude values (dB) per hop."""
    for s in range(0, len(x) - N, HOP):
        spec = fft([complex(x[s + i] * win[i]) for i in range(N)])
        yield [20 * math.log10(abs(spec[k]) / N + 1e-9) for k in range(N // 2)]


def colour(v):
    """0..1 -> dark blue / purple / red / yellow / white ramp as (r, g, b)."""
    v = max(0.0, min(1.0, v))
    stops = [(0, (0, 0, 20)), (0.35, (60, 10, 120)), (0.65, (230, 60, 60)), (0.9, (255, 230, 80)), (1, (255, 255, 255))]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if v <= b:
            t = (v - a) / (b - a)
            return tuple(int(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))
    return stops[-1][1]


def draw_ticks(px, width, height, t0, pps):
    """Paint second ticks and 5 s digit labels into the bottom 12 rows of px (rows of (r,g,b))."""
    for sec in range(math.ceil(t0), math.ceil(t0 + width / pps)):
        x = int((sec - t0) * pps)
        if x >= width:
            break
        long = sec % 5 == 0
        for y in range(height - 12, height - 12 + (6 if long else 3)):
            px[y][x] = (255, 255, 255)
        if long:
            for gi, ch in enumerate(str(sec)):
                for r, bits in enumerate(GLYPHS[ch]):
                    for c in range(3):
                        if bits >> (2 - c) & 1 and x + 2 + gi * 4 + c < width:
                            px[height - 6 + r][x + 2 + gi * 4 + c] = (255, 255, 255)


def write_png(path, px):
    """Write rows of (r, g, b) tuples as an 8-bit RGB PNG."""
    h, w = len(px), len(px[0])
    raw = b"".join(b"\0" + bytes(v for p in row for v in p) for row in px)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def render(x, sr, t0, pps, fmax):
    """Spectrogram image rows for x (already decimated, starting at t0 seconds)."""
    win = [0.5 - 0.5 * math.cos(2 * math.pi * i / N) for i in range(N)]
    cols = list(frames_db(x, win))
    top = int(min(fmax, sr / 2) / (sr / N))
    peak = max(max(c[:top]) for c in cols)
    width = int(len(x) / sr * pps)
    height = top + 12
    px = [[(0, 0, 0)] * width for _ in range(height)]
    for x_px in range(width):
        c = cols[max(0, min(len(cols) - 1, int((x_px / pps * sr - N / 2) / HOP)))]
        for k in range(top):
            px[top - 1 - k][x_px] = colour((c[k] - peak + DB_RANGE) / DB_RANGE)
    draw_ticks(px, width, height, t0, pps)
    return px


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--pps", type=int, default=100)
    ap.add_argument("--fmax", type=float, default=5500)
    a = ap.parse_args()
    x, sr = read_mono(a.src)
    x = x[int(a.start * sr):None if a.end is None else int(a.end * sr)]
    x, sr = decimate(x, sr)
    write_png(a.dst, render(x, sr, a.start, a.pps, a.fmax))


if __name__ == "__main__":
    main()

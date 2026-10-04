"""Cut one shot from a long 24-bit stereo WAV: mono, trim to first onset, fixed length, fade-out, peak -1 dBFS, 48 kHz 16-bit.
usage: cut_shot.py in.wav out.wav seconds   (stdlib only)"""
import sys, wave, struct, math
src, dst, length = sys.argv[1], sys.argv[2], float(sys.argv[3])
w = wave.open(src); ch, sw, sr = w.getnchannels(), w.getsampwidth(), w.getframerate()
raw = w.readframes(w.getnframes()); n = len(raw) // (sw * ch)
def s(i, c):
    o = (i * ch + c) * sw
    return int.from_bytes(raw[o:o + sw], "little", signed=True) / (1 << (8 * sw - 1))
mono = [sum(s(i, c) for c in range(ch)) / ch for i in range(n)]
peak = max(abs(x) for x in mono)
start = next(i for i, x in enumerate(mono) if abs(x) > 0.1 * peak)
start = max(0, start - int(0.003 * sr))
seg = mono[start:start + int(length * sr)]
seg = [(seg[i] + seg[i + 1]) / 2 for i in range(0, len(seg) - 1, 2)]  # 96k -> 48k
sr //= 2
fade = int(0.15 * sr)
for i in range(fade): seg[-1 - i] *= i / fade
g = 10 ** (-1 / 20) / max(abs(x) for x in seg)
o = wave.open(dst, "wb"); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr)
o.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x * g)) * 32767)) for x in seg)); o.close()

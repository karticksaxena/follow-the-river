"""16-bit PCM WAV reader/writer for the sound tools (stdlib only).
Python's `wave` rejects the WAVE_FORMAT_EXTENSIBLE header that afconvert writes, so the RIFF chunks are parsed here."""
import struct


def read_wav(path):
    """Return (channels, sample rate, list of per-channel float lists in -1..1) from a 16-bit PCM WAV."""
    data = open(path, "rb").read()
    pos, ch, sr, bits, pcm = 12, 0, 0, 0, b""
    while pos + 8 <= len(data):
        tag, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if tag == b"fmt ":
            _, ch, sr, _, _, bits = struct.unpack("<HHIIHH", body[:16])
        elif tag == b"data":
            pcm = body
        pos += 8 + size + (size & 1)
    if bits != 16:
        raise ValueError("%s: need 16-bit PCM, got %d-bit" % (path, bits))
    vals = struct.unpack("<%dh" % (len(pcm) // 2), pcm[:len(pcm) // 2 * 2])
    return ch, sr, [[v / 32768 for v in vals[c::ch]] for c in range(ch)]


def write_wav(path, sr, chans):
    """Write per-channel float lists (clipped to -1..1) as a 16-bit PCM WAV."""
    ch, n = len(chans), len(chans[0])
    pcm = struct.pack("<%dh" % (n * ch), *[int(max(-1.0, min(1.0, chans[c][i])) * 32767) for i in range(n) for c in range(ch)])
    hdr = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, ch, sr, sr * ch * 2, ch * 2, 16)
    with open(path, "wb") as f:
        f.write(hdr + b"data" + struct.pack("<I", len(pcm)) + pcm)

// Decode DSH session.v4.jsonl.zstd (concatenated zstd frames).
// Node 22+ is required for zlib.zstdDecompressSync.
import fs from "node:fs";
import zlib from "node:zlib";

const MAGIC = 0xfd2fb528; // little-endian read of bytes 28 b5 2f fd

function frameLen(buf, off) {
  if (off + 4 > buf.length) return -1;
  if (buf.readUInt32LE(off) !== MAGIC) return -1;
  let p = off + 4;
  const fhd = buf[p++];
  const fcsFlag = (fhd >> 6) & 3;
  const single = (fhd >> 5) & 1;
  const checksum = (fhd >> 2) & 1;
  const didFlag = fhd & 3;
  if (!single) p += 1; // window descriptor
  const didSize = [0, 1, 2, 4][didFlag];
  p += didSize;
  let fcsSize = [0, 2, 4, 8][fcsFlag];
  if (single && fcsFlag === 0) fcsSize = 1;
  p += fcsSize;
  for (;;) {
    if (p + 3 > buf.length) return -1;
    const h = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
    p += 3;
    const last = h & 1;
    const type = (h >> 1) & 3;
    const size = (h >> 3) & 0x1fffff;
    if (type === 1) {
      // RLE: one payload byte regenerates `size` bytes.
      p += 1;
    } else {
      p += size;
    }
    if (last) break;
    if (p > buf.length) return -1;
  }
  if (checksum) p += 4;
  return p - off;
}

export function decodeAll(file) {
  const buf = fs.readFileSync(file);
  const parts = [];
  let off = 0;
  let frames = 0;
  let bad = 0;
  while (off < buf.length) {
    const len = frameLen(buf, off);
    if (len <= 0) {
      bad++;
      break;
    }
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(off, off + len)));
      frames++;
    } catch {
      bad++;
    }
    off += len;
  }
  return {
    buf,
    frames,
    bad,
    trailing: buf.length - off,
    data: Buffer.concat(parts),
  };
}

if (process.argv[1] && process.argv[1].endsWith("decode-session.mjs")) {
  for (const f of process.argv.slice(2)) {
    const r = decodeAll(f);
    const lines = r.data.toString("utf8").split("\n").filter(Boolean);
    const shapes = new Map();
    for (const ln of lines) {
      let o;
      try {
        o = JSON.parse(ln);
      } catch {
        shapes.set("PARSE_FAIL", (shapes.get("PARSE_FAIL") || 0) + 1);
        continue;
      }
      const k = (o.type || "?") + " | " + Object.keys(o).sort().join(",");
      shapes.set(k, (shapes.get(k) || 0) + 1);
    }
    const label = f.split(/[\\/]/).slice(-2).join("/");
    console.log(`=== ${label} frames=${r.frames} bad=${r.bad} raw=${r.buf.length} dec=${r.data.length} lines=${lines.length}`);
    for (const [k, c] of [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  x${c}  ${k}`);
    }
    for (const i of [0, 1]) {
      if (lines[i]) console.log(`  SAMPLE[${i}] ${lines[i].slice(0, 700)}`);
    }
    console.log();
  }
}

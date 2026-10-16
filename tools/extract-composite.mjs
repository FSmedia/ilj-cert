// Extract composite image from PSD -> PNG, and dump text-layer engine data
import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2];
const outPng = process.argv[3];
const buf = fs.readFileSync(file);

let p = 4 + 2 + 6;
const channels = buf.readUInt16BE(p); p += 2;
const height = buf.readUInt32BE(p); p += 4;
const width = buf.readUInt32BE(p); p += 4;
const depth = buf.readUInt16BE(p); p += 2;
const colorMode = buf.readUInt16BE(p); p += 2;
console.log({ channels, width, height, depth, colorMode });

const cml = buf.readUInt32BE(p); p += 4 + cml;
const irl = buf.readUInt32BE(p); p += 4 + irl;

// Layer & mask info
const lml = buf.readUInt32BE(p); p += 4;
const lmEnd = p + lml;

// ---- Parse layers (names, bounds, text engine data) ----
const liStart = p;
const liLen = buf.readUInt32BE(p); p += 4;
const layerCount = buf.readInt16BE(p); p += 2;
const n = Math.abs(layerCount);
const layers = [];
for (let i = 0; i < n; i++) {
  const top = buf.readInt32BE(p), left = buf.readInt32BE(p + 4), bottom = buf.readInt32BE(p + 8), right = buf.readInt32BE(p + 12);
  p += 16;
  const nCh = buf.readUInt16BE(p); p += 2;
  const chans = [];
  for (let c = 0; c < nCh; c++) { chans.push({ id: buf.readInt16BE(p), len: buf.readUInt32BE(p + 2) }); p += 6; }
  p += 4; // blend sig
  p += 4; // blend key
  p += 3; // opacity, clipping, flags
  p += 1; // filler
  const extra = buf.readUInt32BE(p); p += 4;
  const extraEnd = p + extra;
  const maskLen = buf.readUInt32BE(p); p += 4 + maskLen;
  const brLen = buf.readUInt32BE(p); p += 4 + brLen;
  const nameLen2 = buf[p]; p += 1;
  let name = "";
  for (let k = 0; k < nameLen2; k++) name += String.fromCharCode(buf[p + k]);
  p += nameLen2;
  p += (4 - ((nameLen2 + 1) % 4)) % 4;

  let isText = false, tySh = null;
  while (p + 12 <= extraEnd) {
    const key = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32BE(p + 4);
    if (key === "TySh") { isText = true; tySh = { offset: p + 8, size }; }
    if (key === "luni" && size > 4) {
      const len = buf.readUInt32BE(p + 8);
      let s = "";
      for (let k = 0; k < len; k++) s += String.fromCharCode(buf.readUInt16BE(p + 12 + k * 2));
      name = s;
    }
    if (size < 0 || p + 8 + size > extraEnd + 8) break;
    p += 8 + size + (size % 2);
  }
  p = extraEnd;
  layers.push({ i, name, top, left, bottom, right, w: right - left, h: bottom - top, chans, isText, tySh });
}

// ---- Dump TySh data for text layers ----
const dumpDir = new URL("./tysh-dump/", import.meta.url);
fs.mkdirSync(dumpDir, { recursive: true });
for (const l of layers) {
  if (!l.tySh) continue;
  const { offset, size } = l.tySh;
  const raw = buf.subarray(offset, offset + size);
  fs.writeFileSync(new URL(`layer-${l.i}-${l.name.replace(/[^a-z0-9]/gi, "_")}.bin`, dumpDir), raw);
  // TySh: version(2) descVer(4) transform(6 doubles) hScale(double) vScale(double) fontSize(double) tracking(double) then descriptor
  const ver = raw.readUInt16BE(0);
  const descVer = raw.readUInt32BE(2);
  const t = [];
  for (let k = 0; k < 6; k++) t.push(raw.readDoubleBE(6 + k * 8));
  const hScale = raw.readDoubleBE(54), vScale = raw.readDoubleBE(62), fontSize = raw.readDoubleBE(70), tracking = raw.readDoubleBE(78);
  // Extract readable UTF-16BE strings and ASCII font-ish strings from the whole raw block
  const u16 = [];
  for (let k = 86; k + 4 < raw.length; k += 2) {
    const cp = raw.readUInt16BE(k);
    if (cp >= 32 && cp < 127) {
      let s = "", j = k;
      while (j + 2 <= raw.length) {
        const c = raw.readUInt16BE(j);
        if (c < 32 || c >= 127) break;
        s += String.fromCharCode(c); j += 2;
      }
      if (s.length >= 3) u16.push(s);
      k = j;
    }
  }
  console.log(`\n=== Layer ${l.i} "${l.name}" [${l.w}x${l.h} @ ${l.left},${l.top}] ===`);
  console.log({ ver, descVer, transform: t, hScale, vScale, fontSize, tracking });
  console.log("strings:", JSON.stringify([...new Set(u16)].slice(0, 40)));
}

// ---- Decode composite image data ----
p = lmEnd;
const compression = buf.readUInt16BE(p); p += 2;
console.log("\nComposite offset:", lmEnd, "compression:", compression);

function packBitsDecode(src, dst, expected) {
  let si = 0, di = 0;
  while (di < expected && si < src.length) {
    const b = src[si++];
    if (b < 128) { const cnt = b + 1; for (let k = 0; k < cnt && di < expected; k++) dst[di++] = src[si++]; }
    else { const cnt = 257 - b; const v = src[si++]; for (let k = 0; k < cnt && di < expected; k++) dst[di++] = v; }
  }
  return di;
}

const ch = channels;
const planes = [];
if (compression === 1) {
  const rowCounts = new Uint16Array(height * ch);
  for (let i = 0; i < height * ch; i++) { rowCounts[i] = buf.readUInt16BE(p); p += 2; }
  for (let c = 0; c < ch; c++) {
    const plane = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      const len = rowCounts[c * height + y];
      packBitsDecode(buf.subarray(p, p + len), plane.subarray(y * width, (y + 1) * width), width);
      p += len;
    }
    planes.push(plane);
    console.log(`channel ${c} decoded`);
  }
} else if (compression === 0) {
  for (let c = 0; c < ch; c++) { planes.push(buf.subarray(p, p + width * height)); p += width * height; }
} else {
  console.error("Unsupported compression", compression);
  process.exit(1);
}

// ---- Write PNG (filter 0, zlib) ----
const raw = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) {
  const rowStart = y * (width * 3 + 1);
  raw[rowStart] = 0;
  for (let x = 0; x < width; x++) {
    const di = rowStart + 1 + x * 3;
    raw[di] = planes[0][y * width + x];
    raw[di + 1] = planes[1][y * width + x];
    raw[di + 2] = planes[2][y * width + x];
  }
}
const idat = zlib.deflateSync(raw, { level: 6 });

function crc32(b) {
  let c, table = [];
  for (let i = 0; i < 256; i++) { c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[i] = c >>> 0; }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) crc = table[(crc ^ b[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
fs.writeFileSync(outPng, Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]));
console.log("Wrote", outPng, fs.statSync(outPng).size, "bytes");

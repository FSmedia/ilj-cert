// Build clean certificate background: remove baked-in sample text zones via inpainting
import fs from "node:fs";
import zlib from "node:zlib";

const src = process.argv[2];
const dst = process.argv[3];

// --- decode PNG (our own filter-0 output) ---
const png = fs.readFileSync(src);
let p = 8, width = 0, height = 0;
const idats = [];
while (p < png.length) {
  const len = png.readUInt32BE(p); const type = png.toString("ascii", p + 4, p + 8);
  const data = png.subarray(p + 8, p + 8 + len);
  if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
  if (type === "IDAT") idats.push(data);
  p += 12 + len;
}
const rawIn = zlib.inflateSync(Buffer.concat(idats));
const stride = width * 3 + 1;
const img = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y++) {
  const f = rawIn[y * stride];
  if (f !== 0) throw new Error("unexpected PNG filter " + f);
  rawIn.copy(img, y * width * 3, y * stride + 1, y * stride + 1 + width * 3);
}
console.log("decoded", width, "x", height);

const lum = (x, y) => { const i = (y * width + x) * 3; return img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114; };

// Zones [x0, y0, x1, y1, threshold, dilate]
const zones = [
  [900, 1150, 2450, 1309, 170, 2],   // candidate name (keeps light ornament + divider line at y1311+)
  [650, 1380, 2860, 1830, 170, 2],   // body paragraphs
  [1130, 1975, 1560, 2070, 170, 2],  // issue date value
  [250, 2170, 1160, 2228, 170, 2],   // certification code
];

for (const [x0, y0, x1, y1, thr, dil] of zones) {
  // build mask
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (lum(x, y) < thr) mask[y * width + x] = 1;
  // dilate
  for (let d = 0; d < dil; d++) {
    const m2 = new Uint8Array(mask);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (mask[y * width + x]) {
        if (x > x0) m2[y * width + x - 1] = 1;
        if (x < x1 - 1) m2[y * width + x + 1] = 1;
        if (y > y0) m2[(y - 1) * width + x] = 1;
        if (y < y1 - 1) m2[(y + 1) * width + x] = 1;
      }
    }
    mask.set(m2);
  }
  // inpaint: horizontal interpolation from nearest unmasked pixels
  let filled = 0;
  for (let y = y0; y < y1; y++) {
    let x = x0;
    while (x < x1) {
      if (!mask[y * width + x]) { x++; continue; }
      const segStart = x;
      while (x < x1 && mask[y * width + x]) x++;
      const segEnd = x; // exclusive
      // find nearest unmasked left (search outside zone too, up to 120px)
      let lx = segStart - 1, foundL = false;
      while (lx >= Math.max(0, segStart - 150)) { if (!mask[y * width + lx]) { foundL = true; break; } lx--; }
      let rx = segEnd, foundR = false;
      while (rx < Math.min(width, segEnd + 150)) { if (!mask[y * width + rx]) { foundR = true; break; } rx++; }
      for (let px = segStart; px < segEnd; px++) {
        const i = (y * width + px) * 3;
        if (foundL && foundR) {
          const t = (px - lx) / (rx - lx);
          for (let c = 0; c < 3; c++) img[i + c] = Math.round(img[(y * width + lx) * 3 + c] * (1 - t) + img[(y * width + rx) * 3 + c] * t);
        } else if (foundL) {
          for (let c = 0; c < 3; c++) img[i + c] = img[(y * width + lx) * 3 + c];
        } else if (foundR) {
          for (let c = 0; c < 3; c++) img[i + c] = img[(y * width + rx) * 3 + c];
        }
        filled++;
      }
    }
  }
  console.log(`zone ${x0},${y0}-${x1},${y1}: inpainted ${filled} px`);
}

// --- encode PNG ---
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
const rawOut = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) {
  const rs = y * (width * 3 + 1);
  rawOut[rs] = 0;
  img.copy(rawOut, rs + 1, y * width * 3, (y + 1) * width * 3);
}
const idat = zlib.deflateSync(rawOut, { level: 9 });
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(dst, Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]));
console.log("wrote", dst, fs.statSync(dst).size, "bytes");

// Render composite.png as ASCII art and analyze zones
import fs from "node:fs";
import zlib from "node:zlib";

const png = fs.readFileSync(process.argv[2]);
// parse PNG
let p = 8, width = 0, height = 0;
const idats = [];
while (p < png.length) {
  const len = png.readUInt32BE(p); const type = png.toString("ascii", p + 4, p + 8);
  const data = png.subarray(p + 8, p + 8 + len);
  if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
  if (type === "IDAT") idats.push(data);
  p += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idats));
const stride = width * 3 + 1;
const img = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y++) {
  const f = raw[y * stride];
  if (f !== 0) throw new Error("unexpected filter " + f);
  raw.copy(img, y * width * 3, y * stride + 1, y * stride + 1 + width * 3);
}
console.log("decoded", width, "x", height);

const mode = process.argv[3] || "art";
if (mode === "art") {
  const cols = +(process.argv[4] || 140), rows = +(process.argv[5] || 44);
  const ramp = " .:-=+*#%@";
  let out = "";
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * width / cols), x1 = Math.floor((c + 1) * width / cols);
      const y0 = Math.floor(r * height / rows), y1 = Math.floor((r + 1) * height / rows);
      let sum = 0, cnt = 0;
      for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
        const i = (y * width + x) * 3;
        sum += (img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114); cnt++;
      }
      const lum = sum / cnt;
      line += ramp[Math.min(9, Math.floor((255 - lum) / 25.6))];
    }
    out += line + "\n";
  }
  console.log(out);
}
if (mode === "sample") {
  // sample color at points
  for (const arg of process.argv.slice(4)) {
    const [x, y] = arg.split(",").map(Number);
    const i = (y * width + x) * 3;
    console.log(`(${x},${y}) rgb(${img[i]},${img[i + 1]},${img[i + 2]})`);
  }
}
if (mode === "profile") {
  // For region x0,y0,x1,y1: print row bands containing ink and their bboxes + ink color + bg color
  for (const arg of process.argv.slice(4)) {
    const [x0, y0, x1, y1] = arg.split(",").map(Number);
    const rows = [];
    for (let y = y0; y < y1; y++) {
      let dark = 0, minX = 1e9, maxX = -1, rSum = 0, gSum = 0, bSum = 0, bgR = 0, bgG = 0, bgB = 0, bgN = 0;
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 3;
        const lum = img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114;
        if (lum < 120) { dark++; if (x < minX) minX = x; if (x > maxX) maxX = x; rSum += img[i]; gSum += img[i + 1]; bSum += img[i + 2]; }
        else { bgR += img[i]; bgG += img[i + 1]; bgB += img[i + 2]; bgN++; }
      }
      rows.push({ y, dark, minX, maxX, ink: dark ? [rSum / dark | 0, gSum / dark | 0, bSum / dark | 0] : null, bg: bgN ? [bgR / bgN | 0, bgG / bgN | 0, bgB / bgN | 0] : null });
    }
    console.log(`\n=== profile ${arg} ===`);
    let band = null; const bands = [];
    for (const r of rows) {
      if (r.dark > 2) { if (!band) band = { y0: r.y, y1: r.y, minX: r.minX, maxX: r.maxX, peak: r.dark }; else { band.y1 = r.y; band.minX = Math.min(band.minX, r.minX); band.maxX = Math.max(band.maxX, r.maxX); band.peak = Math.max(band.peak, r.dark); } }
      else if (band) { bands.push(band); band = null; }
    }
    if (band) bands.push(band);
    for (const b of bands) console.log(`band y=${b.y0}..${b.y1} (h=${b.y1 - b.y0 + 1}) x=${b.minX}..${b.maxX} (w=${b.maxX - b.minX}) peakdark=${b.peak}`);
    const inkRow = rows.find(r => r.ink);
    const bgRow = rows.find(r => r.bg && r.dark > 20);
    if (inkRow) console.log("sample ink color:", inkRow.ink);
    const bgs = rows.map(r => r.bg).filter(Boolean);
    if (bgs.length) console.log("bg color (avg):", [0, 1, 2].map(k => Math.round(bgs.reduce((s, c) => s + c[k], 0) / bgs.length)));
  }
}
if (mode === "ink") {
  // find dark-ink bounding boxes within regions given as x0,y0,x1,y1
  for (const arg of process.argv.slice(4)) {
    const [x0, y0, x1, y1] = arg.split(",").map(Number);
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, dark = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 3;
      const lum = img[i] * 0.299 + img[i + 1] * 0.587 + img[i + 2] * 0.114;
      if (lum < 110) { dark++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    console.log(`${arg} -> ink bbox (${minX},${minY})-(${maxX},${maxY}) darkpx=${dark}`);
  }
}

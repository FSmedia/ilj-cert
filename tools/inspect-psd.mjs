// Quick PSD inspector: header, resolution, layer names & bounds
import fs from "node:fs";

const file = process.argv[2] || new URL("./cert_template.psd", import.meta.url).pathname.replace(/^\//, "");
const buf = fs.readFileSync(file);

let p = 0;
const sig = buf.toString("ascii", 0, 4); p = 4;
const version = buf.readUInt16BE(p); p += 2;
p += 6; // reserved
const channels = buf.readUInt16BE(p); p += 2;
const height = buf.readUInt32BE(p); p += 4;
const width = buf.readUInt32BE(p); p += 4;
const depth = buf.readUInt16BE(p); p += 2;
const colorMode = buf.readUInt16BE(p); p += 2;

console.log({ sig, version, channels, width, height, depth, colorMode });

const colorModeNames = { 0: "Bitmap", 1: "Grayscale", 2: "Indexed", 3: "RGB", 4: "CMYK", 7: "Multichannel", 8: "Duotone", 9: "Lab" };
console.log("colorMode:", colorModeNames[colorMode] || colorMode);

// Color mode data
const cml = buf.readUInt32BE(p); p += 4 + cml;

// Image resources
const irl = buf.readUInt32BE(p); p += 4;
const irEnd = p + irl;
while (p < irEnd) {
  if (buf.toString("ascii", p, p + 4) !== "8BIM") break;
  p += 4;
  const id = buf.readUInt16BE(p); p += 2;
  const nameLen = buf[p]; p += 1;
  let name = buf.toString("ascii", p, p + nameLen); p += nameLen;
  if ((nameLen + 1) % 2 === 1) p += 1; // padded to even
  const size = buf.readUInt32BE(p); p += 4;
  if (id === 1005 && size >= 16) { // resolution info
    const hRes = buf.readUInt32BE(p) / 65536;
    const vRes = buf.readUInt32BE(p + 8) / 65536;
    console.log("Resolution:", hRes, "x", vRes, "dpi");
  }
  if (id === 1057) console.log("Has 'Maximise Compatibility' flag resource");
  if (id === 1039) console.log("ICC profile present, size", size);
  p += size + (size % 2);
}
p = irEnd;

// Layer & mask info
const lml = buf.readUInt32BE(p); p += 4;
const lmEnd = p + lml;
const liLen = buf.readUInt32BE(p); p += 4;
const layerCount = buf.readInt16BE(p); p += 2;
console.log("Layer count (negative = first alpha is transparency):", layerCount);

const n = Math.abs(layerCount);
const layers = [];
for (let i = 0; i < n; i++) {
  const top = buf.readInt32BE(p), left = buf.readInt32BE(p + 4), bottom = buf.readInt32BE(p + 8), right = buf.readInt32BE(p + 12);
  p += 16;
  const nCh = buf.readUInt16BE(p); p += 2;
  const chans = [];
  for (let c = 0; c < nCh; c++) {
    const id = buf.readInt16BE(p); const len = buf.readUInt32BE(p + 2);
    chans.push({ id, len }); p += 6;
  }
  const blendSig = buf.toString("ascii", p, p + 4); p += 4;
  const blend = buf.toString("ascii", p, p + 4); p += 4;
  const opacity = buf[p]; p += 1;
  const clipping = buf[p]; p += 1;
  const flags = buf[p]; p += 1;
  p += 1; // filler
  const extra = buf.readUInt32BE(p); p += 4;
  const extraEnd = p + extra;
  const maskLen = buf.readUInt32BE(p); p += 4 + maskLen;
  const brLen = buf.readUInt32BE(p); p += 4 + brLen;
  const nameLen2 = buf[p]; p += 1;
  let name = "";
  for (let k = 0; k < nameLen2; k++) name += String.fromCharCode(buf[p + k]); // UTF-16-ish pascal
  p += nameLen2;
  const pad = (4 - ((nameLen2 + 1) % 4)) % 4;
  p += pad;
  // Sub-identify text layers
  let textContent = null;
  while (p < extraEnd - 4) {
    const key = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32BE(p + 4);
    if (key === "TySh") {
      // skip parse, mark as text layer
      textContent = "<text layer>";
    }
    if (key === "luni" && size > 4) {
      const len = buf.readUInt32BE(p + 8);
      let s = "";
      for (let k = 0; k < len; k++) s += String.fromCharCode(buf.readUInt16BE(p + 12 + k * 2));
      textContent = s;
    }
    p += 8 + size + (size % 2);
  }
  p = extraEnd;
  layers.push({ name, unicode: textContent, top, left, bottom, right, w: right - left, h: bottom - top, blend, opacity, chans });
}

for (const l of layers) {
  console.log(
    `#${String(layers.indexOf(l)).padStart(2)} [${String(l.w)}x${String(l.h)} @ ${String(l.left)},${String(l.top)}] ` +
    `"${l.name}"${l.unicode ? " uni:" + l.unicode : ""} ${l.blend} op:${l.opacity}`
  );
}

// Skip channel image data to find composite offset
for (const l of layers) {
  for (const c of l.chans) {
    const comp = buf.readUInt16BE(p);
    if (comp === 0) p += c.len - 2;
    else if (comp === 1) {
      const rows = l.h;
      p += 2; // per-row byte counts are 2 bytes each (PSB uses 4)
      p += rows * 2;
      p += c.len - 2 - rows * 2;
    } else {
      p += c.len - 2;
    }
  }
}
console.log("Composite image data offset:", p, "of", buf.length);
console.log("Compression:", buf.readUInt16BE(p));

import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
let p = 0; const hits = [];
while (true) { p = buf.indexOf("TySh", p); if (p < 0) break; hits.push(p); p += 4; }
for (const h of hits) {
  const size = buf.readUInt32BE(h + 4);
  const raw = buf.subarray(h + 8, h + 8 + size);
  if (raw.length < 86) { console.log("TySh at", h, "too small"); continue; }
  const ver = raw.readUInt16BE(0), descVer = raw.readUInt32BE(2);
  const t = []; for (let k = 0; k < 6; k++) t.push(+raw.readDoubleBE(6 + k * 8).toFixed(2));
  const hScale = +raw.readDoubleBE(54).toFixed(3), vScale = +raw.readDoubleBE(62).toFixed(3);
  const fontSize = +raw.readDoubleBE(70).toFixed(1), tracking = +raw.readDoubleBE(78).toFixed(1);
  console.log(`\n=== TySh @ ${h} size=${size} ver=${ver} descVer=${descVer} ===`);
  console.log("transform:", t, "scale:", hScale, vScale, "fontSize:", fontSize, "tracking:", tracking);
  // dump all UTF-16BE strings
  const strs = [];
  for (let k = 86; k + 4 < raw.length; k += 2) {
    const cp = raw.readUInt16BE(k);
    if (cp >= 32 && cp < 127) {
      let s = "", j = k;
      while (j + 2 <= raw.length) { const c = raw.readUInt16BE(j); if (c < 32 || c >= 127) break; s += String.fromCharCode(c); j += 2; }
      if (s.length >= 2) strs.push(s);
      k = j;
    }
  }
  console.log("u16 strings:", JSON.stringify([...new Set(strs)].slice(0, 50)));
}

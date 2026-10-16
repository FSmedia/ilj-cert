// TTF metrics parser + solve font sizes from measured ink boxes
import fs from "node:fs";

function parseTTF(path) {
  const b = fs.readFileSync(path);
  const numTables = b.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    tables[b.toString("ascii", off, off + 4)] = { offset: b.readUInt32BE(off + 8), length: b.readUInt32BE(off + 12) };
  }
  const head = tables.head.offset;
  const upem = b.readUInt16BE(head + 18);
  const hhea = tables.hhea.offset;
  const ascender = b.readInt16BE(hhea + 4);
  const descender = b.readInt16BE(hhea + 6);
  const numH = b.readUInt16BE(hhea + 34);
  let capHeight = null;
  if (tables["OS/2"]) {
    const o = tables["OS/2"].offset;
    const ver = b.readUInt16BE(o);
    if (ver >= 2) capHeight = b.readInt16BE(o + 88);
  }
  const hmtx = tables.hmtx.offset;
  const adv = [];
  for (let i = 0; i < numH; i++) adv.push(b.readUInt16BE(hmtx + i * 4));
  const last = adv[adv.length - 1];
  while (adv.length < 40000) adv.push(last);
  // cmap format 4
  const cmap = tables.cmap.offset;
  const nSub = b.readUInt16BE(cmap + 2);
  let sub = 0;
  for (let i = 0; i < nSub; i++) {
    const rec = cmap + 4 + i * 8;
    const pid = b.readUInt16BE(rec), eid = b.readUInt16BE(rec + 2);
    if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) { sub = cmap + b.readUInt32BE(rec + 4); break; }
  }
  const format = b.readUInt16BE(sub);
  const mapFn = (cp) => {
    if (format === 4) {
      const segX2 = b.readUInt16BE(sub + 6);
      const seg = segX2 / 2;
      const endBase = sub + 14;
      const startBase = endBase + segX2 + 2;
      const deltaBase = startBase + segX2;
      const rangeBase = deltaBase + segX2;
      for (let s = 0; s < seg; s++) {
        const end = b.readUInt16BE(endBase + s * 2);
        if (cp <= end) {
          const start = b.readUInt16BE(startBase + s * 2);
          if (cp < start) return 0;
          const delta = b.readInt16BE(deltaBase + s * 2);
          const ro = b.readUInt16BE(rangeBase + s * 2);
          if (ro === 0) return (cp + delta) & 0xFFFF;
          const giAddr = rangeBase + s * 2 + ro + (cp - start) * 2;
          const gi = b.readUInt16BE(giAddr);
          return gi === 0 ? 0 : (gi + delta) & 0xFFFF;
        }
      }
      return 0;
    }
    if (format === 12) {
      const nGroups = b.readUInt32BE(sub + 12);
      for (let g = 0; g < nGroups; g++) {
        const o = sub + 16 + g * 12;
        const s = b.readUInt32BE(o), e = b.readUInt32BE(o + 4), so = b.readUInt32BE(o + 8);
        if (cp >= s && cp <= e) return so + (cp - s);
      }
      return 0;
    }
    return 0;
  };
  const widthOf = (text, size) => {
    let w = 0;
    for (const ch of text) w += adv[mapFn(ch.codePointAt(0))];
    return w * size / upem;
  };
  return { upem, ascender, descender, capHeight, widthOf };
}

const bell = parseTTF("C:/Windows/Fonts/BELL.TTF");
const arial = parseTTF("C:/Windows/Fonts/arial.ttf");
const cand = parseTTF("C:/Windows/Fonts/Candara.ttf");
console.log("Bell:", { upem: bell.upem, asc: bell.ascender, desc: bell.descender, cap: bell.capHeight });
console.log("Arial:", { upem: arial.upem, asc: arial.ascender, desc: arial.descender, cap: arial.capHeight });
console.log("Candara:", { upem: cand.upem, asc: cand.ascender, desc: cand.descender, cap: cand.capHeight });

// --- Name: solve size for width 1501 ("Adeniran Blessing Adeyemi") ---
const name = "Adeniran Blessing Adeyemi";
for (let s = 100; s <= 160; s += 2) {
  const w = bell.widthOf(name, s);
  if (Math.abs(w - 1501) < 40) console.log(`NAME size ${s} -> width ${w.toFixed(0)} capH ${(bell.capHeight * s / bell.upem).toFixed(0)}`);
}
// --- Body: solve size + wrap reproducing measured lines ---
const para1 = "Has successfully completed and met all the requirements for Ileoja Academy AI and Machine Learning certification program.";
const para2 = "Hereby declared an AI & MACHINE LEARNING SPECIALIST (Python, ML & Deep Learning)";
function wrap(text, size, maxW) {
  const words = text.split(" ");
  const lines = []; let cur = "";
  for (const wd of words) {
    const t = cur ? cur + " " + wd : wd;
    if (arial.widthOf(t, size) > maxW && cur) { lines.push(cur); cur = wd; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
console.log("\n-- body hypotheses (target lines: p1 2023/2146, p2 2064/1000) --");
for (let s = 46; s <= 84; s += 2) {
  for (let W = 1900; W <= 2400; W += 25) {
    const l1 = wrap(para1, s, W), l2 = wrap(para2, s, W);
    if (l1.length !== 2 || l2.length !== 2) continue;
    const w1 = l1.map(x => arial.widthOf(x, s)), w2 = l2.map(x => arial.widthOf(x, s));
    const err = Math.abs(w1[0] - 2023) + Math.abs(w1[1] - 2146) + Math.abs(w2[0] - 2064) + Math.abs(w2[1] - 1000);
    if (err < 90) console.log(`size=${s} W=${W} err=${err.toFixed(0)} p1[${w1.map(x => x.toFixed(0))}] p2[${w2.map(x => x.toFixed(0))}]`, JSON.stringify(l1), JSON.stringify(l2));
  }
}
// --- Date: "01/Oct/2026" Candara, ink w359 ---
console.log("\n-- date --");
for (let s = 40; s <= 90; s += 2) {
  const w = cand.widthOf("01/Oct/2026", s);
  if (Math.abs(w - 359) < 25) console.log(`DATE size ${s} -> ${w.toFixed(0)}`);
}
// --- Code: "#CERTIFICATION CODE:   CFT-4L7-P2N" Arial, ink w885 ---
console.log("\n-- code --");
for (let s = 20; s <= 60; s += 1) {
  const w = arial.widthOf("#CERTIFICATION CODE:   CFT-4L7-P2N", s);
  if (Math.abs(w - 885) < 30) console.log(`CODE size ${s} -> ${w.toFixed(0)} capH ${(arial.capHeight * s / arial.upem).toFixed(1)}`);
}

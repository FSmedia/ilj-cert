// Certificate rendering engine.
// Geometry below was measured pixel-by-pixel from the official Ileoja Academy
// PSD template (A4 landscape, 3508 x 2480 px @ 300 DPI). Do not change these
// values unless the official template changes.

export const CANVAS_W = 3508;
export const CANVAS_H = 2480;

// Font stacks: Bell MT / Candara are the exact fonts used in the PSD and are
// present on most Windows machines (Office/Windows). Elegant fallbacks are
// provided for machines without them.
export const FONTS = {
  name: '"Bell MT", "Playfair Display", Georgia, serif',
  body: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  date: 'Candara, "Segoe UI", Tahoma, sans-serif',
};

// Zones (measured from the template's own text layers):
//   Name layer ink box:  x 922..2423, y 1183..1308  (Bell MT, ink width 1501 for the sample name)
//   Body ink boxes:      line tops 1394 / 1480 (para 1), 1653 / 1740 (para 2)
//   Date ink box:        x 1158..1517, y 1994..2058 (Candara)
//   Code ink box:        x 260..1145,  y 2181..2220 (Swiss721/Helvetica)
const NAME = { cx: 1672.5, baseline: 1272, size: 133, maxWidth: 1590, color: "#121212" };
const BODY = {
  cx: 1753,
  size: 77,
  lineHeight: 89,
  wrapWidth: 2150,
  para1Baselines: [1451, 1540, 1629],
  para2Baselines: [1706, 1795, 1884],
  color: "#1c1c1c",
};
const DATE = { cx: 1337.5, baseline: 2038, size: 72, color: "#1c1c1c" };
const CODE = { left: 260, baseline: 2218, size: 47, color: "#121212" };

export const AWARD_DEFAULT =
  "Hereby declared an AI & MACHINE LEARNING SPECIALIST (Python, ML & Deep Learning)";
export const PATTERN_DEFAULT = "AI and Machine Learning";

export interface CertData {
  name: string;
  course: string;
  award: string;
  dateDisplay: string; // e.g. "01/Oct/2026"
  certNo: string; // e.g. ILJWD26001
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse many common date formats; returns template display form + year. */
export function parseDateAny(input: string): { display: string; year: number; yy: string } | null {
  const s = (input || "").trim();
  if (!s) return null;
  let d: Date | null = null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // 2026-10-01
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (!d) {
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // 01/10/2026
    if (m) {
      let yr = +m[3];
      if (yr < 100) yr += 2000;
      d = new Date(yr, +m[2] - 1, +m[1]);
    }
  }
  if (!d) {
    let m2 = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s\-/,]+(\d{2,4})$/);
    if (m2) {
      const mi = MONTHS.findIndex((x) => x.toLowerCase() === m2[2].slice(0, 3).toLowerCase());
      if (mi >= 0) {
        let yr = +m2[3];
        if (yr < 100) yr += 2000;
        d = new Date(yr, mi, +m2[1]);
      }
    }
  }
  if (!d) {
    let m2 = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
    if (m2) {
      const mi = MONTHS.findIndex((x) => x.toLowerCase() === m2[1].slice(0, 3).toLowerCase());
      if (mi >= 0) {
        let yr = +m2[3];
        if (yr < 100) yr += 2000;
        d = new Date(yr, mi, +m2[2]);
      }
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  return {
    display: `${dd}/${MONTHS[d.getMonth()]}/${d.getFullYear()}`,
    year: d.getFullYear(),
    yy: String(d.getFullYear() % 100).padStart(2, "0"),
  };
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Ensure canvas can use the intended fonts before drawing. */
export async function loadFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const fonts = (document as Document & { fonts: FontFaceSet }).fonts;
  try {
    await Promise.allSettled([
      fonts.load('133px "Bell MT"'),
      fonts.load('700 133px "Playfair Display"'),
      fonts.load('77px "Helvetica Neue"'),
      fonts.load("77px Arial"),
      fonts.load("72px Candara"),
      fonts.load('72px "Segoe UI"'),
    ]);
    await fonts.ready;
  } catch {
    /* ignore */
  }
}

/** Draw one certificate onto the context (background must already be drawn). */
export function drawCertificate(ctx: CanvasRenderingContext2D, data: CertData): void {
  // --- Candidate name (auto-shrinks for very long names) ---
  let nameSize = NAME.size;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = NAME.color;
  ctx.font = `${nameSize}px ${FONTS.name}`;
  const nameW = ctx.measureText(data.name).width;
  if (nameW > NAME.maxWidth) {
    nameSize = Math.max(64, Math.floor((nameSize * NAME.maxWidth) / nameW));
    ctx.font = `${nameSize}px ${FONTS.name}`;
  }
  ctx.fillText(data.name, NAME.cx, NAME.baseline);

  // --- Body: paragraph 1 (course) + paragraph 2 (award statement) ---
  ctx.fillStyle = BODY.color;
  ctx.font = `${BODY.size}px ${FONTS.body}`;
  const para1 = `Has successfully completed and met all the requirements for Ileoja Academy ${data.course || PATTERN_DEFAULT} certification program.`;
  const lines1 = wrapText(ctx, para1, BODY.wrapWidth);
  lines1.slice(0, 3).forEach((line, i) => ctx.fillText(line, BODY.cx, BODY.para1Baselines[i]));

  if (data.award) {
    ctx.font = `${BODY.size}px ${FONTS.body}`;
    const lines2 = wrapText(ctx, data.award, BODY.wrapWidth);
    lines2.slice(0, 3).forEach((line, i) => ctx.fillText(line, BODY.cx, BODY.para2Baselines[i]));
  }

  // --- Issue date ---
  ctx.fillStyle = DATE.color;
  ctx.font = `${DATE.size}px ${FONTS.date}`;
  ctx.fillText(data.dateDisplay, DATE.cx, DATE.baseline);

  // --- Certification number ---
  ctx.fillStyle = CODE.color;
  ctx.font = `${CODE.size}px ${FONTS.body}`;
  ctx.textAlign = "left";
  ctx.fillText(`#CERTIFICATION CODE:   ${data.certNo}`, CODE.left, CODE.baseline);
}

/** Render a full certificate (background + text) onto a canvas. */
export function renderCertificate(
  canvas: HTMLCanvasElement,
  bg: HTMLImageElement | HTMLCanvasElement,
  data: CertData
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.drawImage(bg, 0, 0, CANVAS_W, CANVAS_H);
  drawCertificate(ctx, data);
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png")
  );
}

export async function canvasToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const jpeg = canvas.toDataURL("image/jpeg", 0.95);
  pdf.addImage(jpeg, "JPEG", 0, 0, 297, 210, undefined, "FAST");
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function slugify(s: string): string {
  return (s || "certificate")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "certificate";
}

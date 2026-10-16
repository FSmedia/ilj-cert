"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AWARD_DEFAULT,
  CANVAS_H,
  CANVAS_W,
  CertData,
  canvasToPdfBlob,
  canvasToPngBlob,
  downloadBlob,
  loadFonts,
  parseDateAny,
  renderCertificate,
  slugify,
} from "@/lib/certificate";
import { deriveCode, lastSerialFor, loadSerialStore, makeCertNo, normalizeCode, saveSerialStore } from "@/lib/serials";

interface BatchRow {
  name: string;
  course: string;
  date: string;
  award?: string;
  codeOverride?: string;
}

interface PreparedRow extends BatchRow {
  code: string;
  yy: string;
  serial: number;
  certNo: string;
  dateDisplay: string;
  error?: string;
}

type BulkFormat = "pdf" | "png" | "both";

export default function Studio() {
  return (
    <>
      <header className="topbar">
        <div className="title">
          Ileoja Academy <span className="badge">CERTIFICATE GENERATOR</span>
        </div>
        <div className="right">
          <span>Admin Session</span>
          <button
            className="btn small ghost"
            style={{ background: "transparent", color: "#fff", borderColor: "#3a3a3a" }}
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="container">
        <Tabs />
      </main>
    </>
  );
}

function Tabs() {
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const bg = useBackground();
  return (
    <>
      <div className="tabs">
        <button className={tab === "single" ? "active" : ""} onClick={() => setTab("single")}>
          Single Certificate
        </button>
        <button className={tab === "bulk" ? "active" : ""} onClick={() => setTab("bulk")}>
          Bulk Generation
        </button>
      </div>
      {tab === "single" ? <SingleTab bg={bg} /> : <BulkTab bg={bg} />}
    </>
  );
}

/* ---------------- background loading ---------------- */

function useBackground() {
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = async () => {
      await loadFonts();
      if (!cancelled) setBg(img);
    };
    img.src = "/background.png";
    return () => {
      cancelled = true;
    };
  }, []);
  return bg;
}

/* ---------------- single certificate ---------------- */

function SingleTab({ bg }: { bg: HTMLImageElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [award, setAward] = useState(AWARD_DEFAULT);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<"" | "png" | "pdf">("");

  const parsedDate = useMemo(() => parseDateAny(dateStr), [dateStr]);
  const code = useMemo(() => normalizeCode(codeTouched ? courseCode : deriveCode(course)), [course, courseCode, codeTouched]);

  // Live serial preview (next available for this course+year)
  const yy = parsedDate?.yy ?? String(new Date().getFullYear() % 100).padStart(2, "0");
  const [serialStore, setSerialStore] = useState<Record<string, number>>({});
  useEffect(() => setSerialStore(loadSerialStore()), []);
  const nextSerial = lastSerialFor(serialStore, code, yy) + 1;
  const certNo = makeCertNo(code, yy, nextSerial);

  const data: CertData | null =
    name.trim() && parsedDate
      ? { name: name.trim(), course: course.trim(), award: award.trim(), dateDisplay: parsedDate.display, certNo }
      : null;

  // Draw preview
  useEffect(() => {
    if (!bg) return;
    if (!offscreenRef.current) {
      const c = document.createElement("canvas");
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      offscreenRef.current = c;
    }
    const off = offscreenRef.current;
    const ctx = off.getContext("2d")!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(bg, 0, 0, CANVAS_W, CANVAS_H);
    if (data) renderCertificate(off, bg, data);

    const view = canvasRef.current;
    if (view) {
      const vctx = view.getContext("2d");
      vctx?.clearRect(0, 0, CANVAS_W, CANVAS_H);
      vctx?.drawImage(off, 0, 0);
    }
  }, [bg, data]);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3500);
  }

  async function download(kind: "png" | "pdf") {
    if (!offscreenRef.current || !data) return;
    setBusy(kind);
    try {
      await loadFonts();
      // re-render with fonts fully loaded for crisp text
      renderCertificate(offscreenRef.current, bg!, data);
      const blob = kind === "png" ? await canvasToPngBlob(offscreenRef.current) : await canvasToPdfBlob(offscreenRef.current);
      downloadBlob(blob, `${data.certNo}_${slugify(data.name)}.${kind}`);
      // advance serial store
      const store = loadSerialStore();
      store[`${code}${yy}`] = nextSerial;
      saveSerialStore(store);
      setSerialStore({ ...store });
      showToast(`Downloaded ${data.certNo}`);
    } catch (e) {
      showToast(`Generation failed: ${(e as Error).message}`, true);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>Candidate Details</h2>
        <div className="field">
          <label>Candidate Full Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Adeniran Blessing Adeyemi" />
        </div>
        <div className="field">
          <label>Course Title</label>
          <input type="text" value={course} onChange={(e) => { setCourse(e.target.value); if (!codeTouched) setCourseCode(""); }} placeholder="e.g. AI and Machine Learning" />
        </div>
        <div className="field">
          <label>Completion Date</label>
          <input type="date" value={dateStr.includes("/") ? "" : dateStr} onChange={(e) => setDateStr(e.target.value)} />
          <div className="hint">
            Displayed as <span className="mono">{parsedDate?.display ?? "DD/Mon/YYYY"}</span>
          </div>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label>Course Code</label>
            <input
              type="text"
              value={codeTouched ? courseCode : code}
              onChange={(e) => { setCodeTouched(true); setCourseCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)); }}
              placeholder="auto"
            />
            <div className="hint">Auto-derived from the course title.</div>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label>Certification Number</label>
            <div style={{ paddingTop: 11 }}>
              <span className="pill gold">{certNo}</span>
            </div>
            <div className="hint">
              Next serial <span className="mono">{String(nextSerial).padStart(3, "0")}</span> for {code}/{yy}.
            </div>
          </div>
        </div>

        <details className="adv">
          <summary>Advanced — award statement (second paragraph)</summary>
          <div className="inner field">
            <label>Award / Specialist Statement</label>
            <textarea value={award} onChange={(e) => setAward(e.target.value)} style={{ minHeight: 80 }} />
            <div className="hint">Pre-filled with the official template wording. Edit only if a different programme requires it.</div>
          </div>
        </details>

        <div className="sep" />
        <div className="row">
          <button className="btn gold" disabled={!data || busy !== "" || !bg} onClick={() => download("pdf")}>
            {busy === "pdf" ? <span className="spinner" /> : null} Download PDF
          </button>
          <button className="btn" disabled={!data || busy !== "" || !bg} onClick={() => download("png")}>
            {busy === "png" ? <span className="spinner" /> : null} Download PNG
          </button>
        </div>
        {!bg ? <div className="hint" style={{ marginTop: 10 }}>Loading template…</div> : null}
        {toast ? <div className={`toast${toast.error ? " error" : ""}`}>{toast.msg}</div> : null}
      </section>

      <section className="panel">
        <h2>Live Preview</h2>
        <div className="cert-preview">
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Rendered at full template resolution (3508 × 2480 px, A4 landscape @ 300 DPI) using the exact layout from the official Ileoja Academy PSD.
        </div>
      </section>
    </div>
  );
}

/* ---------------- bulk ---------------- */

function parseBatch(text: string): BatchRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  let start = 0;
  const first = lines[0].toLowerCase();
  let cols: Record<string, number> | null = null;
  if (/name/.test(first) && /(course|program)/.test(first)) {
    const heads = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    cols = {
      name: heads.findIndex((h) => /name/.test(h)),
      course: heads.findIndex((h) => /(course|program)/.test(h)),
      date: heads.findIndex((h) => /(date|year)/.test(h)),
      award: heads.findIndex((h) => /(award|speciali|statement|declaration)/.test(h)),
    };
    start = 1;
  }
  const rows: BatchRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].includes("|") ? lines[i].split("|").map((s) => s.trim()) : splitCsvLine(lines[i]).map((s) => s.trim());
    if (cols) {
      rows.push({
        name: parts[cols.name] ?? "",
        course: parts[cols.course] ?? "",
        date: parts[cols.date] ?? "",
        award: cols.award >= 0 ? parts[cols.award] : undefined,
      });
    } else {
      rows.push({ name: parts[0] ?? "", course: parts[1] ?? "", date: parts[2] ?? "" });
    }
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function BulkTab({ bg }: { bg: HTMLImageElement | null }) {
  const [mode, setMode] = useState<"paste" | "csv">("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [format, setFormat] = useState<BulkFormat>("pdf");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [serialStore, setSerialStore] = useState<Record<string, number>>({});
  const [serialEdits, setSerialEdits] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => setSerialStore(loadSerialStore()), []);

  useEffect(() => {
    setRows(parseBatch(text));
  }, [text]);

  // Prepare rows with codes/serials
  const prepared: PreparedRow[] = useMemo(() => {
    const counters: Record<string, number> = {};
    const init = (code: string, yy: string) => {
      const key = `${code}${yy}`;
      if (!(key in counters)) {
        const base = serialEdits[key] ?? lastSerialFor(serialStore, code, yy);
        counters[key] = base;
      }
      return key;
    };
    return rows.map((r) => {
      const pd = parseDateAny(r.date);
      const code = normalizeCode(r.codeOverride || deriveCode(r.course || ""));
      const yy = pd?.yy ?? String(new Date().getFullYear() % 100).padStart(2, "0");
      const key = init(code, yy);
      const error =
        !r.name.trim() ? "Missing name" : !r.course.trim() ? "Missing course" : !pd ? "Unrecognised date" : undefined;
      if (error) return { ...r, code, yy, serial: 0, certNo: "—", dateDisplay: r.date, error };
      const serial = ++counters[key];
      return { ...r, code, yy, serial, certNo: makeCertNo(code, yy, serial), dateDisplay: pd!.display };
    });
  }, [rows, serialStore, serialEdits]);

  const valid = prepared.filter((r) => !r.error);
  const byKey = useMemo(() => {
    const m: Record<string, { code: string; yy: string; next: number }> = {};
    for (const r of valid) {
      const key = `${r.code}${r.yy}`;
      if (!m[key]) {
        const base = serialEdits[key] ?? lastSerialFor(serialStore, r.code, r.yy);
        m[key] = { code: r.code, yy: r.yy, next: base + 1 };
      }
    }
    return m;
  }, [valid, serialStore, serialEdits]);

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 4000);
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function generateZip() {
    if (!bg || !valid.length) return;
    if (!offscreenRef.current) {
      const c = document.createElement("canvas");
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      offscreenRef.current = c;
    }
    const off = offscreenRef.current;
    setProgress({ done: 0, total: valid.length });
    try {
      await loadFonts();
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const manifest: string[] = ["Ileoja Academy — generated certificates", ""];
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i];
        const data: CertData = {
          name: r.name.trim(),
          course: r.course.trim(),
          award: (r.award ?? AWARD_DEFAULT).trim(),
          dateDisplay: r.dateDisplay,
          certNo: r.certNo,
        };
        renderCertificate(off, bg, data);
        const base = `${r.certNo}_${slugify(r.name)}`;
        if (format === "pdf" || format === "both") zip.file(`${base}.pdf`, await canvasToPdfBlob(off));
        if (format === "png" || format === "both") zip.file(`${base}.png`, await canvasToPngBlob(off));
        manifest.push(`${r.certNo}  ${r.name}  —  ${r.course}  —  ${r.dateDisplay}`);
        setProgress({ done: i + 1, total: valid.length });
        // let the UI breathe between renders
        await new Promise((res) => setTimeout(res, 0));
      }
      zip.file("certificates.txt", manifest.join("\n"));
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      downloadBlob(blob, `ileoja-certificates-${Date.now()}.zip`);

      // persist advanced serials
      const store = loadSerialStore();
      for (const r of valid) {
        const key = `${r.code}${r.yy}`;
        store[key] = Math.max(store[key] ?? 0, r.serial);
      }
      saveSerialStore(store);
      setSerialStore({ ...store });
      setSerialEdits({});
      showToast(`Packaged ${valid.length} certificates into a .zip`);
    } catch (e) {
      showToast(`Bulk generation failed: ${(e as Error).message}`, true);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <section className="panel">
        <h2>1 · Add Candidates</h2>
        <div className="tabs" style={{ marginBottom: 14 }}>
          <button className={mode === "paste" ? "active" : ""} onClick={() => setMode("paste")}>Paste Text</button>
          <button className={mode === "csv" ? "active" : ""} onClick={() => setMode("csv")}>Upload CSV</button>
        </div>

        {mode === "paste" ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"One candidate per line:\n\nAdeniran Blessing Adeyemi | AI and Machine Learning | 01/Oct/2026\nJohn Doe | Web Development | 2026-09-15"}
            />
            <div className="hint">
              Separate with <span className="mono">|</span> or commas: <span className="mono">Name, Course, Date</span>. An optional CSV header row and a 4th
              column for a custom award statement are also supported.
            </div>
          </>
        ) : (
          <>
            <div
              className="drop"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
            >
              {text ? "✔ File loaded — click to replace" : "Drag & drop a .csv file here, or click to browse"}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </div>
            <div className="hint">
              Expected columns: <span className="mono">Name, Course, Date</span> (optional: <span className="mono">Award</span>). Example:
            </div>
            <pre className="mono hint" style={{ whiteSpace: "pre-wrap", background: "#f7f5f0", padding: 10, borderRadius: 8 }}>
{`Name,Course,Date
Adeniran Blessing Adeyemi,AI and Machine Learning,01/Oct/2026
John Doe,Web Development,15/09/2026`}
            </pre>
          </>
        )}

        <div className="sep" />
        <h2>2 · Serial Numbering</h2>
        <div className="hint" style={{ marginBottom: 8 }}>
          Format: <span className="mono">ILJ[COURSE_CODE][YY][SERIAL]</span> — e.g. ILJWD26001. Counters persist in this browser and auto-increment per course
          and year. Override the starting serial per group below if needed:
        </div>
        {Object.keys(byKey).length ? (
          <table className="data">
            <thead>
              <tr><th>Group</th><th>Next serial</th></tr>
            </thead>
            <tbody>
              {Object.entries(byKey).map(([key, g]) => (
                <tr key={key}>
                  <td className="mono">{g.code}/{g.yy}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      style={{ width: 110 }}
                      value={serialEdits[key] ?? lastSerialFor(serialStore, g.code, g.yy) + 1}
                      onChange={(e) => setSerialEdits({ ...serialEdits, [key]: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="hint">Add candidates above to preview serial assignment.</div>
        )}
      </section>

      <section className="panel">
        <h2>3 · Preview & Generate</h2>
        {!bg ? (
          <div className="hint">Loading template…</div>
        ) : rows.length === 0 ? (
          <div className="hint">No candidates yet.</div>
        ) : (
          <>
            <div className="row between" style={{ marginBottom: 10 }}>
              <span>
                <span className="pill">{valid.length} ready</span>{" "}
                {prepared.length - valid.length > 0 ? <span className="pill" style={{ background: "#fbeaea", color: "var(--danger)", borderColor: "#efcfcf" }}>{prepared.length - valid.length} with issues</span> : null}
              </span>
              <span className="row">
                <select value={format} onChange={(e) => setFormat(e.target.value as BulkFormat)} style={{ width: 130 }}>
                  <option value="pdf">PDF only</option>
                  <option value="png">PNG only</option>
                  <option value="both">PDF + PNG</option>
                </select>
                <button className="btn gold" disabled={!valid.length || !!progress} onClick={generateZip}>
                  {progress ? <span className="spinner" /> : null} Generate .zip
                </button>
              </span>
            </div>
            {progress ? (
              <div style={{ marginBottom: 10 }}>
                <div className="progress">
                  <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                </div>
                <div className="hint">
                  Rendering {progress.done}/{progress.total}…
                </div>
              </div>
            ) : null}
            <div style={{ maxHeight: 560, overflow: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Course</th>
                    <th>Date</th>
                    <th>Cert No.</th>
                  </tr>
                </thead>
                <tbody>
                  {prepared.map((r, i) => (
                    <tr key={i} className={r.error ? "invalid" : ""}>
                      <td>{i + 1}</td>
                      <td>{r.name || <em style={{ color: "var(--danger)" }}>missing</em>}</td>
                      <td>{r.course || <em style={{ color: "var(--danger)" }}>missing</em>}</td>
                      <td>{r.dateDisplay || "—"}</td>
                      <td className="mono">{r.error ? <span style={{ color: "var(--danger)" }}>{r.error}</span> : r.certNo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {toast ? <div className={`toast${toast.error ? " error" : ""}`}>{toast.msg}</div> : null}
      </section>
    </div>
  );
}

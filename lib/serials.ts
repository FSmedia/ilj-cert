// Course code derivation + persistent serial counters (localStorage).

const STOPWORDS = new Set(["AND", "OF", "THE", "FOR", "IN", "A", "AN", "AT", "ON", "TO", "IS"]);

/** Derive a short course code from a course title, e.g. "Web Development" -> "WD". */
export function deriveCode(title: string): string {
  const words = (title || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const significant = words.filter((w) => !STOPWORDS.has(w));
  let code = (significant.length ? significant : words).map((w) => w[0]).join("").slice(0, 3);
  if (!code) code = (title || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3);
  return code || "CRS";
}

export function normalizeCode(code: string): string {
  return (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "CRS";
}

/** Certification number: ILJ[COURSE_CODE][YY][SERIAL] with no dashes. */
export function makeCertNo(code: string, yy: string, serial: number): string {
  return `ILJ${code}${yy}${String(serial).padStart(3, "0")}`;
}

const STORAGE_KEY = "ilj-serials-v1";

export function loadSerialStore(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function saveSerialStore(store: Record<string, number>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable */
  }
}

export function lastSerialFor(store: Record<string, number>, code: string, yy: string): number {
  return store[`${code}${yy}`] ?? 0;
}

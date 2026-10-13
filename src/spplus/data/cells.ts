import type { Cell } from "./snapshotTypes";

export const raw = (c: Cell): Cell => (c && typeof c === "object" && "f" in c ? c.v : c);
export const isFormula = (c: Cell): c is { f: string; v: Cell } => !!c && typeof c === "object" && "f" in c;
export const num = (c: Cell): number | null => {
  const v = raw(c);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
export const str = (c: Cell): string | null => {
  const v = raw(c);
  if (v && typeof v === "object" && "link" in v) return v.t.trim() || null;
  return typeof v === "string" ? v.trim() || null : null;
};
export const dateOf = (c: Cell): string | null => {
  const v = raw(c);
  return v && typeof v === "object" && "d" in v ? v.d : null;
};
export const timeOf = (c: Cell): string | null => {
  const v = raw(c);
  return v && typeof v === "object" && "tm" in v ? v.tm : null;
};

/** The cell as source text (what the sheet holds), for the explorer. */
export function cellText(c: Cell): string {
  const v = raw(c);
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "string") return v;
  if ("d" in v) return v.d;
  if ("tm" in v) return v.tm;
  if ("e" in v) return v.e;
  if ("link" in v) return v.t;
  return "";
}

export interface RecordInfo {
  text: string;
  /** True when the sheet stored a date (Sheets turned "5-1" into May 1) and the record was read back from it. */
  recovered: boolean;
  sourceDate?: string;
}

/** Records typed as W-L can be turned into dates by Sheets; read them back as month = wins, day = losses. */
export function recordOf(c: Cell): RecordInfo | null {
  const v = raw(c);
  if (v == null) return null;
  if (typeof v === "string") return { text: v.trim(), recovered: false };
  if (typeof v === "object" && "d" in v) {
    const [, m, d] = v.d.split("-").map(Number);
    return { text: `${m}-${d}`, recovered: true, sourceDate: v.d };
  }
  return { text: String(v), recovered: false };
}

export function parseRecord(text: string | null | undefined): { w: number; l: number; t: number } | null {
  const m = /^(\d+)-(\d+)(?:-(\d+))?$/.exec(text ?? "");
  return m ? { w: +m[1], l: +m[2], t: m[3] ? +m[3] : 0 } : null;
}

export const colLetter = (i: number): string => {
  let n = i + 1, s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

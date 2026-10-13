/** One stored cell: a plain value, or a tagged date / time / formula / error. Empty cells are null. */
export type Cell = null | string | number | boolean | { d: string } | { tm: string } | { e: string } | { link: string; t: string } | { f: string; v: Cell };

export interface SheetSnapshot {
  name: string;
  /** Row-major, trimmed to the used range. rows[0] is sheet row 1, rows[0][0] is column A. */
  rows: Cell[][];
  /** 1-based sheet rows that are hidden in the source sheet. */
  hiddenRows: number[];
  hiddenCols: number[];
}

export interface Snapshot {
  version: 1;
  source: { id: string; title: string; url: string; method: string; methodLabel: string };
  fetchedAt: string;
  sheets: SheetSnapshot[];
}

export interface RefreshStatus {
  state: "idle" | "loading" | "ok" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  method: string | null;
}

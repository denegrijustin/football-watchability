import type { SheetSnapshot } from "./snapshotTypes";

export interface Block { from: number; to: number; headerRow: number }

/** Side-by-side tables in one tab are separated by an empty column. */
export function blocksOf(sh: SheetSnapshot): Block[] {
  const width = Math.max(0, ...sh.rows.map((r) => r.length));
  const used = Array.from({ length: width }, (_, c) => sh.rows.some((r) => r[c] != null));
  const out: Block[] = [];
  let start = -1;
  for (let c = 0; c <= width; c++) {
    if (used[c] && start < 0) start = c;
    if ((!used[c] || c === width) && start >= 0) { out.push({ from: start, to: c - 1, headerRow: 0 }); start = -1; }
  }
  return out;
}


import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

export interface Col<R> {
  key: string;
  label: string;
  title?: string;
  align?: "r";
  /** Sort value; null sorts last. */
  get: (r: R) => number | string | null;
  render?: (r: R) => ReactNode;
  /** Default direction when first sorted. */
  first?: "asc" | "desc";
  hideSm?: boolean;
}

export function SortTable<R>({ cols, rows, rowKey, expand, selected, sort: ctl, label, onRowClick, max, phoneLine }: {
  cols: Col<R>[]; rows: R[]; rowKey: (r: R) => string; expand?: (r: R) => ReactNode; selected?: string | null;
  sort?: { key: string; dir: "asc" | "desc"; set: (key: string, dir: "asc" | "desc") => void };
  label: string; onRowClick?: (r: R) => void; max?: number;
  /** A line under each row, on a phone only, for what the hidden columns held. */
  phoneLine?: (r: R) => ReactNode;
}) {
  const [local, setLocal] = useState<{ key: string; dir: "asc" | "desc" }>({ key: cols[0].key, dir: cols[0].first ?? "asc" });
  const sort = ctl ?? { ...local, set: (key: string, dir: "asc" | "desc") => setLocal({ key, dir }) };
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Columns marked hideSm are hidden on narrow screens; the detail row spans only the ones that remain, or the extra span widens the table.
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(max-width: 560px)").matches);
  useEffect(() => {
    const mq = matchMedia("(max-width: 560px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const col = cols.find((c) => c.key === sort.key) ?? cols[0];
  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.map((r, i) => ({ r, i, v: col.get(r) })).sort((a, b) => {
      if (a.v == null && b.v == null) return a.i - b.i;
      if (a.v == null) return 1;
      if (b.v == null) return -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return c === 0 ? a.i - b.i : c * dir;
    }).map((x) => x.r);
  }, [rows, col, sort.dir]);
  const shown = max ? sorted.slice(0, max) : sorted;
  const click = (c: Col<R>) => sort.set(c.key, c.key === sort.key ? (sort.dir === "asc" ? "desc" : "asc") : c.first ?? "asc");
  return (
    <div className="tbl-wrap" role="region" aria-label={label} tabIndex={0}>
      <table className="tbl">
        <thead>
          <tr>
            {expand && <th style={{ width: 30 }}><span className="sr-only">Details</span></th>}
            {cols.map((c) => (
              <th key={c.key} className={`${c.align ?? ""}${c.hideSm ? " hide-sm" : ""}`} title={c.title} aria-sort={c.key === sort.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => click(c)}>{c.label}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const k = rowKey(r);
            const isOpen = open.has(k);
            return (
              <Fragment key={k}>
                <tr className={selected === k ? "sel" : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined} style={onRowClick ? { cursor: "pointer" } : undefined}>
                  {expand && (
                    <td>
                      <button type="button" className="exp-btn" aria-expanded={isOpen} aria-label={isOpen ? "Hide details" : "Show details"} onClick={(e) => { e.stopPropagation(); setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }}>{isOpen ? "▾" : "▸"}</button>
                    </td>
                  )}
                  {cols.map((c) => <td key={c.key} className={`${c.align ?? ""} ${c.align ? "num" : ""}${c.hideSm ? " hide-sm" : ""}`}>{c.render ? c.render(r) : (c.get(r) ?? "—")}</td>)}
                </tr>
                {phoneLine && <tr className={`phone-line${selected === k ? " sel" : ""}`} onClick={onRowClick ? () => onRowClick(r) : undefined}><td colSpan={cols.filter((c) => !c.hideSm).length + (expand ? 1 : 0)}>{phoneLine(r)}</td></tr>}
                {expand && isOpen && <tr className="detail"><td colSpan={cols.filter((c) => !(narrow && c.hideSm)).length + 1}>{expand(r)}</td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {max && sorted.length > max && <p className="sub" style={{ padding: "6px 8px" }}>Showing {max} of {sorted.length}.</p>}
    </div>
  );
}

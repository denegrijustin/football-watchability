import { Fragment, useMemo, useState } from "react";
import { useData } from "../data/useData";
import { useRoute } from "../store";
import type { Cell, SheetSnapshot } from "../data/snapshotTypes";
import { blocksOf } from "../data/blocks";
import { sourceChecks } from "../data/checks";
import { cellText, colLetter, isFormula, num, raw, recordOf, str } from "../data/cells";

const groupOf = (name: string) => {
  if (name === "SP+ performance" || name === "POSTGAME WIN EXPECTANCY") return "Season tabs";
  const m = /^(TOP 772|FBS|FCS|D2|D3|NAIA)\s+WEEK\s+(\d+)$/i.exec(name);
  return m ? `${m[1] === "TOP 772" ? "TOP 772" : m[1]}` : "Other";
};

function display(c: Cell, recHeader: boolean, readRecords: boolean): { text: string; title?: string; formula?: string; kind: string } {
  const f = isFormula(c) ? c.f : undefined;
  const v = raw(c);
  if (recHeader && readRecords && v && typeof v === "object" && "d" in v) { const r = recordOf(c)!; return { text: `${r.text}*`, title: `Stored as the date ${r.sourceDate}; read back as ${r.text}`, formula: f, kind: "date→record" }; }
  const kind = v == null ? "empty" : typeof v === "number" ? "number" : typeof v === "string" ? "text" : typeof v === "boolean" ? "boolean" : "d" in v ? "date" : "tm" in v ? "time" : "link" in v ? "link" : "error";
  return { text: cellText(c), formula: f, kind };
}

export default function Explorer() {
  const { snapshot, model } = useData();
  const [route, nav] = useRoute();
  const [limit, setLimit] = useState(250);
  const [readRecords, setReadRecords] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!snapshot) return null;
  const sheets = snapshot.sheets;
  const name = route.p.sheet && sheets.some((s) => s.name === route.p.sheet) ? route.p.sheet : sheets[0].name;
  const sh = sheets.find((s) => s.name === name)!;
  const blocks = useMemo(() => blocksOf(sh), [sh]);
  const bi = Math.min(Number(route.p.block ?? 0) || 0, blocks.length - 1);
  const blk = blocks[bi];
  const search = (route.p.find ?? "").toLowerCase();
  const sortCol = route.p.col != null ? Number(route.p.col) : null;
  const sortDir = route.p.dir === "desc" ? "desc" : "asc";

  const totals = useMemo(() => {
    let cells = 0, formulas = 0;
    for (const s of sheets) for (const r of s.rows) for (const c of r) if (c != null) { cells++; if (isFormula(c)) formulas++; }
    return { cells, formulas };
  }, [sheets]);
  const sheetStat = useMemo(() => {
    let cells = 0, formulas = 0;
    for (const r of sh.rows) for (const c of r) if (c != null) { cells++; if (isFormula(c)) formulas++; }
    return { cells, formulas, rows: sh.rows.length, cols: Math.max(0, ...sh.rows.map((r) => r.length)) };
  }, [sh]);

  const cols = blk ? Array.from({ length: blk.to - blk.from + 1 }, (_, i) => blk.from + i) : [];
  const headerOf = (c: number) => str(sh.rows[0]?.[c] ?? null) ?? "";
  const rows = useMemo(() => {
    if (!blk) return [] as number[];
    let list = sh.rows.map((_, i) => i).filter((i) => i > 0 && cols.some((c) => sh.rows[i][c] != null));
    if (search) list = list.filter((i) => cols.some((c) => cellText(sh.rows[i][c] ?? null).toLowerCase().includes(search)));
    if (sortCol != null) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const A = sh.rows[a][sortCol] ?? null, B = sh.rows[b][sortCol] ?? null;
        const an = num(A), bn = num(B);
        if (A == null && B == null) return a - b;
        if (A == null) return 1;
        if (B == null) return -1;
        const c = an != null && bn != null ? an - bn : cellText(A).localeCompare(cellText(B));
        return c === 0 ? a - b : c * dir;
      });
    }
    return list;
  }, [sh, blk, search, sortCol, sortDir]);
  const grouped = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const s of sheets) { const k = groupOf(s.name); g.set(k, [...(g.get(k) ?? []), s.name]); }
    return [...g.entries()];
  }, [sheets]);
  const sortable = name !== "SP+ performance";
  const checks = useMemo(() => (model ? sourceChecks(model) : []), [model]);

  const setSheet = (n: string) => { setLimit(250); setOpen(new Set()); nav({ p: { sheet: n === sheets[0].name ? null : n, block: null, col: null, dir: null, find: null } }, { replace: true }); };

  return (
    <div className="stack">
      <div className="panel">
        <div className="phead">
          <div><h2>Every tab and cell</h2><p className="sub" style={{ margin: 0 }}>{sheets.length} tabs · {totals.cells.toLocaleString()} filled cells · {totals.formulas.toLocaleString()} formulas · values shown as the sheet stores them</p></div>
        </div>
        <div className="filters" style={{ padding: 0 }}>
          <label className="field"><span>Tab</span>
            <select className="ctl" style={{ maxWidth: 260 }} value={name} onChange={(e) => setSheet(e.target.value)}>
              {grouped.map(([g, names]) => <optgroup key={g} label={g}>{names.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup>)}
            </select>
          </label>
          {blocks.length > 1 && (
            <div className="field"><span>Table in tab</span>
              <div className="seg" role="group" aria-label="Table in this tab">
                {blocks.map((b, i) => <button key={i} type="button" aria-pressed={i === bi} onClick={() => nav({ p: { block: i ? String(i) : null, col: null, dir: null } }, { replace: true })}>{colLetter(b.from)}–{colLetter(b.to)}</button>)}
              </div>
            </div>
          )}
          <label className="field"><span>Find in table</span><input className="ctl" type="search" value={route.p.find ?? ""} onChange={(e) => nav({ p: { find: e.target.value || null } }, { replace: true })} placeholder="Any value" /></label>
          <div className="field"><span>Records stored as dates</span>
            <button type="button" className={`btn${readRecords ? " on" : ""}`} aria-pressed={readRecords} onClick={() => setReadRecords(!readRecords)}>{readRecords ? "Read back as W-L" : "Shown as stored"}</button>
          </div>
        </div>
        {checks.length > 0 && (
          <details className="vals">
            <summary>Where the sheet disagrees with itself ({checks.length})</summary>
            <ul className="notes">{checks.map((c) => <li key={c.id}>{c.label}: {c.detail}.</li>)}</ul>
          </details>
        )}
        <p className="sub" style={{ marginTop: 8 }}>
          {name}: {sheetStat.rows} rows × {sheetStat.cols} columns, {sheetStat.cells.toLocaleString()} filled cells{sheetStat.formulas ? `, ${sheetStat.formulas} formulas` : ""}
          {sh.hiddenRows.length ? ` · hidden rows in the source: ${sh.hiddenRows.join(", ")}` : ""}
          {!sortable ? " · stacked tables: shown in sheet order" : ""} · {rows.length} {search ? "matching " : ""}data rows
        </p>
        {!blk ? <p className="empty">This tab is empty.</p> : !sortable ? (
          <RawGrid sh={sh} readRecords={readRecords} />
        ) : (
          <div className="tbl-wrap" role="region" aria-label={`${name} cells`} tabIndex={0} style={{ maxHeight: "70vh" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 30 }}><span className="sr-only">Details</span></th>
                  <th className="r">Row</th>
                  {cols.map((c) => (
                    <th key={c} aria-sort={sortCol === c ? (sortDir === "asc" ? "ascending" : "descending") : "none"} title={`Column ${colLetter(c)}`}>
                      <button type="button" onClick={() => nav({ p: { col: String(c), dir: sortCol === c && sortDir === "asc" ? "desc" : "asc" } }, { replace: true })}>
                        <span className="muted">{colLetter(c)} </span>{headerOf(c) || "(blank header)"}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((ri) => {
                  const k = `${name}:${ri}`;
                  const isOpen = open.has(k);
                  return (
                    <Fragment key={k}>
                      <tr>
                        <td><button type="button" className="exp-btn" aria-expanded={isOpen} aria-label={isOpen ? "Hide row" : "Show row"} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}>{isOpen ? "▾" : "▸"}</button></td>
                        <td className="r num muted">{ri + 1}{sh.hiddenRows.includes(ri + 1) ? "·h" : ""}</td>
                        {cols.map((c) => {
                          const cell = sh.rows[ri][c] ?? null;
                          const d = display(cell, /rec/i.test(headerOf(c)), readRecords);
                          return <td key={c} className={typeof raw(cell) === "number" ? "r num" : undefined} title={d.title ?? d.formula}>{cell == null ? <span className="muted">—</span> : <>{d.text}{d.formula && <sup className="muted" aria-label="formula"> ƒ</sup>}</>}</td>;
                        })}
                      </tr>
                      {isOpen && (
                        <tr className="detail"><td colSpan={cols.length + 2}>
                          <dl className="kv">
                            {cols.map((c) => {
                              const cell = sh.rows[ri][c] ?? null;
                              const d = display(cell, /rec/i.test(headerOf(c)), false);
                              return <div key={c}><dt>{colLetter(c)}{ri + 1} · {headerOf(c) || "(blank header)"}</dt><dd>{cell == null ? <span className="muted">empty</span> : <>{d.text}<span className="tag">{d.kind}</span>{d.formula && <div className="muted" style={{ fontSize: 11 }}>{d.formula}</div>}</>}</dd></div>;
                            })}
                          </dl>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {rows.length > limit && <div style={{ padding: 8 }}><button type="button" className="btn small" onClick={() => setLimit(limit + 500)}>Show 500 more of {rows.length - limit}</button></div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Stacked-table tabs (SP+ performance): the grid exactly as laid out, every cell in place. */
function RawGrid({ sh, readRecords }: { sh: SheetSnapshot; readRecords: boolean }) {
  const width = Math.max(0, ...sh.rows.map((r) => r.length));
  return (
    <div className="tbl-wrap" role="region" aria-label={`${sh.name} grid`} tabIndex={0}>
      <table className="tbl">
        <thead><tr><th className="r">Row</th>{Array.from({ length: width }, (_, c) => <th key={c}>{colLetter(c)}</th>)}</tr></thead>
        <tbody>
          {sh.rows.map((r, i) => r.some((c) => c != null) && (
            <tr key={i}>
              <td className="r num muted">{i + 1}{sh.hiddenRows.includes(i + 1) ? "·h" : ""}</td>
              {Array.from({ length: width }, (_, c) => {
                const cell = r[c] ?? null;
                const d = display(cell, c === 1 || c === 5, readRecords);
                const link = cell && typeof cell === "object" && "link" in cell ? cell : null;
                return <td key={c} className={typeof raw(cell) === "number" ? "r num" : undefined} title={d.title ?? d.formula}>{cell == null ? "" : link ? <a href={link.link} target="_blank" rel="noreferrer noopener">{link.t}</a> : <>{d.text}{d.formula && <sup className="muted"> ƒ</sup>}</>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

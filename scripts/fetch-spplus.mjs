// Refreshes src/data/spplus.json from the "2026 SP+" Google Sheet (read-only). The tool needs the sheet's link sharing set to "anyone with the link".
//   node scripts/fetch-spplus.mjs                  download the sheet's xlsx export
//   node scripts/fetch-spplus.mjs path/to/export.xlsx   read a local export instead
// Any failure leaves the last good file in place and exits 0, so the site keeps its previous SP+ data.
import ExcelJS from "exceljs";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const SHEET_ID = process.env.SPPLUS_SHEET_ID ?? "1vwoVl-Dxy0es87Z9I1RTvFzr72Lb1fAkREfbLxbK-eg";
const OUT = new URL("../src/data/spplus.json", import.meta.url);

async function download() {
  const local = process.argv[2];
  if (local) return { buffer: readFileSync(local), method: "local export file" };
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Google returned ${res.status} for the sheet export`);
  if ((res.headers.get("content-type") ?? "").includes("text/html")) throw new Error("Google returned a sign-in page: the sheet is not shared by link");
  return { buffer: Buffer.from(await res.arrayBuffer()), method: "Google Sheets export link" };
}

const encodeDate = (d) =>
  d.getUTCFullYear() < 1901 ? { tm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` } : { d: d.toISOString().slice(0, 10) };

function encode(v) {
  if (v == null) return null;
  if (v instanceof Date) return encodeDate(v);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v === "" ? null : v;
  if (typeof v === "object") {
    if ("error" in v) return { e: String(v.error) };
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("hyperlink" in v) {
      const t = encode(v.text);
      return { link: String(v.hyperlink), t: typeof t === "string" ? t : String(v.hyperlink) };
    }
    if ("text" in v) return encode(v.text);
  }
  return String(v);
}

async function parse(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = [];
  for (const ws of wb.worksheets) {
    const rows = [];
    let width = 0;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const out = [];
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        // Formulas are read through the cell API: it translates shared formulas and keeps a cached result of 0.
        const c = cell.type === ExcelJS.ValueType.Formula ? { f: `=${cell.formula ?? ""}`.replace(/^==/, "="), v: encode(cell.result) } : encode(cell.value);
        if (c === null) return;
        while (out.length < col - 1) out.push(null);
        out[col - 1] = c;
      });
      if (!out.some((c) => c !== null)) return;
      while (rows.length < n - 1) rows.push([]);
      rows[n - 1] = out;
      width = Math.max(width, out.length);
    });
    const hiddenRows = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => { if (row.hidden) hiddenRows.push(n); });
    const hiddenCols = [];
    ws.columns?.forEach((col, i) => { if (col?.hidden) hiddenCols.push(i + 1); });
    for (const r of rows) while (r.length < width) r.push(null);
    sheets.push({ name: ws.name, rows, hiddenRows, hiddenCols });
  }
  return sheets;
}

function validate(sheets) {
  const names = new Set(sheets.map((s) => s.name));
  for (const n of ["POSTGAME WIN EXPECTANCY", "SP+ performance"]) if (!names.has(n)) throw new Error(`The sheet no longer has a "${n}" tab`);
  if (!sheets.some((s) => /^FBS Week \d+$/.test(s.name))) throw new Error('The sheet has no "FBS Week" tabs');
  if (!sheets.some((s) => /^TOP 772 WEEK \d+$/.test(s.name))) throw new Error('The sheet has no "TOP 772 WEEK" tabs');
  const fbs = sheets.filter((s) => /^FBS Week \d+$/.test(s.name));
  if (fbs.some((s) => s.rows.length < 100)) throw new Error("An FBS week tab looks truncated");
}

try {
  const { buffer, method } = await download();
  const sheets = await parse(buffer);
  validate(sheets);
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const snap = { version: 1, source: { id: SHEET_ID, title: "2026 SP+", url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/`, method: "xlsx-export", methodLabel: method }, fetchedAt: new Date().toISOString(), sheets };
  // Only the cells matter for "did anything change": a new read time alone is not worth a commit.
  if (prev && JSON.stringify(prev.sheets) === JSON.stringify(snap.sheets)) {
    console.log(`spplus: sheet unchanged (${sheets.length} tabs)`);
  } else {
    writeFileSync(new URL("../src/data/spplus.json.tmp", import.meta.url), JSON.stringify(snap));
    renameSync(new URL("../src/data/spplus.json.tmp", import.meta.url), OUT);
    console.log(`spplus: wrote ${sheets.length} tabs via ${method}`);
  }
} catch (e) {
  console.warn(`spplus: keeping the last saved SP+ data (${e instanceof Error ? e.message : e})`);
}

// Minimal streaming CSV reader for nflverse files (plain or .gz). Handles quoted fields with commas, quotes and newlines.
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";

/** Calls onRow(headerIndexMap, fields) for every data row. Fields are strings; empty and "NA" are returned as "". */
export async function forEachRow(source, onRow) {
  const stream = source.startsWith("http") ? null : createReadStream(source);
  const input = source.endsWith(".gz") ? stream.pipe(createGunzip()) : stream;
  let header = null, index = null;
  let field = "", row = [], quoted = false, afterQuote = false;
  const endField = () => { row.push(field === "NA" ? "" : field); field = ""; };
  const endRow = () => {
    endField();
    if (!header) { header = row; index = Object.fromEntries(row.map((h, i) => [h, i])); }
    else if (row.length > 1 || row[0] !== "") onRow(index, row);
    row = [];
  };
  for await (const chunk of input) {
    const text = chunk.toString("utf8");
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (quoted) {
        if (c === 34) { quoted = false; afterQuote = true; } else field += text[i];
      } else if (c === 34) {
        if (afterQuote) { field += '"'; quoted = true; afterQuote = false; } else if (field === "") quoted = true; else field += '"';
      } else {
        afterQuote = false;
        if (c === 44) endField();
        else if (c === 10) endRow();
        else if (c !== 13) field += text[i];
      }
    }
  }
  if (field !== "" || row.length) endRow();
}

export async function readRows(source, columns) {
  const out = [];
  await forEachRow(source, (ix, f) => {
    const o = {};
    for (const c of columns) o[c] = f[ix[c]] ?? "";
    out.push(o);
  });
  return out;
}

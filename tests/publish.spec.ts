import { expect, test } from "./fixtures";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { addMissing } from "../scripts/publish-generated.mjs";

test("addMissing adds what main lacks and never changes what it has", () => {
  const mine = { conferences: { A: { x: 1 } } }, theirs = { conferences: { A: { x: 0 }, B: { y: 2 } } };
  expect(addMissing(mine, theirs, { key: "conferences" })).toEqual({ conferences: { A: { x: 1 }, B: { y: 2 } } });
  const src = { logos: [{ logoId: "a", source: "custom" }] }, data = { logos: [{ logoId: "a", source: "espn" }, { logoId: "b", source: "espn" }] };
  expect(addMissing(src, data, { key: "logos", list: "logoId" }).logos).toEqual([{ logoId: "a", source: "custom" }, { logoId: "b", source: "espn" }]);
  expect(addMissing({ a: 1 }, { a: 2, b: 3 })).toEqual({ a: 1, b: 3 });
});

test("publishing takes the generated files and new assets, and leaves what main keeps by hand alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "publish-"));
  const run = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
  const put = (p: string, body: string) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), body); };
  run("init", "-q", "-b", "main"); run("config", "user.email", "t@t"); run("config", "user.name", "t");
  put("src/data/slate.json", '{"v":1}');
  put("src/data/conference-logos.json", JSON.stringify({ conferences: { NFL: { label: "NFL" } } }));
  put("public/logos/den.webp", "custom"); put("public/_headers", "main"); put("public/exports/e.csv", "old");
  run("add", "-A"); run("commit", "-qm", "main");
  run("checkout", "-qb", "data");
  put("src/data/slate.json", '{"v":2}');
  put("src/data/conference-logos.json", JSON.stringify({ conferences: { MVC: { label: "MVC" } } }));
  put("public/logos/den.webp", "stale"); put("public/logos/new.webp", "new"); put("public/_headers", "stale"); put("public/exports/e.csv", "fresh");
  run("add", "-A"); run("commit", "-qm", "data");
  const src = run("rev-parse", "HEAD");
  run("checkout", "-q", "main");
  execFileSync("node", [join(process.cwd(), "scripts/publish-generated.mjs"), src], { cwd: dir });
  const read = (p: string) => readFileSync(join(dir, p), "utf8");
  expect(read("src/data/slate.json")).toBe('{"v":2}'); // generated: taken
  expect(Object.keys(JSON.parse(read("src/data/conference-logos.json")).conferences).sort()).toEqual(["MVC", "NFL"]); // hand-kept: NFL stays, MVC is added
  expect(read("public/logos/den.webp")).toBe("custom"); // not replaced by the stale copy
  expect(read("public/logos/new.webp")).toBe("new"); // a new asset comes over
  expect(read("public/_headers")).toBe("main");
  expect(read("public/exports/e.csv")).toBe("fresh");
  expect(existsSync(join(dir, "public/logos/new.webp"))).toBe(true);
});

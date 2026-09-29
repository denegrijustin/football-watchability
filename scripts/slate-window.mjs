// Which week to build, from today's date in Central time. A slate runs
// Tuesday through Monday, so Tuesday's run starts the new week and the
// Thursday–Monday runs refresh the current one.
//
//   node scripts/slate-window.mjs            -> start=YYYYMMDD end=YYYYMMDD
//   TODAY=2026-10-02 node scripts/slate-window.mjs
const today = process.env.TODAY ?? new Date().toLocaleDateString("sv-SE", { timeZone: "America/Chicago" });
const d = new Date(`${today}T12:00:00Z`);
const dow = d.getUTCDay(); // 0 Sun … 2 Tue
const back = (dow - 2 + 7) % 7;
const start = new Date(d.getTime() - back * 864e5);
const end = new Date(start.getTime() + 6 * 864e5);
const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, "");
console.log(`start=${ymd(start)}\nend=${ymd(end)}`);

import { logos, slate, tierLabel } from "./data";
import { gridGames, slot, type GridGame } from "./data/grid";
import { tzAbbr } from "./tz";

/**
 * Draws the weekend watch slate (Thursday–Monday, every game or only the
 * Entertaining ones) onto a canvas and downloads it as a JPG. Times follow the
 * site's chosen time zone.
 */
const W = 1800;
const PAD = 48;
const COLS = 3;
const GAP = 16;
const ROW_H = 78;
const COL_W = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
const TIER_COLOR: Record<string, string> = {
  elite: "#c0ed80",
  vgood: "#b4dd92",
  good: "#edd092",
  watch: "#f3b681",
  bg: "#f59f9e",
};
const FONT = `Inter, "Segoe UI", Roboto, system-ui, -apple-system, sans-serif`;

const load = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const clockOf = (min: number) => {
  const h = Math.floor(min / 60) % 24,
    m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export async function downloadSlateJpg({ onlyEntertaining = false } = {}) {
  const ENT = new Set(["elite", "vgood", "good"]);
  const games = gridGames()
    .filter((g) => !onlyEntertaining || ENT.has(g.tier))
    .map((g) => ({ ...g, s: slot(g.start) }))
    .sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.minute - b.s.minute || b.score - a.score);
  const days: { date: string; day: string; games: typeof games }[] = [];
  for (const g of games) {
    let d = days.find((x) => x.date === g.s.date);
    if (!d) days.push((d = { date: g.s.date, day: g.s.day, games: [] }));
    d.games.push(g);
  }

  const HEAD = 170;
  const DAY_HEAD = 58;
  const height =
    HEAD + days.reduce((h, d) => h + DAY_HEAD + Math.ceil(d.games.length / COLS) * (ROW_H + 10) + 24, 0) + 70;
  const canvas = document.createElement("canvas");
  const scale = 1;
  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // Logos (same-origin files or data URIs).
  const ids = new Set(games.flatMap((g) => g.sides.map((t) => t.logoId)));
  const imgs = new Map<string, HTMLImageElement | null>();
  await Promise.all([...ids].map(async (id) => imgs.set(id, logos[id] ? await load(logos[id]) : null)));

  // Background and header
  ctx.fillStyle = "#0b1117";
  ctx.fillRect(0, 0, W, height);
  ctx.fillStyle = "#c0ed80";
  roundRect(ctx, PAD, 44, 56, 46, 12);
  ctx.fill();
  ctx.fillStyle = "#142110";
  ctx.font = `italic 800 24px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("FW", PAD + 11, 68);
  ctx.fillStyle = "#eaf0f4";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(onlyEntertaining ? "Entertaining games this weekend" : "Weekend watch slate", PAD + 76, 60);
  ctx.fillStyle = "#b9c6d0";
  ctx.font = `500 22px ${FONT}`;
  const ent = games.filter((g) => ENT.has(g.tier)).length;
  ctx.fillText(
    `${slate.period} · ${games.length} games · ${ent} entertaining · times ${tzAbbr()} · fbwatch.elskatemm.com`,
    PAD + 76,
    98,
  );
  // Legend
  let lx = PAD;
  const ly = 138;
  ctx.font = `600 18px ${FONT}`;
  for (const [label, color, dim] of [
    ["Entertaining (74+)", "#c0ed80", false],
    ["Watchable (64–73)", "#f3b681", false],
    ["Background (<64), dimmed", "#f59f9e", true],
  ] as const) {
    ctx.globalAlpha = dim ? 0.45 : 1;
    ctx.fillStyle = color;
    roundRect(ctx, lx, ly - 9, 18, 18, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#b9c6d0";
    ctx.fillText(label, lx + 26, ly);
    lx += ctx.measureText(label).width + 60;
  }

  let y = HEAD;
  for (const d of days) {
    const dateText = new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    ctx.fillStyle = "#eaf0f4";
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText(dateText, PAD, y + 26);
    const n = ctx.measureText(dateText).width;
    ctx.fillStyle = "#8d9eac";
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(`${d.games.length} game${d.games.length === 1 ? "" : "s"}`, PAD + n + 16, y + 28);
    ctx.fillStyle = "#243441";
    ctx.fillRect(PAD, y + 48, W - PAD * 2, 2);
    y += DAY_HEAD;
    d.games.forEach((g, i) => {
      const col = i % COLS,
        row = Math.floor(i / COLS);
      drawRow(ctx, g, PAD + col * (COL_W + GAP), y + row * (ROW_H + 10), imgs);
    });
    y += Math.ceil(d.games.length / COLS) * (ROW_H + 10) + 24;
  }
  ctx.fillStyle = "#8d9eac";
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText(
    `Watchability 0–100: team quality, competitiveness, stakes, matchup and TV window. Projected score and win probability from the line, season scoring and ESPN.`,
    PAD,
    height - 36,
  );

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${onlyEntertaining ? "entertaining-games" : "watch-slate"}-${slate.period.replace(/[^\w]+/g, "-")}.jpg`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function drawRow(
  ctx: CanvasRenderingContext2D,
  g: GridGame & { s: { minute: number } },
  x: number,
  y: number,
  imgs: Map<string, HTMLImageElement | null>,
) {
  const tier = g.tier;
  const dim = tier === "bg";
  const hl = tier === "elite" || tier === "vgood" || tier === "good";
  const color = TIER_COLOR[tier] ?? "#8d9eac";
  ctx.save();
  ctx.globalAlpha = dim ? 0.42 : 1;
  // Card
  const [a, h] = g.sides;
  const grad = ctx.createLinearGradient(x, 0, x + COL_W, 0);
  grad.addColorStop(0, a.color ?? "#17222c");
  grad.addColorStop(0.5, "#121b23");
  grad.addColorStop(1, h.color ?? "#17222c");
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, COL_W, ROW_H, 12);
  ctx.fill();
  if (hl) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    roundRect(ctx, x + 1.5, y + 1.5, COL_W - 3, ROW_H - 3, 11);
    ctx.stroke();
  } else {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, x + 0.5, y + 0.5, COL_W - 1, ROW_H - 1, 12);
    ctx.stroke();
  }
  // Time + network
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#eaf0f4";
  ctx.font = `800 19px ${FONT}`;
  ctx.fillText(clockOf(g.s.minute), x + 14, y + 32);
  ctx.fillStyle = "rgba(234,240,244,0.72)";
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(fit(ctx, g.netLabel, 98), x + 14, y + 54);
  // Logos and teams
  const lx = x + 124;
  const logo = (id: string, px: number) => {
    const img = imgs.get(id);
    if (img) ctx.drawImage(img, px, y + 17, 44, 44);
  };
  logo(a.logoId, lx);
  logo(h.logoId, lx + 58);
  ctx.fillStyle = "#eaf0f4";
  ctx.font = `800 20px ${FONT}`;
  const tag = (t: GridGame["sides"][number]) => (t.tag && t.tag.startsWith("#") ? `${t.tag} ` : "");
  const title = `${tag(a)}${a.abbr} @ ${tag(h)}${h.abbr}`;
  const tx = lx + 118;
  const pillW = 74;
  ctx.fillText(fit(ctx, title, COL_W - (tx - x) - pillW - 20), tx, y + 34);
  ctx.fillStyle = "rgba(234,240,244,0.75)";
  ctx.font = `500 15px ${FONT}`;
  const sub = g.final ? `Final ${g.final}` : tierLabel(tier);
  ctx.fillText(fit(ctx, sub, COL_W - (tx - x) - pillW - 20), tx, y + 56);
  // Score pill
  const px = x + COL_W - pillW - 12,
    py = y + 20;
  ctx.fillStyle = hl ? color : "rgba(0,0,0,0.45)";
  roundRect(ctx, px, py, pillW, 38, 19);
  ctx.fill();
  ctx.fillStyle = hl ? "#10181f" : color;
  ctx.font = `800 22px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(String(g.score), px + pillW / 2, py + 27);
  ctx.textAlign = "left";
  ctx.restore();
}

import { logos, networkLogo } from "./data";
import { GRID_SLOT, layoutGrid, type GridGame, type PlacedGame } from "./data/grid";
import { tzAbbr } from "./tz";

/**
 * Draws one day of the TV grid (the same lanes, times and tier styling as the
 * on-screen grid, honoring its league and "Entertaining only" filters) onto a
 * canvas and downloads it as a JPG. Networks run down the side, time runs left
 * to right. Entertaining games (Good or better) get a tier-colored outline,
 * Background games are dimmed. Times follow the site's chosen time zone.
 */
const PAD = 40;
const LABEL_W = 132;
const STEP_W = 60;
const HEAD_H = 34;
const LANE_H = 84;
const BLOCK_H = 70;
const TOP = 176;
const MIN_W = 1300;
const ENT = new Set(["elite", "vgood", "good"]);
const TIER_COLOR: Record<string, string> = {
  elite: "#a3c96f",
  vgood: "#98bc80",
  good: "#c9b47c",
  watch: "#d0a273",
  bg: "#cf8f8e",
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
const kick = (min: number) => clockOf(min).replace(":00 ", " ");
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
/** Draws an image scaled to fit inside a box, centered. */
function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.min(w / img.width, h / img.height);
  const dw = img.width * r,
    dh = img.height * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export async function downloadGridJpg({
  games,
  dateLabel,
  day,
  period,
}: {
  games: GridGame[];
  dateLabel: string;
  day: string;
  period: string;
}) {
  const { lanes, placed, startMin, steps } = layoutGrid(games);
  if (!placed.length) return;

  const gridW = LABEL_W + steps * STEP_W;
  const W = Math.max(MIN_W, PAD * 2 + gridW);
  const H = TOP + HEAD_H + lanes.length * LANE_H + 80;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Team and network logos (same-origin files or data URIs).
  const teamIds = new Set(placed.flatMap((g) => g.sides.map((t) => t.logoId)));
  const teamImgs = new Map<string, HTMLImageElement | null>();
  const netImgs = new Map<string, HTMLImageElement | null>();
  await Promise.all([
    ...[...teamIds].map(async (id) => teamImgs.set(id, logos[id] ? await load(logos[id]) : null)),
    ...lanes.map(async (l) => {
      const src = networkLogo(l.network);
      if (!netImgs.has(l.network)) netImgs.set(l.network, src ? await load(src) : null);
    }),
  ]);

  // Background and header
  ctx.fillStyle = "#0b1117";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#a3c96f";
  roundRect(ctx, PAD, 36, 56, 46, 12);
  ctx.fill();
  ctx.fillStyle = "#142110";
  ctx.font = `italic 800 24px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("FW", PAD + 11, 60);
  ctx.fillStyle = "#eaf0f4";
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(`TV grid · ${dateLabel}`, PAD + 76, 52);
  const good = placed.filter((g) => ENT.has(g.tier)).length;
  ctx.fillStyle = "#b9c6d0";
  ctx.font = `500 21px ${FONT}`;
  ctx.fillText(
    `${period} · ${placed.length} games · ${good} entertaining · times ${tzAbbr()} · fbwatch.elskatemm.com`,
    PAD + 76,
    88,
  );
  // Legend
  let lx = PAD;
  const ly = 132;
  ctx.font = `600 18px ${FONT}`;
  for (const [label, color, dim] of [
    ["Entertaining (74+): outlined", TIER_COLOR.elite, false],
    ["Watchable (64–73)", TIER_COLOR.watch, false],
    ["Background (<64): dimmed", TIER_COLOR.bg, true],
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

  // Time header and column stripes
  const gx = PAD + LABEL_W;
  const laneY = (i: number) => TOP + HEAD_H + i * LANE_H;
  ctx.font = `700 15px ${FONT}`;
  ctx.textBaseline = "middle";
  for (let r = 0; r < steps; r++) {
    const x = gx + r * STEP_W;
    if (r % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(x, TOP + HEAD_H, STEP_W * 2, lanes.length * LANE_H);
      ctx.fillStyle = "#b9c6d0";
      ctx.fillText(kick(startMin + r * GRID_SLOT), x + 6, TOP + HEAD_H / 2);
    }
  }
  ctx.fillStyle = "#243441";
  ctx.fillRect(PAD, TOP + HEAD_H - 1, gridW, 2);
  ctx.fillStyle = "#8d9eac";
  ctx.font = `800 16px ${FONT}`;
  ctx.fillText(day, PAD + 8, TOP + HEAD_H / 2);

  // Network lanes
  lanes.forEach((l, i) => {
    const y = laneY(i);
    if (i > 0 && lanes[i - 1].network !== l.network) {
      ctx.fillStyle = "#243441";
      ctx.fillRect(PAD, y, gridW, 1);
    }
    const chipX = PAD + 6,
      chipY = y + (LANE_H - 32) / 2,
      chipW = LABEL_W - 20;
    const img = netImgs.get(l.network);
    if (img) {
      ctx.fillStyle = "#d5dbe0";
      roundRect(ctx, chipX, chipY, chipW, 32, 16);
      ctx.fill();
      contain(ctx, img, chipX + 12, chipY + 6, chipW - 24, 20);
    } else {
      ctx.fillStyle = "#eaf0f4";
      ctx.font = `800 20px ${FONT}`;
      ctx.textBaseline = "middle";
      ctx.fillText(fit(ctx, l.label, chipW), chipX + 4, y + LANE_H / 2);
    }
  });

  for (const g of placed) drawBlock(ctx, g, gx, laneY(g.lane), startMin, teamImgs);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8d9eac";
  ctx.font = `500 16px ${FONT}`;
  ctx.fillText(
    "Watchability 0–100: team quality, competitiveness, stakes, matchup and TV window. Each block spans the game's broadcast window.",
    PAD,
    H - 30,
  );

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tv-grid-${(day || dateLabel).toLowerCase().replace(/[^\w]+/g, "-")}-${period.replace(/[^\w]+/g, "-")}.jpg`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  g: PlacedGame,
  gx: number,
  laneTop: number,
  startMin: number,
  imgs: Map<string, HTMLImageElement | null>,
) {
  const hl = ENT.has(g.tier);
  const dim = g.tier === "bg";
  const color = TIER_COLOR[g.tier] ?? "#8d9eac";
  const at = Math.floor((g.minute - startMin) / GRID_SLOT);
  const span = Math.max(4, Math.round(g.minutes / GRID_SLOT));
  const x = gx + at * STEP_W + 2;
  const y = laneTop + (LANE_H - BLOCK_H) / 2;
  const w = span * STEP_W - 4;
  const [a, h] = g.sides;
  const SIDE = 62;

  ctx.save();
  ctx.globalAlpha = dim ? 0.42 : 1;
  // Body, clipped to the rounded block: away color | dark middle | home color
  roundRect(ctx, x, y, w, BLOCK_H, 12);
  ctx.clip();
  ctx.fillStyle = "#17222c";
  ctx.fillRect(x, y, w, BLOCK_H);
  ctx.fillStyle = a.color ?? "#1d2a35";
  ctx.fillRect(x, y, SIDE, BLOCK_H);
  ctx.fillStyle = h.color ?? "#1d2a35";
  ctx.fillRect(x + w - SIDE, y, SIDE, BLOCK_H);
  for (const [t, sx] of [
    [a, x],
    [h, x + w - SIDE],
  ] as const) {
    const img = imgs.get(t.logoId);
    if (img) contain(ctx, img, sx + 9, y + 11, SIDE - 18, BLOCK_H - 22);
  }
  ctx.restore();

  // Outline: tier color for Entertaining, hairline otherwise
  ctx.save();
  ctx.globalAlpha = dim ? 0.42 : 1;
  ctx.lineWidth = hl ? 3 : 1;
  ctx.strokeStyle = hl ? color : "rgba(255,255,255,0.14)";
  roundRect(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, BLOCK_H - ctx.lineWidth, 12);
  ctx.stroke();

  // Label: matchup, then kickoff · network (or final score)
  const pillW = 46;
  const tx = x + SIDE + 12;
  const room = w - SIDE * 2 - pillW - 34;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#eaf0f4";
  ctx.font = `800 19px ${FONT}`;
  ctx.fillText(fit(ctx, `${a.abbr} @ ${h.abbr}`, room), tx, y + 30);
  ctx.fillStyle = "rgba(234,240,244,0.78)";
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(fit(ctx, g.final ? `Final ${g.final} · ${g.netLabel}` : `${kick(g.minute)} · ${g.netLabel}`, room), tx, y + 50);
  // Score pill
  const px = x + w - SIDE - pillW - 8,
    py = y + (BLOCK_H - 30) / 2;
  ctx.fillStyle = hl ? color : "rgba(0,0,0,0.5)";
  roundRect(ctx, px, py, pillW, 30, 15);
  ctx.fill();
  ctx.fillStyle = hl ? "#10181f" : color;
  ctx.font = `800 18px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(g.score), px + pillW / 2, py + 16);
  ctx.textAlign = "left";
  ctx.restore();
}

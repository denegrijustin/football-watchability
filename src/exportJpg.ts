import { logos, networkLogo, rankLine } from "./data";
import { GRID_SLOT, layoutGrid, type GridGame, type PlacedGame } from "./data/grid";
import { tzAbbr } from "./tz";
import { directvChannel } from "./directv";

/**
 * Draws one day of the TV grid, or every day of the weekend (the same lanes,
 * times and tier styling as the on-screen grid, honoring its league and
 * "Entertaining only" filters) onto a canvas and renders it as a high-resolution PNG (see renderGridImage). The
 * weekend image shares one time axis across all days, so a given time is the
 * same column on every day. Networks run down the side, time runs left
 * to right. Entertaining games (Good or better) get a tier-colored outline,
 * Background games use a dashed outline and ↓ marker. Times follow the site's chosen time zone.
 */
const PAD = 40;
const LABEL_W = 132;
const STEP_W = 68;
const HEAD_H = 34;
const LANE_H = 96;
const BLOCK_H = 84;
const SIDE = 104;
const DAY_H = 56;
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
/** Texas and Kansas logos are shown upside down everywhere on the site (see styles.css); the export matches. */
const UPSIDE_DOWN = /\/logos\/(texas|kansas)\.webp(\?|$)/;
/** Draws an image scaled to fit inside a box, centered. */
function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.min(w / img.width, h / img.height);
  const dw = img.width * r,
    dh = img.height * r;
  const cx = x + w / 2,
    cy = y + h / 2;
  if (UPSIDE_DOWN.test(img.src)) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } else ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export type ExportDay = { date: string; day: string; label: string; games: GridGame[] };

/** The finished image, ready to preview, download or hand to the share sheet. */
export type GridImage = { blob: Blob; filename: string; width: number; height: number; scale: number };

/**
 * Pixel budget for the canvas. Phones cap a canvas at about 16.7 million pixels (iOS Safari) and will silently draw
 * nothing past it, so touch devices stay under 16M; desktops get a much larger budget. The layout is about
 * 2,000-3,500 CSS pixels wide, so a day renders at 3-4x on a desktop and 2x or more on a phone, with text and shapes
 * drawn as vectors at that size, so a zoom stays sharp.
 */
function pixelBudget() {
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return { maxPixels: touch ? 15.5e6 : 90e6, maxSide: touch ? 8192 : 16384, maxScale: touch ? 3 : 4 };
}

export async function renderGridImage({
  days,
  period,
  scope,
}: {
  days: ExportDay[];
  period: string;
  scope: "day" | "weekend" | "week";
}): Promise<GridImage | null> {
  const sections = days
    .map((d) => ({ ...d, layout: layoutGrid(d.games) }))
    .filter((d) => d.layout.placed.length);
  if (!sections.length) return null;
  const one = scope === "day" || sections.length === 1;
  const allPlaced = sections.flatMap((d) => d.layout.placed);
  // One shared time axis for every day, so the same kickoff time lines up in
  // the same column (8 PM Saturday sits directly above 8 PM Sunday).
  const axisStart = Math.floor(Math.min(...sections.map((d) => d.layout.startMin)) / 60) * 60;
  const axisEnd = Math.max(...sections.map((d) => d.layout.endMin));
  const axisSteps = (axisEnd - axisStart) / GRID_SLOT;

  const W = Math.max(MIN_W, PAD * 2 + LABEL_W + axisSteps * STEP_W);
  const secH = (d: (typeof sections)[number]) => (one ? 0 : DAY_H) + HEAD_H + d.layout.lanes.length * LANE_H + 28;
  const H = TOP + sections.reduce((h, d) => h + secH(d), 0) + 52;
  // As sharp as the device allows: up to 4x on a desktop, with a floor of 1x (a very tall weekend on a phone can
  // only just fit); everything is drawn at this scale rather than enlarged afterwards.
  const { maxPixels, maxSide, maxScale } = pixelBudget();
  const scale = Math.min(maxScale, Math.sqrt(maxPixels / (W * H)), maxSide / Math.max(W, H));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(scale, scale);

  // Team and network logos (same-origin files or data URIs).
  const teamIds = new Set(allPlaced.flatMap((g) => g.sides.map((t) => t.logoId)));
  const nets = new Set(sections.flatMap((d) => d.layout.lanes.map((l) => l.network)));
  const teamImgs = new Map<string, HTMLImageElement | null>();
  const netImgs = new Map<string, HTMLImageElement | null>();
  await Promise.all([
    ...[...teamIds].map(async (id) => teamImgs.set(id, logos[id] ? await load(logos[id]) : null)),
    ...[...nets].map(async (n) => {
      const src = networkLogo(n);
      netImgs.set(n, src ? await load(src) : null);
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
  ctx.fillText(one ? `TV grid · ${sections[0].label}` : scope === "week" ? `TV grid · full week · NFL + college` : `TV grid · full weekend`, PAD + 76, 52);
  const good = allPlaced.filter((g) => ENT.has(g.tier)).length;
  ctx.fillStyle = "#b9c6d0";
  ctx.font = `500 21px ${FONT}`;
  ctx.fillText(
    `${period} · ${allPlaced.length} games · ${good} entertaining · times ${tzAbbr()} · fbwatch.elskatemm.com`,
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
    ["↓ Lower priority (<64): dashed", TIER_COLOR.bg, true],
  ] as const) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    roundRect(ctx, lx, ly - 9, 18, 18, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#b9c6d0";
    ctx.fillText(label, lx + 26, ly);
    lx += ctx.measureText(label).width + 60;
  }
  ctx.fillStyle = "#8d9eac";
  ctx.font = `500 16px ${FONT}`;
  const hint = "Top: record. Bottom: conference rank · national rank (AP if ranked, otherwise ESPN FPI).";
  // On a narrow day the key leaves no room for the hint beside it: put it on the next line instead of running off the edge.
  if (lx + ctx.measureText(hint).width > W - PAD) ctx.fillText(hint, PAD, ly + 26);
  else ctx.fillText(hint, lx, ly);

  let y = TOP;
  for (const d of sections) {
    const { lanes, placed } = d.layout;
    const startMin = axisStart;
    const steps = axisSteps;
    if (!one) {
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#eaf0f4";
      ctx.font = `800 28px ${FONT}`;
      ctx.fillText(d.label, PAD, y + 22);
      const n = ctx.measureText(d.label).width;
      ctx.fillStyle = "#8d9eac";
      ctx.font = `500 20px ${FONT}`;
      ctx.fillText(`${placed.length} game${placed.length === 1 ? "" : "s"}`, PAD + n + 16, y + 24);
      y += DAY_H;
    }
    const gridW = LABEL_W + steps * STEP_W;
    const gx = PAD + LABEL_W;
    const laneY = (i: number) => y + HEAD_H + i * LANE_H;

    // Time header and column stripes
    ctx.font = `700 15px ${FONT}`;
    ctx.textBaseline = "middle";
    for (let r = 0; r < steps; r++) {
      if (r % 2) continue;
      const x = gx + r * STEP_W;
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(x, y + HEAD_H, STEP_W * 2, lanes.length * LANE_H);
      ctx.fillStyle = "#b9c6d0";
      ctx.fillText(kick(startMin + r * GRID_SLOT), x + 6, y + HEAD_H / 2);
    }
    ctx.fillStyle = "#243441";
    ctx.fillRect(PAD, y + HEAD_H - 1, gridW, 2);
    ctx.fillStyle = "#8d9eac";
    ctx.font = `800 16px ${FONT}`;
    ctx.fillText(d.day, PAD + 8, y + HEAD_H / 2);

    // Network lanes
    lanes.forEach((l, i) => {
      const ly2 = laneY(i);
      if (i > 0 && lanes[i - 1].network !== l.network) {
        ctx.fillStyle = "#243441";
        ctx.fillRect(PAD, ly2, gridW, 1);
      }
      const chipX = PAD + 6,
        chipY = ly2 + (LANE_H - 32) / 2,
        chipW = LABEL_W - 20;
      const img = netImgs.get(l.network);
      if (img) {
        ctx.fillStyle = "#d5dbe0";
        roundRect(ctx, chipX, chipY, chipW, 32, 16);
        ctx.fill();
        // The DIRECTV channel (Overland Park) sits to the right of the logo inside the same chip.
        const ch = directvChannel(l.network);
        contain(ctx, img, chipX + 12, chipY + 6, chipW - 24 - (ch ? 38 : 0), 20);
        if (ch) {
          ctx.fillStyle = "#1c2630";
          ctx.font = `800 17px ${FONT}`;
          ctx.textBaseline = "middle";
          ctx.textAlign = "right";
          ctx.fillText(String(ch), chipX + chipW - 12, chipY + 17);
          ctx.textAlign = "left";
        }
      } else {
        ctx.fillStyle = "#eaf0f4";
        ctx.font = `800 20px ${FONT}`;
        ctx.textBaseline = "middle";
        ctx.fillText(fit(ctx, l.label, chipW), chipX + 4, ly2 + LANE_H / 2);
      }
    });

    for (const g of placed) drawBlock(ctx, g, gx, laneY(g.lane), startMin, teamImgs);
    y += HEAD_H + lanes.length * LANE_H + 28;
  }

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8d9eac";
  ctx.font = `500 16px ${FONT}`;
  ctx.fillText(
    "Watchability 0–100: team quality, competitiveness, stakes, matchup and TV window. Each block spans the game's broadcast window. Numbers beside network logos are DIRECTV channels (Overland Park, KS).",
    PAD,
    H - 22,
  );

  // Lossless PNG: no compression artifacts around text and logo edges, however far you zoom.
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return null;
  const slug = (t: string) => t.toLowerCase().replace(/[^\w]+/g, "-");
  return {
    blob,
    filename: `tv-grid-${one ? slug(sections[0].day || sections[0].label) : scope === "week" ? "week" : "weekend"}-${slug(period)}.png`,
    width: canvas.width,
    height: canvas.height,
    scale,
  };
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
  // Exact minutes, so back-to-back games on one lane never overlap.
  const x = gx + ((g.minute - startMin) / GRID_SLOT) * STEP_W + 1;
  const y = laneTop + (LANE_H - BLOCK_H) / 2;
  const w = (g.minutes / GRID_SLOT) * STEP_W - 3;
  const [a, h] = g.sides;

  ctx.save();
  ctx.globalAlpha = 1;
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
    if (img) contain(ctx, img, sx + (SIDE - 40) / 2, y + 21, 40, 40);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (t.tag) {
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(fit(ctx, t.tag, SIDE - 8), sx + SIDE / 2, y + 17);
    }
    const rk = rankLine(t.ranks, true, t.poll);
    if (rk) {
      ctx.fillStyle = "#ffffff";
      // Shrink to fit before truncating ("Big Ten #10 · #96").
      let px = 11.5;
      ctx.font = `700 ${px}px ${FONT}`;
      while (px > 8.5 && ctx.measureText(rk).width > SIDE - 6) ctx.font = `700 ${(px -= 0.5)}px ${FONT}`;
      ctx.fillText(fit(ctx, rk, SIDE - 6), sx + SIDE / 2, y + BLOCK_H - 9);
    }
    ctx.textAlign = "left";
  }
  ctx.restore();

  // Outline: tier color for Entertaining, hairline otherwise
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineWidth = hl ? 3 : 1;
  ctx.strokeStyle = hl ? color : dim ? "#8d9eac" : "rgba(255,255,255,0.14)";
  if (dim) ctx.setLineDash([5, 4]);
  roundRect(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, BLOCK_H - ctx.lineWidth, 12);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label: matchup, then kickoff · network (or final score)
  const pillW = 46;
  const tx = x + SIDE + 12;
  const room = w - SIDE * 2 - pillW - 34;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#eaf0f4";
  ctx.font = `800 19px ${FONT}`;
  ctx.fillText(fit(ctx, `${a.abbr} @ ${h.abbr}`, room), tx, y + 36);
  ctx.fillStyle = "rgba(234,240,244,0.78)";
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(fit(ctx, g.final ? `Final ${g.final} · ${g.netLabel}` : `${kick(g.minute)} · ${g.netLabel}`, room), tx, y + 58);
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
  ctx.fillText(dim ? `↓ ${g.score}` : String(g.score), px + pillW / 2, py + 16);
  ctx.textAlign = "left";
  ctx.restore();
}



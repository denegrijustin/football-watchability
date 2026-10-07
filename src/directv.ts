// DIRECTV channel numbers for the networks on the board, for a viewer in Overland Park, Kansas (the Kansas City market).
// National channels are the same everywhere; the broadcast networks are the Kansas City locals, which DIRECTV carries at
// their over-the-air numbers: WDAF Fox 4, KCTV CBS 5, KMBC ABC 9, KCWE CW 29, KSHB NBC 41. Streaming-only services
// (ESPN+, Prime Video, Mountain West+) have no channel and show nothing. Keyed by the network slug the slate uses.
// Checked against DIRECTV's published lineup when it can be reached; edit here if a number moves.
export const DIRECTV_MARKET = "Overland Park, KS";

export const DIRECTV: Record<string, { ch: number; name: string }> = {
  espn: { ch: 206, name: "ESPN" },
  espn2: { ch: 209, name: "ESPN2" },
  espnu: { ch: 208, name: "ESPNU" },
  fs1: { ch: 219, name: "FS1" },
  cbssn: { ch: 221, name: "CBS Sports Network" },
  "nfl-net": { ch: 212, name: "NFL Network" },
  "usa-net": { ch: 242, name: "USA Network" },
  tnt: { ch: 245, name: "TNT" },
  btn: { ch: 610, name: "Big Ten Network" },
  "sec-network": { ch: 611, name: "SEC Network" },
  "acc-network": { ch: 612, name: "ACC Network" },
  fox: { ch: 4, name: "FOX (WDAF)" },
  cbs: { ch: 5, name: "CBS (KCTV)" },
  abc: { ch: 9, name: "ABC (KMBC)" },
  cw: { ch: 29, name: "The CW (KCWE)" },
  nbc: { ch: 41, name: "NBC (KSHB)" },
};

/** The channel number, or null when the network has none (streaming) or isn't known. */
export const directvChannel = (slug?: string | null): number | null => (slug ? (DIRECTV[slug]?.ch ?? null) : null);
/** Hover text: "DIRECTV channel 206 · ESPN (Overland Park, KS)". */
export const directvTitle = (slug?: string | null): string | undefined => {
  const d = slug ? DIRECTV[slug] : undefined;
  return d ? `DIRECTV channel ${d.ch} · ${d.name} (${DIRECTV_MARKET})` : undefined;
};

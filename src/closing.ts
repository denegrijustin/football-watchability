// Time left in a live game, and the order the boards list live games in. Pure, so tests can import it.

/**
 * Seconds of game time left in a live game from ESPN's short status ("5:12 - 4th", "2:10 - OT", "End of 3rd"): the 4th quarter and overtime count
 * their clock, the end of the 3rd counts a full quarter, earlier periods count what is left of the game. Null when the status says nothing.
 */
export function secondsLeft(detail: string): number | null {
  const d = detail.trim();
  let m = /^(\d{1,2}):(\d{2})\s*-\s*(\d)(?:st|nd|rd|th)$/i.exec(d);
  if (m) {
    const period = Number(m[3]);
    const clock = Number(m[1]) * 60 + Number(m[2]);
    return period > 4 ? clock : (4 - period) * 900 + clock;
  }
  m = /^(\d{1,2}):(\d{2})\s*-\s*OT$/i.exec(d);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^End of (\d)(?:st|nd|rd|th)$/i.exec(d);
  if (m) return (4 - Number(m[1])) * 900;
  if (/^half(time)?$/i.test(d)) return 1800;
  return null;
}

/** The final stretch: the 4th quarter, the end of the 3rd, or overtime. */
export const inFinalStretch = (detail: string) => {
  const s = secondsLeft(detail);
  return s != null && s <= 900;
};

/**
 * Orders live games for a board: the ones with an upset brewing in the final stretch first, then everything else, each by the time left (the game
 * closest to final first). Games whose clock is unknown go last.
 */
export function closestToFinal<T>(rows: T[], info: (r: T) => { brewing: boolean; detail: string }): T[] {
  const key = (r: T) => {
    const i = info(r);
    const left = secondsLeft(i.detail);
    return [i.brewing && inFinalStretch(i.detail) ? 0 : 1, left ?? Infinity] as const;
  };
  return [...rows].sort((a, b) => {
    const [pa, la] = key(a), [pb, lb] = key(b);
    return pa - pb || (la === lb ? 0 : la < lb ? -1 : 1);
  });
}


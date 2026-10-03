/**
 * Quarter and clock from ESPN's short status ("5:12 - 3rd", "Q3 5:12", "End of 2nd",
 * "Halftime"). Anything else comes back as plain text so nothing is ever dropped.
 */
export function liveStatusParts(detail: string): { period: string; clock: string; text: string } {
  const d = detail.trim();
  const ord = (n: string) => (Number(n) > 4 ? "OT" : `Q${n}`);
  let m = d.match(/^(\d{1,2}:\d{2})\s*-\s*(\d)(?:st|nd|rd|th)$/i); // 5:12 - 3rd
  if (m) return { period: ord(m[2]), clock: m[1], text: "" };
  m = d.match(/^(\d{1,2}:\d{2})\s*-\s*OT$/i); // 2:10 - OT
  if (m) return { period: "OT", clock: m[1], text: "" };
  m = d.match(/^Q(\d)\s+(\d{1,2}:\d{2})$/i); // Q3 5:12
  if (m) return { period: ord(m[1]), clock: m[2], text: "" };
  m = d.match(/^End of (\d)(?:st|nd|rd|th)$/i); // End of 2nd
  if (m) return { period: ord(m[1]), clock: "End", text: "" };
  if (/^half(time)?$/i.test(d)) return { period: "Half", clock: "", text: "" };
  return { period: "", clock: "", text: d };
}


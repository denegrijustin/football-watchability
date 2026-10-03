/**
 * An NFL name split into city and nickname ("Jacksonville " + "Jaguars") so narrow screens can show
 * just the nickname. College names stay whole (the school name is what people look for).
 */
export function nameParts(name: string, league: string): [string, string] {
  if (league !== "NFL") return ["", name];
  const i = name.lastIndexOf(" ");
  return i < 0 ? ["", name] : [name.slice(0, i + 1), name.slice(i + 1)];
}

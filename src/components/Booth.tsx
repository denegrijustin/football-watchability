/** Broadcast crew for a game: play-by-play and analysts in the booth, then sideline and rules. */
export type CrewMember = { name: string; role: string };

const BOOTH = /play-by-play|analyst/;
const join = (names: string[]) =>
  names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;

export function boothText(crew: CrewMember[]) {
  const booth = crew.filter((c) => BOOTH.test(c.role) && !/rules/.test(c.role)).map((c) => c.name);
  const side = crew.filter((c) => /reporter|sideline/.test(c.role)).map((c) => c.name);
  return { booth: join(booth), side: side.length ? join(side) : null };
}

/** "Al Michaels & Kirk Herbstreit · sideline Kaylee Hartung" with roles on hover. */
export function Booth({ crew, as: Tag = "li" }: { crew?: CrewMember[] | null; as?: "li" | "p" }) {
  if (!crew?.length) return null;
  const { booth, side } = boothText(crew);
  return (
    <Tag className="booth" title={crew.map((c) => `${c.name} (${c.role})`).join(", ")}>
      <span className="fact-icon" aria-hidden="true">
        🎙️
      </span>
      <span>
        <span className="sr-only">Announcers: </span>
        {booth || crew.map((c) => c.name).join(", ")}
        {booth && side && <span className="booth-side"> · sideline {side}</span>}
      </span>
    </Tag>
  );
}

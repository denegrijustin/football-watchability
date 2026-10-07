import { Headshot } from "./Headshot";

/** Broadcast crew for a game: play-by-play and analysts in the booth, then sideline. */
export type CrewMember = { name: string; role: string; photo?: string; photoCredit?: string };

const inBooth = (c: CrewMember) => /play-by-play|analyst/.test(c.role) && !/rules/.test(c.role);
const onSide = (c: CrewMember) => /reporter|sideline/.test(c.role);
const sep = (i: number, n: number) => (i === n - 1 ? "" : i === n - 2 ? " & " : ", ");

function People({ list }: { list: CrewMember[] }) {
  return (
    <>
      {list.map((c, i) => (
        <span key={c.name}>
          <span className="booth-person" title={`${c.name} (${c.role})${c.photoCredit ? `\n${c.photoCredit}` : ""}`}>
            <Headshot src={c.photo} name={c.name} size={20} className="booth-head" />
            {c.name}
          </span>
          {sep(i, list.length)}
        </span>
      ))}
    </>
  );
}

/** "🎙️ (photo) Al Michaels & (photo) Kirk Herbstreit · sideline (photo) Kaylee Hartung" */
export function Booth({ crew, as: Tag = "li" }: { crew?: CrewMember[] | null; as?: "li" | "p" }) {
  if (!crew?.length) return <Tag className="booth"><span aria-hidden="true">🎙️ </span><span>Announcers: schedule not yet available</span></Tag>;
  const booth = crew.filter(inBooth);
  const side = crew.filter(onSide);
  return (
    <Tag className="booth">
      <span className="fact-icon" aria-hidden="true">
        🎙️
      </span>
      <span className="booth-people">
        <strong>Announcers: </strong>
        <People list={booth.length ? booth : crew} />
        {booth.length > 0 && side.length > 0 && (
          <span className="booth-side">
            {" "}
            · sideline <People list={side} />
          </span>
        )}
      </span>
    </Tag>
  );
}

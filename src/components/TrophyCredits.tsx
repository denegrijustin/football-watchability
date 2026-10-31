import { trophyPhotos } from "../trophyPhoto";

/** Credits for the trophy photographs (Wikimedia Commons, freely licensed): who took each, under what licence, and where it is from. */
export function TrophyCredits() {
  const photos = trophyPhotos();
  if (!photos.length) return null;
  return (
    <details className="trophy-credits">
      <summary>Trophy photo credits</summary>
      <ul>
        {photos.map(([name, p]) => (
          <li key={name}>
            <b>{name}</b>: <a href={p.page} target="_blank" rel="noreferrer noopener">{p.title ?? "photo"}</a> by {p.author || "unknown"}, {p.license}
          </li>
        ))}
      </ul>
    </details>
  );
}

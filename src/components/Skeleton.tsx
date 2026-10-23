/** Placeholder blocks shaped like what is loading (cards or rows) with a soft shimmer, in place of a "Loading…" line. */
export function Skeleton({ rows = 3, kind = "card" }: { rows?: number; kind?: "card" | "row" }) {
  return (
    <div className={`skel ${kind}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-item" key={i}>
          <span className="skel-line w60" /><span className="skel-line w90" /><span className="skel-line w40" />
        </div>
      ))}
    </div>
  );
}
export const ViewSkeleton = () => <Skeleton rows={4} />;

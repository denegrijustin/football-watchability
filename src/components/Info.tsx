import { useId, useState, type ReactNode } from "react";
import "../details.css";

/**
 * A small (i) beside a heading that opens a short note under it: what the value means and how it was found. Tapping it again closes it.
 * The note is a region the button controls, so it reads in order with the heading for a screen reader.
 */
export function SecHead({ title, info, aside, as: Tag = "h4", id, className = "cd-h" }: { title: ReactNode; info?: { means: ReactNode; how: ReactNode }; aside?: ReactNode; as?: "h3" | "h4"; id?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <>
      <div className="sh-row">
        <Tag className={className} id={id}>{title}</Tag>
        {aside && <span className="sh-aside">{aside}</span>}
        {info && (
          <button type="button" className="info-btn" aria-expanded={open} aria-controls={panel} aria-label={`About ${typeof title === "string" ? title.toLowerCase() : "this"}: what it means and how we found it`} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
            <span aria-hidden="true">i</span>
          </button>
        )}
      </div>
      {info && (
        <div id={panel} className="info-panel" data-open={open || undefined} role="region" aria-label={`About ${typeof title === "string" ? title.toLowerCase() : "this"}`} hidden={!open}>
          <p><b>What it means.</b> {info.means}</p>
          <p><b>How we found it.</b> {info.how}</p>
        </div>
      )}
    </>
  );
}

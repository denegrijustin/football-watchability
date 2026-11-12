import { RELATED, SECTION_DESC, viewLabel } from "../nav/navConfig";
import type { View } from "../data";

/** One compact line under the nav row on every section: what it is for, and the sections most worth opening next. */
export function FeatureIntro({ view, context, onView }: { view: View; context?: string; onView: (v: View) => void }) {
  const desc = SECTION_DESC[view];
  const related = RELATED[view] ?? [];
  if (!desc) return null;
  return (
    <div className="feature-intro" data-feature={view}>
      <p className="fi-desc">
        {desc}
        {context && <span className="fi-ctx"> · {context}</span>}
      </p>
      {related.length > 0 && (
        <nav className="fi-related" aria-label="Related sections">
          <span className="fi-label" aria-hidden="true">Related</span>
          {related.map((v) => (
            <button key={v} type="button" onClick={() => onView(v)}>{viewLabel(v)}</button>
          ))}
        </nav>
      )}
    </div>
  );
}

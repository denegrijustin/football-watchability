import type { ReactNode } from "react";

/**
 * One pattern for the three states a region can be in besides "fine": loading (bars and a line of text), degraded (the content around it still
 * works, something optional is missing) and failed (what failed, in plain words, and what to do). The text is always plain text, never markup.
 */
export function StateNotice({ kind, title, children, actions, compact = false }: {
  kind: "loading" | "degraded" | "failed";
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`state-notice ${kind}${compact ? " compact" : ""}`} role={kind === "failed" ? "alert" : "status"} aria-live={kind === "failed" ? "assertive" : "polite"} data-state={kind}>
      {kind === "loading" && (
        <span className="sn-bars" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
      <div className="sn-text">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="sn-actions">{actions}</div>}
    </div>
  );
}

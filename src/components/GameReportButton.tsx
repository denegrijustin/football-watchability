import { useState } from "react";

export function GameReportButton({ title, date }: { title: string; date: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="game-report-export">
    <button type="button" disabled={busy} onClick={async event => {
      const card = event.currentTarget.closest(".game-card") as HTMLElement | null;
      if (!card) return;
      setBusy(true); setError("");
      try {
        const { downloadGameReport } = await import("../exportGamePdf");
        await downloadGameReport(card, title, date);
      } catch { setError("Unable to export the report. Please try again."); }
      finally { setBusy(false); }
    }}>{busy ? "Creating PDF..." : "Export game report (PDF)"}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

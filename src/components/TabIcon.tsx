/** Small line icons for the phone tab bar (hidden on a computer, where the tabs are text). */
const PATHS: Record<string, string> = {
  board: "M4 5h16v6H4zM4 13h16v6H4z",
  upset: "M5 19l5-7 4 4 5-9M15 7h4v4",
  picks: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  insanity: "M13 3L5 14h6l-1 7 8-11h-6z",
  sim: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  grid: "M4 5h16v14H4zM4 10h16M9 5v14M15 5v14",
  outlook:
    "M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  empire: "M4 20V8l4-3 4 3 4-3 4 3v12zM9 20v-5h6v5",
  spplus: "M4 19V9M10 19V5M16 19v-7M21 19H3",
  nfl: "M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z",
  standings: "M4 6h16M4 12h16M4 18h9M17 16l2 2 3-4",
  injuries: "M9 4h6v5h5v6h-5v5H9v-5H4V9h5z",
  export: "M12 4v11M8 11l4 4 4-4M5 20h14",
  calendar: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4",
};
export function TabIcon({ name }: { name: string }) {
  return (
    <svg
      className="tab-ico"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] ?? PATHS.more} />
    </svg>
  );
}

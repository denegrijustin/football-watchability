import { lazy, type LazyExoticComponent, type ComponentType } from "react";

/** The eight team-performance tabs, in order. Each lives in src/perf/tabs/<File>.tsx and reads everything through ../engine and ../data. */
export const PERF_TABS = [
  { key: "p-profile", label: "Team Profile", question: "What kind of team is this?" },
  { key: "p-drives", label: "Drives", question: "How do possessions turn into points, or stall?" },
  { key: "p-trends", label: "Trends", question: "Is this team getting better?" },
  { key: "p-situations", label: "Situations", question: "When does this team succeed or struggle?" },
  { key: "p-bigplays", label: "Big Plays", question: "Is this team consistently effective, or does it depend on big gains?" },
  { key: "p-finishing", label: "Finishing Drives", question: "Does this team turn opportunities into touchdowns?" },
  { key: "p-matchup", label: "Matchup", question: "Where does each team have an advantage?" },
  { key: "p-field", label: "Field Position & Turnovers", question: "How much are short fields and turnovers affecting results?" },
] as const;
export type PerfKey = (typeof PERF_TABS)[number]["key"];
export const isPerfKey = (k: string): k is PerfKey => PERF_TABS.some((t) => t.key === k);

export const PERF_VIEWS: Record<PerfKey, LazyExoticComponent<ComponentType>> = {
  "p-profile": lazy(() => import("./tabs/Profile")),
  "p-drives": lazy(() => import("./tabs/Drives")),
  "p-trends": lazy(() => import("./tabs/Trends")),
  "p-situations": lazy(() => import("./tabs/Situations")),
  "p-bigplays": lazy(() => import("./tabs/BigPlays")),
  "p-finishing": lazy(() => import("./tabs/Finishing")),
  "p-matchup": lazy(() => import("./tabs/Matchup")),
  "p-field": lazy(() => import("./tabs/FieldPosition")),
};

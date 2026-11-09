import type { FilterState, View } from "../data";

/**
 * The single source of truth for navigation: the five categories, what each one holds, which View each entry opens, and the labels and
 * descriptions. View ids, data-tab values and the Games status ids are the app's own and are not renamed here.
 */
export type CategoryId = "games" | "teams" | "rankings" | "analytics" | "more";
export type Status = FilterState["status"];

type Base = { id: string; label: string; desc: string };
/** Opens a View (`data-tab` is the View id). `board` also clears the Games status filter when pressed on the board itself. */
export type ViewItem = Base & { kind: "view"; view: View };
/** Opens the Games dashboard with the existing status filter set (`data-status`). */
export type StatusItem = Base & { kind: "status"; status: Exclude<Status, "all"> };
/** A file download or an external page. */
export type LinkItem = Base & { kind: "link"; href: string; download?: string; external?: boolean };
/** Something that already exists elsewhere on the page: it is shown to the reader, not rebuilt (`data-action`). */
export type ActionItem = Base & { kind: "action"; action: "game-center" | "time-zone" | "how-to" | "about" };
export type NavItem = ViewItem | StatusItem | LinkItem | ActionItem;
export type NavGroup = { label?: string; items: NavItem[] };
export type NavCategory = { id: CategoryId; label: string; icon: string; groups: NavGroup[] };

const v = (view: View, label: string, desc: string): ViewItem => ({ kind: "view", id: view, view, label, desc });

export const CATEGORIES: NavCategory[] = [
  {
    id: "games",
    label: "Games",
    icon: "board",
    groups: [
      {
        items: [
          v("board", "Watchability dashboard", "Every game ranked by how worth watching it should be"),
          { kind: "status", id: "live", status: "live", label: "Live games", desc: "In progress now" },
          { kind: "status", id: "upcoming", status: "upcoming", label: "Upcoming games", desc: "Still to play, by kickoff slot" },
          { kind: "status", id: "final", status: "final", label: "Completed games", desc: "Finished games: forecast against what happened" },
          v("grid", "TV Grid", "Every kickoff slot and channel in one grid"),
          { kind: "action", id: "game-center", action: "game-center", label: "Game Center", desc: "Opens the top game: plays, drives, odds and injuries" },
        ],
      },
    ],
  },
  {
    id: "teams",
    label: "Teams",
    icon: "teams",
    groups: [
      {
        items: [
          v("teams", "Team Profiles", "One page per team: schedule, record, ratings and performance"),
          v("injuries", "Injuries", "Who is hurt, when he is likely back, and how much it matters"),
          v("trades", "Trade Finder", "A realistic trade for every player, with the cap and roster limits"),
        ],
      },
    ],
  },
  {
    id: "rankings",
    label: "Rankings",
    icon: "standings",
    groups: [
      {
        items: [
          v("standings", "Standings", "Standings and playoff picture: divisions, conferences, seeds, tracker and bowls"),
          v("resumes", "Team Resumés", "Best wins, bad losses, strength of schedule, offense and defense ranks"),
          v("spplus", "CFB SP+", "College ratings, a matchup simulator and an against-the-spread tracker"),
          v("nfl", "NFL+", "EPA-based NFL ratings, a matchup simulator and an against-the-spread tracker"),
        ],
      },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "spplus",
    groups: [
      {
        items: [
          v("insanity", "Insanity", "The wildest games and results, ranked"),
          v("empire", "Empire", "Imperialism Map: territory changes hands as teams win"),
          v("picks", "ATS & Parlays", "Picks and parlays, the game simulator, the Upset Alert Meter and the full ATS tracker"),
        ],
      },
    ],
  },
  {
    id: "more",
    label: "More",
    icon: "more",
    groups: [
      {
        label: "Export",
        items: [
          { kind: "link", id: "csv", label: "Spreadsheet (CSV)", desc: "Every game with all the numbers, times Central", href: "/exports/watch-slate.csv" },
          { kind: "link", id: "ics", label: "Calendar (.ics)", desc: "Entertaining games as calendar events", href: "/exports/entertaining.ics", download: "entertaining-games.ics" },
        ],
      },
      {
        label: "Settings and help",
        items: [
          { kind: "action", id: "time-zone", action: "time-zone", label: "Change time zone", desc: "Choose the zone kickoff times are shown in" },
          { kind: "action", id: "how-to", action: "how-to", label: "How to read a card", desc: "What the score, the stakes and the rank line mean" },
          { kind: "action", id: "about", action: "about", label: "About and methodology", desc: "How the board is built, where the data comes from, credits" },
        ],
      },
      {
        label: "Resources",
        items: [
          { kind: "link", id: "espn", label: "ESPN", desc: "Scores, schedules and FPI ratings (opens in a new tab)", href: "https://www.espn.com/", external: true },
          { kind: "link", id: "nflverse", label: "nflverse", desc: "Open NFL data behind NFL+ (opens in a new tab)", href: "https://nflverse.nflverse.com/", external: true },
        ],
      },
    ],
  },
];

/** Views that are reached from inside another page (not from the menus) and which category they belong to. */
const EXTRA: Partial<Record<View, CategoryId>> = { outlook: "rankings", sim: "analytics", upset: "analytics" };

/** The category a view belongs to. The Games category also owns the board. */
export function categoryOf(view: View): CategoryId {
  if (EXTRA[view]) return EXTRA[view]!;
  for (const c of CATEGORIES) for (const g of c.groups) for (const i of g.items) if (i.kind === "view" && i.view === view) return c.id;
  return "games";
}

/** Every View id the address bar may name. Anything else opens the board. */
export const VIEW_IDS: readonly View[] = [
  "board", "picks", "grid", "insanity", "outlook", "empire", "spplus", "nfl", "sim", "upset", "injuries", "standings", "resumes", "teams", "trades",
];
export const isView = (s: string | null): s is View => !!s && (VIEW_IDS as readonly string[]).includes(s);
export const STATUSES = ["live", "upcoming", "final"] as const;
export const isStatus = (s: string | null): s is Exclude<Status, "all"> => !!s && (STATUSES as readonly string[]).includes(s);

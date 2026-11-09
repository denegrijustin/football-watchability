# Navigation, phase 1

Information architecture only. No page, data model, route name, View id, API id or `data-tab` value was renamed, and no scoring, data,
card, Game Center, filter, sort or export logic was touched.

Principle: any major feature is at most two interactions away (open a category, choose a destination).

## Before and after

| Destination | View id / entry | Before | After |
|---|---|---|---|
| Watchability dashboard | `board` | Games tab | Games > Watchability dashboard |
| Live / Upcoming / Completed games | `filters.status` = `live` / `upcoming` / `final` | chips and a Status select on the board | Games > Live games, Upcoming games, Completed games (same filter; chips and select stay) |
| TV Grid | `grid` | More | Games > TV Grid |
| Game Center | per-game dialog | card buttons only | Games > Game Center (opens the top game, see below); card buttons unchanged |
| Team profiles, schedules, records | `teams` | Teams tab | Teams > Team Profiles |
| Injuries | `injuries` | More | Teams > Injuries |
| Trades | `trades` | More | Teams > Trade Finder |
| Standings (and Playoff picture) | `standings` (`outlook`) | Standings tab | Rankings > Standings |
| Team resumés (and Fraud meter) | `resumes` | More | Rankings > Team Resumés |
| CFB SP+ | `spplus` | More | Rankings > CFB SP+ |
| NFL+ | `nfl` | More | Rankings > NFL+ |
| Insanity | `insanity` | More | Analytics > Insanity |
| Empire | `empire` | More | Analytics > Empire |
| ATS & Parlays (picks, simulator, Upset Alert Meter, ATS tracker) | `picks` (`sim`, `upset`) | ATS & Parlays tab | Analytics > ATS & Parlays |
| Export CSV / calendar | header Export menu and More sheet (two copies) | two places | More > Export (one place) |
| Time zone | header select | header only | header select stays; More > Time zone moves focus to it |
| How to read a card | header popover | header only | stays; More > How to read a card opens it |
| About / methodology / credits | footer details | footer only | stays; More > About and methodology opens it |
| External resources | none | none | More > Resources: ESPN, nflverse (new tab) |

Hidden views `outlook`, `sim` and `upset` never had a button. They still open through the `fbwatch:open-view` event and the address bar,
and light the entry they belong to (Standings, ATS & Parlays).

### Decisions on ambiguous placements

* **Trades** under Teams (roster and cap tool: pick a team, then a player). NFL data; the page has no league toggle.
* **Empire** under Analytics as briefed. It is the weakest fit; More would also be defensible.
* **CFB SP+ / NFL+** under Rankings: the first tab of each is a ratings table. Their simulators, ATS trackers and internal state are untouched.
* **Fraud meter** stays a sub-tab of Team Resumés. **Simulator and Upset Alert Meter** stay sub-tabs of the ATS & Parlays hub, so the hub's
  "Picks area" group is unchanged; the hub is the destination and its tabs are its content, as before.
* **Playoff picture** stays inside Standings.
* **League** is a global filter on the board, not a destination; it is not in the menus.
* **Time zone, How to read a card, About** keep their original controls. The More entries do not rebuild them: they open or focus the existing
  control (the time zone select, `details#how-to-read`, `details#about-slate`).
* **Export** has one implementation: the More menu. The header "Export" dropdown and the phone-only copies were removed. The TV grid's own
  image export is a different feature and stays.
* **Game Center** is a dialog for one game, so it cannot be a page. Games > Game Center goes to the dashboard and opens the Game Center through the
  same `useOpenGame()` the GC buttons use, for the top game under the current filters: a closing-upset or live game first, else the most
  watchable upcoming game, else the latest finished one. With no game, the menu stays open with a one-line hint.
* **Status entries** use the existing filter update. Choosing the active one again clears it, like the chips. "Watchability dashboard"
  while on the board clears the status; from another section it keeps the reader's filters.
* The old sliding-underline animation between tabs was dropped; the current category has a static bar.

## Desktop and tablet (761px and up)

One row under the filters (sticky under the ticker, header and filters as before): Games, Teams, Rankings, Analytics, More. Each is a button that
opens a dropdown of its destinations with a short description. The current category has brighter text and a bar under it; the current entry
has `aria-current="page"`, a lime left bar and a tint. No icons on desktop. A closed menu is hidden with `visibility`, so every destination
always exists in the page.

Keyboard: Enter/Space opens a menu; ArrowDown/ArrowUp on the button opens it and focuses the first/last entry; ArrowDown/ArrowUp/Home/End move
among entries; ArrowLeft/ArrowRight/Home/End on the buttons move between categories (an open menu moves with them); Escape closes and returns
focus to the button; Tab walks the entries and closes the menu when focus leaves; choosing an entry closes the menu and returns focus to
its button. Nothing opens on hover. One menu at a time; a click or focus outside closes it.

## Phone (760px and under)

The same five buttons form a bar fixed to the bottom (existing TabIcon icons, label under each, 56px tall, safe-area insets). Each opens a
sheet above the bar with the same entries and descriptions; the sheet scrolls inside itself on a short screen, a scrim covers the page
behind it, and the page keeps its bottom padding so the bar never hides content. Games is the default. No sideways scroll.

## URL scheme

`?view=<View id>` (omitted for the board) and `?status=live|upcoming|final` (board only; omitted for all games). Other parameters (`league`,
...) are kept. A navigation by the reader pushes a history entry, so Back and Forward restore the section and status; the first load and
filter changes from the board's own controls only rewrite the current entry. The address wins over the `fbwatch-resume` hint. An unknown
`view` opens the board and the address is cleaned. SP+/NFL+ internal routing is untouched. `league` is read at load as before and is not
rewritten.

## Accessibility

`<nav aria-label="Primary">`; category buttons have `aria-expanded`, `aria-controls` and `aria-current="true"` for the current section;
menus are `role="group"` named by the category; entries are real `<button>` (or `<a>` for downloads and external links) with `aria-label`
equal to the label and the description in `aria-describedby`; the current entry has `aria-current="page"`. Visible focus ring is the site's.
Motion stops under `prefers-reduced-motion` and `html[data-motion="off"]`. Targets are 44px or more. Colours are the existing tokens.

## Testing notes

* Selectors: `nav.site-nav[aria-label="Primary"]`, `.nav-trigger[data-category=games|teams|rankings|analytics|more]`, `#nav-panel-<category>`,
  `.nav-item[data-tab=<View id>]`, `.nav-item[data-status=live|upcoming|final]`, `.nav-item[data-action=game-center|time-zone|how-to|about]`.
* `tests/fixtures.ts` lays the menus out open and inline for every test except those titled `@phone` or `@nav`; `openSection(page, view)`
  opens a category and then the entry, as a reader does.
* `.view-switch`, `.tab-more`, `#more-sheet`, `.more-export` and `.export-btns` no longer exist; tests that used them moved to the new
  equivalents with the same assertions.

# Navigation, phase 1

Information architecture only. No page, data model, route name, View id, API id or `data-tab` value was renamed, and no scoring, data,
card, Game Center, filter, sort or export logic was touched.

Principle: any major feature is at most two interactions away (open a category, choose a destination).

## Before and after

| Destination | View id / entry | Before | After |
|---|---|---|---|
| Watchability Dashboard | `board` | Games tab | Games > Watchability Dashboard |
| Live / Upcoming / Completed Games | `filters.status` = `live` / `upcoming` / `final` | chips and a Status select on the board | Games > Live Games, Upcoming Games, Completed Games (same filter; chips and select stay) |
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
| Time zone | header select | header only | header select stays; More > Change Time Zone moves focus to it |
| How to Read a Card | header popover | header only | stays; More > How to Read a Card opens it |
| About / methodology / credits | footer details | footer only | stays; More > About & Methodology opens it |
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
* **Time zone (menu entry: "Change Time Zone", so it does not share an accessible name with the header select), How to Read a Card, About** keep their original controls. The More entries do not rebuild them: they open or focus the existing
  control (the time zone select, `details#how-to-read`, `details#about-slate`).
* **Export** has one implementation: the More menu. The header "Export" dropdown and the phone-only copies were removed. The TV grid's own
  image export is a different feature and stays.
* **Game Center** is a dialog for one game, so it cannot be a page. Games > Game Center goes to the dashboard and opens the Game Center through the
  same `useOpenGame()` the GC buttons use, for the top game under the current filters: a closing-upset or live game first, else the most
  watchable upcoming game, else the latest finished one. With no game, the menu stays open with a one-line hint.
* **Labels** are Title Case like the category names (ESPN and nflverse keep their own spelling). The page's own headings and chips keep their wording.
* **Status entries** use the existing filter update. Choosing the active one again clears it, like the chips. "Watchability Dashboard"
  while on the board clears the status; from another section it keeps the reader's filters.
* The old sliding-underline animation between tabs was dropped; the current category has a static bar.

## Desktop and tablet (761px and up)

One row under the filters (sticky under the ticker, header and filters as before): Games, Teams, Rankings, Analytics, More. Each is a button that
opens a dropdown of its destinations with a short description. The current category has brighter text and a bar under it; the current entry
has `aria-current="page"`, a lime left bar and a tint. No icons on desktop. A closed menu is hidden with `visibility`, so every destination
always exists in the page.

A dropdown hangs from the left edge of its own button. Between 761px and 900px the last two (Analytics, More) open towards the left instead so
they never run past the window. Its height is limited from its real top (`--nav-panel-top`, set from the button's position while it is open and
updated on resize and scroll) to 12px above the bottom of the window, and it scrolls inside itself, so the last entry is reachable on a short
screen such as 812x375.

Keyboard: Enter/Space opens a menu; ArrowDown/ArrowUp on the button opens it and focuses the first/last entry; ArrowDown/ArrowUp/Home/End move
among entries; ArrowLeft/ArrowRight/Home/End on the buttons move between categories (an open menu moves with them); Escape closes and returns
focus to the button; Tab walks the entries and closes the menu when focus leaves; choosing an entry closes the menu and returns focus to
its button. Nothing opens on hover. One menu at a time; a click or focus outside closes it.

## Phone (760px and under)

The same five buttons form a bar fixed to the bottom (existing TabIcon icons, label under each, 56px tall, safe-area insets). Each opens a
sheet above the bar with the same entries and descriptions; the sheet scrolls inside itself on a short screen, a scrim covers the page
behind it (the sheet and scrim use `overscroll-behavior: contain`; the page is not scroll-locked), and the page keeps its bottom padding and
`scroll-padding-bottom` (84px plus the safe area) so the bar never hides content or a focused element. The bar is 97% opaque with a blur and
`viewport-fit=cover` is set so the safe-area insets work. Games is the default. No sideways scroll.

DOM order and visual order: the markup is the same everywhere, `<nav>` inside `.view-row` in `#games`, after the filters and before the
section content. On a phone the bar is fixed to the bottom of the screen, so a screen reader and the Tab key reach it before the section
content although it is drawn after it. This is deliberate (the five buttons are the first thing in the section, one landmark, no duplicate
copy for a phone) and the skip link "Skip to games" still jumps past the filters. "More > How to Read a Card" scrolls the popover into view above the bar.

## URL scheme

`?view=<View id>` (omitted for the board) and `?status=live|upcoming|final` (board only; omitted for all games). Other parameters (`league`,
...) are kept. A navigation by the reader pushes a history entry, so Back and Forward restore the section and status; the first load and
filter changes from the board's own controls only rewrite the current entry. The address wins over the `fbwatch-resume` hint. An unknown
`view` opens the board and the address is cleaned. SP+/NFL+ internal routing is untouched. `league` is read at load as before and is not
rewritten.

## Accessibility

`<nav aria-label="Primary">`; category buttons have `aria-expanded`, `aria-controls` and `aria-current="true"` for the current section;
menus are `role="group"` named "<Category> menu" (so it differs from its button); entries are real `<button>` (or `<a>` for downloads and
external links) named by their visible label (`aria-labelledby` the label, no `aria-label`) with the description and, for the status
entries and the dashboard, the count in `aria-describedby`; groups inside More are `<div role="group" aria-labelledby>` (no extra landmarks);
the current entry has `aria-current="page"`. The "no game" hint is an always-present empty `role="status"` region that is filled.
`document.title` follows the section ("Injuries | Football Watchability"; the board keeps "Football Watchability | The weekly board") and an
always-present visually hidden `aria-live="polite"` region in the nav says the new section's name after a change (not on the first load);
focus is not moved. Games > Game Center puts focus on the Games button before the dialog opens, so closing the dialog returns there. Visible focus ring is the site's.
Motion stops under `prefers-reduced-motion` and `html[data-motion="off"]`. Targets are 44px or more. Colours are the existing tokens.

## Testing notes

* Selectors: `nav.site-nav[aria-label="Primary"]`, `.nav-trigger[data-category=games|teams|rankings|analytics|more]`, `#nav-panel-<category>`,
  `.nav-item[data-tab=<View id>]`, `.nav-item[data-status=live|upcoming|final]`, `.nav-item[data-action=game-center|time-zone|how-to|about]`. Entries are found by `data-*`, `href` or their label (no `aria-label` attribute).
* `tests/fixtures.ts` lays the menus out open and inline for every test except those titled `@phone` or `@nav`; `openSection(page, view)`
  opens a category and then the entry, as a reader does.
* `.view-switch`, `.tab-more`, `#more-sheet`, `.more-export` and `.export-btns` no longer exist; tests that used them moved to the new
  equivalents with the same assertions.

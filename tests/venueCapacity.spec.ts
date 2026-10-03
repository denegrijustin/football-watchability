import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { altSiteCapacity, buildIndex, lookupCapacity, parseTables, stadiumRows, stateCode } from "../scripts/venue-capacity.mjs";

// Shaped like the tables on Wikipedia's stadium lists: header cells, footnote markers, shared stadiums
// (rowspan), en dashes, non-breaking spaces and entities.
const NFL = `
<table class="wikitable sortable"><tbody>
<tr><th>Image</th><th>Stadium</th><th>Capacity</th><th>Location</th><th>Surface</th><th>Team(s)</th><th>Opened</th></tr>
<tr><td rowspan="2"><img src="x.jpg"></td><td rowspan="2"><a href="/wiki/MetLife_Stadium">MetLife Stadium</a></td><td rowspan="2">82,500<sup class="reference">[1]</sup></td><td rowspan="2">East Rutherford, New Jersey</td><td rowspan="2">Turf</td><td><a>New York Giants</a></td><td>2010</td></tr>
<tr><td><a>New York Jets</a></td><td>2010</td></tr>
<tr><td><img></td><td><a>Huntington Bank Field</a></td><td>67,431</td><td>Cleveland, Ohio</td><td>Grass</td><td>Cleveland Browns</td><td>1999</td></tr>
<tr><td><img></td><td>U.S. Bank Stadium</td><td>66,860&nbsp;(expandable to 73,000)</td><td>Minneapolis, Minnesota</td><td>Turf</td><td>Minnesota Vikings</td><td>2016</td></tr>
</tbody></table>`;

const FBS = `
<table class="wikitable"><tbody>
<tr><th>Image</th><th>Stadium</th><th>City</th><th>State</th><th>Team</th><th>Conference</th><th>Capacity</th><th>Opened</th></tr>
<tr><td></td><td>Michigan Stadium</td><td>Ann Arbor</td><td>Michigan</td><td>Michigan</td><td>Big Ten</td><td>107,601<sup>[a]</sup></td><td>1927</td></tr>
<tr><td></td><td>Jordan&#8211;Hare Stadium</td><td>Auburn</td><td>Alabama</td><td>Auburn</td><td>SEC</td><td>88,043</td><td>1939</td></tr>
<tr><td></td><td>Tiger Stadium</td><td>Baton Rouge</td><td>Louisiana</td><td>LSU</td><td>SEC</td><td>102,321</td><td>1924</td></tr>
<tr><td></td><td>Tiger Stadium</td><td>Columbia</td><td>Missouri</td><td>(none)</td><td>High school</td><td>5,000</td><td>1950</td></tr>
<tr><td></td><td>Memorial Stadium</td><td>Clemson</td><td>South Carolina</td><td>Clemson</td><td>ACC</td><td>81,500</td><td>1942</td></tr>
<tr><td></td><td>Memorial Stadium</td><td>Lincoln</td><td>Nebraska</td><td>Nebraska</td><td>Big Ten</td><td>85,458</td><td>1923</td></tr>
<tr><td></td><td>Saint Mary&#39;s Field</td><td>Moraga</td><td>California</td><td>x</td><td>y</td><td>11,000</td><td>1</td></tr>
<tr><td></td><td>No Capacity Park</td><td>Nowhere</td><td>Ohio</td><td>x</td><td>y</td><td>TBD</td><td>1</td></tr>
</tbody></table>
<table class="wikitable"><tbody><tr><th>Team</th><th>Coach</th></tr><tr><td>Michigan</td><td>Someone</td></tr></tbody></table>`;

const index = buildIndex([...stadiumRows(NFL), ...stadiumRows(FBS)]);
const cap = (name: string, state?: string) => lookupCapacity(index, { name, state });

test("tables are read with their shared cells, footnotes and entities", () => {
  const [grid] = parseTables(NFL);
  expect(grid[0].slice(0, 3)).toEqual(["Image", "Stadium", "Capacity"]);
  // The Jets row sits under MetLife's rowspan cells: the stadium and capacity carry down.
  expect(grid[2].slice(1, 4)).toEqual(["MetLife Stadium", "82,500", "East Rutherford, New Jersey"]);
  expect(grid[2][5]).toBe("New York Jets");
  expect(parseTables(FBS)[0][2][1]).toBe("Jordan–Hare Stadium"); // &#8211; decoded
});

test("stadium rows come from tables with a stadium and a capacity column, and skip the rest", () => {
  const rows = [...stadiumRows(NFL), ...stadiumRows(FBS)];
  const names = rows.map((r) => r.name);
  expect(names).toContain("MetLife Stadium");
  expect(names.filter((n) => n === "MetLife Stadium")).toHaveLength(2); // one row per team: same stadium, same capacity
  expect(names).not.toContain("No Capacity Park"); // "TBD" is not a capacity
  expect(rows.find((r) => r.name === "U.S. Bank Stadium")!.capacity).toBe(66860); // first number, footnote text ignored
  expect(rows.find((r) => r.name === "Michigan Stadium")).toMatchObject({ capacity: 107601, state: "MI" });
  expect(rows.find((r) => r.name === "Huntington Bank Field")).toMatchObject({ capacity: 67431, state: "OH" }); // state from "Location"
  expect(stadiumRows("<p>no tables here</p>")).toEqual([]);
});

test("a stadium is matched by name; names used by several stadiums need their state", () => {
  expect(cap("Michigan Stadium")).toBe(107601);
  expect(cap("Huntington Bank Field", "OH")).toBe(67431);
  expect(cap("MetLife Stadium", "NJ")).toBe(82500); // two teams, one stadium
  expect(cap("Jordan-Hare Stadium")).toBe(88043); // hyphen in ESPN, en dash on Wikipedia
  expect(cap("The Michigan Stadium")).toBe(107601);
  expect(cap("Saint Mary's Field")).toBe(11000);
  expect(cap("St. Mary's Field")).toBe(11000);
  expect(cap("Memorial Stadium (Clemson)", undefined)).toBeNull(); // not in the lists under that name
  // Same name in several states: the state decides, and no state means no guess.
  expect(cap("Tiger Stadium", "LA")).toBe(102321);
  expect(cap("Tiger Stadium", "MO")).toBe(5000);
  expect(cap("Tiger Stadium")).toBeNull();
  expect(cap("Tiger Stadium", "TX")).toBeNull();
  expect(cap("Memorial Stadium", "NE")).toBe(85458);
  expect(cap("Memorial Stadium", "SC")).toBe(81500);
  expect(cap("Memorial Stadium")).toBeNull();
  // Not in the lists: nothing.
  expect(cap("Pitbull Stadium", "FL")).toBeNull();
  expect(cap("")).toBeNull();
});

test("state names and abbreviations both become codes", () => {
  expect(stateCode("Michigan")).toBe("MI");
  expect(stateCode("MI")).toBe("MI");
  expect(stateCode("East Rutherford, New Jersey")).toBe("NJ");
  expect(stateCode("New Mexico[b]")).toBe("NM");
  expect(stateCode("Ontario")).toBe("");
  expect(stateCode(undefined)).toBe("");
});

test("alternate-site stadiums match by name or alias, US ones also by state, approximate ones never", async () => {
  const sites = JSON.parse(readFileSync("scripts/venue-capacity-alt-sites.json", "utf8"));
  expect(sites.length).toBeGreaterThan(25);
  expect(altSiteCapacity(sites, { name: "Aviva Stadium", state: null })).toBe(51700);
  expect(altSiteCapacity(sites, { name: "Citrus Bowl", state: "FL" })).toBe(60219);
  expect(altSiteCapacity(sites, { name: "War Memorial Stadium", state: "AR" })).toBe(54120);
  expect(altSiteCapacity(sites, { name: "War Memorial Stadium", state: "WY" })).toBeNull(); // Wyoming's, not Little Rock's
  expect(altSiteCapacity(sites, { name: "Yankee Stadium", state: "NJ" })).toBeNull();
  expect(altSiteCapacity(sites, { name: "Wembley Stadium", state: null })).toBeNull(); // listed as a range
  expect(altSiteCapacity(sites, { name: "Bristol Motor Speedway", state: "TN" })).toBeNull(); // record crowd, not seats
});

#!/usr/bin/env python3
"""Build src/data/imperialism.json (see SCHEMA.md).

Env overrides: RAW_DIR (default data-raw), OUT_FILE (default src/data/imperialism.json),
GEO_DIR (default scripts/imperialism; holds counties.json + stadiums.json), NOW (pins generatedAt).
Paths are relative to the repo root. Standard library only.
"""
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def path(env, default):
    p = os.environ.get(env, default)
    return p if os.path.isabs(p) else os.path.join(ROOT, p)


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def espn_teams(doc):
    """{id: team dict} from an ESPN team-list document."""
    return {str(t["team"]["id"]): t["team"] for t in doc["sports"][0]["leagues"][0]["teams"]}


def pick_logo(team):
    logos = team.get("logos") or []
    for lg in logos:
        if "500-dark" in lg.get("href", ""):
            return lg["href"]
    return logos[0]["href"] if logos else None


def hexcolor(c, default):
    return "#" + c.lower() if c else default


def cfb_conf(group):
    """Conference label: shortName, with both Sun Belt divisions merged and independents named."""
    name = group.get("name", "")
    short = group.get("shortName") or name
    if short.startswith("Sun Belt"):
        return "Sun Belt"
    if "Independent" in name or "Indep" in short:
        return "Independent"
    return short


def build_league(league, teams_doc, fpi_doc, stadiums, logo_ids):
    """Return (team metadata list, skipped list) for FBS/NFL teams that have stadiums."""
    all_teams = espn_teams(teams_doc)
    out, skipped = [], []
    for entry in fpi_doc["teams"]:
        ft = entry["team"]
        tid = str(ft["id"])
        st = stadiums.get(tid)
        if not st or st.get("lat") is None or st.get("lon") is None:
            skipped.append(ft.get("displayName", tid))
            print("WARNING: %s team %s (%s) has no stadium entry; skipped" % (league, tid, ft.get("displayName")))
            continue
        t = all_teams.get(tid, ft)
        group = ft.get("group") or {}
        if league == "NFL":
            conf = (group.get("parent") or {}).get("abbreviation")
            division = group.get("name")
        else:
            conf, division = cfb_conf(group), None
        out.append({
            "id": tid,
            "name": t.get("displayName") or ft.get("displayName"),
            "abbr": t.get("abbreviation") or ft.get("abbreviation"),
            "color": hexcolor(t.get("color") or ft.get("color"), "#444444"),
            "altColor": hexcolor(t.get("alternateColor") or ft.get("alternateColor"), "#ffffff"),
            "logo": pick_logo(t) or pick_logo(ft),
            "logoId": logo_ids.get(tid),
            "conf": conf,
            "division": division,
            "stadium": st.get("stadium"),
            "lat": st["lat"],
            "lon": st["lon"],
        })
    out.sort(key=lambda x: x["id"])
    return out, skipped


def main():
    raw = path("RAW_DIR", "data-raw")
    out_file = path("OUT_FILE", "src/data/imperialism.json")
    geo = path("GEO_DIR", "scripts/imperialism")

    counties = load(os.path.join(geo, "counties.json"))
    stadiums = load(os.path.join(geo, "stadiums.json"))
    nfl_docs = load(os.path.join(raw, "nfl-teams.json"))
    nfl_names = {t["displayName"] for t in espn_teams(nfl_docs).values()}

    # logoId by (league, espnId): NFL entries are those whose team name is an NFL team.
    logo_ids = {"CFB": {}, "NFL": {}}
    logo_path = os.path.join(ROOT, "src/data/logo-sources.json")
    if os.path.exists(logo_path):
        for lg in load(logo_path).get("logos", []):
            lge = "NFL" if lg.get("team") in nfl_names else "CFB"
            logo_ids[lge][str(lg["espnId"])] = lg["logoId"]

    leagues = {}
    season = None
    for league, prefix in (("CFB", "cfb"), ("NFL", "nfl")):
        teams_doc = nfl_docs if league == "NFL" else load(os.path.join(raw, "cfb-teams.json"))
        fpi = load(os.path.join(raw, prefix + "-fpi.json"))
        teams, _ = build_league(league, teams_doc, fpi, stadiums.get(league, {}), logo_ids[league])
        fin_path = os.path.join(raw, prefix + "-finals.json")
        if os.path.exists(fin_path):
            fin = load(fin_path)
            games = fin.get("games", [])
            season = season or fin.get("season")
        else:
            games = []
            print("NOTE: %s missing; building %s with zero games (week 0 only)" % (fin_path, league))
        leagues[league] = (teams, games)

    now = os.environ.get("NOW") or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if season is None:
        season = int(now[:4])

    maps, weeks, teams_out = {}, {}, {}
    for league, (teams, games) in leagues.items():
        teams_out[league] = teams
        weeks[league] = [{"n": 0, "label": "Start"}] + [{"n": n, "label": l} for n, l in engine.week_list(games)]

    # CFB: national run + conference view
    cfb, cfb_games = leagues["CFB"]
    national = engine.run_layer("national", "National map", "CFB", cfb, counties, cfb_games)
    conf = engine.conference_layer(national, {t["id"]: t["conf"] for t in cfb}, national["home"])
    maps["CFB"] = {"national": national, "conference": conf}

    # NFL: full league plus independent AFC / NFC spaces
    nfl, nfl_games = leagues["NFL"]
    full = engine.run_layer("full", "Full league", "NFL", nfl, counties, nfl_games)
    nfl_maps = {"full": full}
    for c in ("AFC", "NFC"):
        sub = [t for t in nfl if t["conf"] == c]
        nfl_maps[c] = engine.run_layer(c, c, "NFL", sub, counties, nfl_games)
    maps["NFL"] = nfl_maps

    doc = {"version": 1, "season": season, "generatedAt": now,
           "counties": [c["id"] for c in counties],
           "teams": teams_out, "weeks": weeks, "maps": maps}
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)

    print("Teams: CFB %d, NFL %d" % (len(cfb), len(nfl)))
    for league, group in maps.items():
        for k, layer in group.items():
            if "ledger" not in layer:
                continue
            moved = sum(len(t["transferred"]) for t in layer["ledger"])
            print("  %s/%s: %d games applied, %d counties moved" % (league, k, len(layer["ledger"]), moved))
    print("Wrote %s (%d bytes)" % (out_file, os.path.getsize(out_file)))


if __name__ == "__main__":
    main()

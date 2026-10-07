"""Imperialism engine: pure functions, no file I/O (see SCHEMA.md for the data contract).

Concepts
* A *layer* is an independent logic space (a set of teams). Every county starts with the
  layer team whose stadium is nearest (a Voronoi partition sampled at county centroids).
* Games are replayed in (date, id) order. When both teams are in the layer, the loser's
  ENTIRE current holdings pass to the winner. Ties and out-of-layer games change nothing.
"""
import math

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in kilometres between two lat/lon points (degrees)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def allocate_home(counties, teams):
    """Return a list (one entry per county) with the id of the nearest team stadium.

    counties: [{lat, lon, ...}]; teams: [{id, lat, lon, ...}].
    Ties in distance are broken by the smaller team id (string order), so the result
    is deterministic regardless of input order.
    """
    ordered = sorted(teams, key=lambda t: str(t["id"]))  # iteration order = tie-break order
    home = []
    for c in counties:
        best_id, best_d = None, None
        for t in ordered:
            d = haversine_km(c["lat"], c["lon"], t["lat"], t["lon"])
            if best_d is None or d < best_d:  # strict '<' keeps the earlier (smaller) id on ties
                best_id, best_d = str(t["id"]), d
        home.append(best_id)
    return home


def _snapshot(owners, team_ids, n, label):
    """Week summary: holdings per team (landless omitted) and the landless team ids."""
    counts = {}
    for o in owners:
        counts[o] = counts.get(o, 0) + 1
    return {
        "n": n,
        "label": label,
        "holdings": {t: counts[t] for t in team_ids if t in counts},
        "landless": [t for t in team_ids if t not in counts],
    }


def _game_order(g):
    return (g.get("date") or "", str(g.get("id")))


def week_list(games):
    """[(week number, label)] ascending, for every week present in `games` (in-layer or not)."""
    labels = {}
    for g in sorted(games, key=_game_order):
        w = int(g["week"])
        if w not in labels or not labels[w]:
            labels[w] = g.get("weekLabel") or "Week %d" % w
    return [(w, labels[w]) for w in sorted(labels)]


def run_layer(layer_id, label, league, teams, counties, games):
    """Run the week-by-week engine for one layer and return the Layer dict.

    teams: [{id, lat, lon}] in this layer. games: finals dicts (may include foreign teams).
    """
    team_ids = [str(t["id"]) for t in teams]
    in_layer = set(team_ids)
    home = allocate_home(counties, teams)
    owners = list(home)

    # Which counties each team holds right now, kept as index lists for cheap transfers.
    held = {t: [] for t in team_ids}
    for i, o in enumerate(owners):
        held[o].append(i)

    weeks = [_snapshot(owners, team_ids, 0, "Start")]
    ledger = []
    by_week = {}
    for g in games:
        by_week.setdefault(int(g["week"]), []).append(g)

    for n, wlabel in week_list(games):
        for g in sorted(by_week[n], key=_game_order):
            h, a = str(g["home"]), str(g["away"])
            if h not in in_layer or a not in in_layer or h == a:
                continue
            hs, as_ = g["homeScore"], g["awayScore"]
            if hs is None or as_ is None or hs == as_:
                continue  # unplayed or tie: moves nothing and is not recorded
            winner, loser = (h, a) if hs > as_ else (a, h)
            moved = sorted(held[loser])  # ENTIRE current land of the loser
            if moved:
                for i in moved:
                    owners[i] = winner
                held[winner] = held[winner] + moved
                held[loser] = []
            ledger.append({
                "week": n,
                "game": str(g["id"]),
                "date": g.get("date"),
                "winner": winner,
                "loser": loser,
                "score": "%d-%d" % (max(hs, as_), min(hs, as_)),
                "transferred": moved,
            })
        weeks.append(_snapshot(owners, team_ids, n, wlabel))

    return {
        "id": layer_id,
        "label": label,
        "league": league,
        "teams": team_ids,
        "home": home,
        "ledger": ledger,
        "weeks": weeks,
        "current": owners,
    }


def state_at(layer, week):
    """Full owner array at the end of `week` (0 = initial split) by replaying the ledger."""
    owners = list(layer["home"])
    for t in layer["ledger"]:
        if t["week"] > week:
            break
        for i in t["transferred"]:
            owners[i] = t["winner"]
    return owners


def conference_layer(national_layer, team_conf, counties_home):
    """Build the ConferenceLayer view of a national run.

    team_conf: team id -> conference name. counties_home: original home team id per county.
    native[i] is the conference of county i's home team. Per conference and week:
    native = counties whose home team belongs to it, captured = of those, counties now
    owned by a team of a different conference, held = native - captured.
    """
    native = [team_conf[h] for h in counties_home]
    confs = sorted(set(team_conf[t] for t in national_layer["teams"]))
    native_count = {c: 0 for c in confs}
    for c in native:
        native_count[c] += 1

    def summary(owners, n, label):
        captured = {c: 0 for c in confs}
        for i, o in enumerate(owners):
            if team_conf[o] != native[i]:
                captured[native[i]] += 1
        return {"n": n, "label": label, "byConf": {
            c: {"native": native_count[c], "captured": captured[c],
                "held": native_count[c] - captured[c]} for c in confs}}

    owners = list(counties_home)
    out = [summary(owners, 0, "Start")]
    ledger = national_layer["ledger"]
    pos = 0
    for w in national_layer["weeks"][1:]:
        # replay this week's ledger entries (ledger is chronological and week-ascending)
        while pos < len(ledger) and ledger[pos]["week"] <= w["n"]:
            for i in ledger[pos]["transferred"]:
                owners[i] = ledger[pos]["winner"]
            pos += 1
        out.append(summary(owners, w["n"], w["label"]))

    return {
        "id": "conference",
        "label": "Conference map",
        "league": national_layer["league"],
        "base": national_layer["id"],
        "native": native,
        "weeks": out,
    }

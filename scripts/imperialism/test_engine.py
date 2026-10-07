"""Tests for the imperialism engine and build CLI. Run: python3 scripts/imperialism/test_engine.py"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine  # noqa: E402

# Fake world: 12 counties on the equator at lon 0..11; four teams on the same line.
COUNTIES = [{"id": "%05d" % i, "name": "c%d" % i, "lat": 0.0, "lon": float(i)} for i in range(12)]
TEAMS = [{"id": "A", "lat": 0, "lon": 1.0}, {"id": "B", "lat": 0, "lon": 4.0},
         {"id": "C", "lat": 0, "lon": 7.0}, {"id": "D", "lat": 0, "lon": 10.0}]
# Expected initial split: A 0,1,2  B 3,4,5  C 6,7,8  D 9,10,11
A_LAND, B_LAND, C_LAND, D_LAND = [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]


def game(gid, week, date, home, away, hs, as_):
    return {"id": gid, "week": week, "weekLabel": "Week %d" % week, "date": date,
            "home": home, "away": away, "homeScore": hs, "awayScore": as_}


def run(games, teams=TEAMS):
    return engine.run_layer("national", "National map", "CFB", teams, COUNTIES, games)


class AllocationTests(unittest.TestCase):
    def test_haversine(self):
        self.assertAlmostEqual(engine.haversine_km(0, 0, 0, 1), 111.19, delta=0.1)
        self.assertEqual(engine.haversine_km(10, 10, 10, 10), 0)

    def test_nearest_stadium(self):
        home = engine.allocate_home(COUNTIES, TEAMS)
        self.assertEqual(home, ["A"] * 3 + ["B"] * 3 + ["C"] * 3 + ["D"] * 3)

    def test_tie_broken_by_team_id_regardless_of_input_order(self):
        mid = [{"lat": 0, "lon": 2.5}]
        self.assertEqual(engine.allocate_home(mid, TEAMS), ["A"])
        self.assertEqual(engine.allocate_home(mid, list(reversed(TEAMS))), ["A"])


class EngineTests(unittest.TestCase):
    def test_week0_snapshot(self):
        layer = run([game("g1", 1, "2026-09-01", "A", "B", 1, 0)])
        w0 = layer["weeks"][0]
        self.assertEqual((w0["n"], w0["label"]), (0, "Start"))
        self.assertEqual(w0["holdings"], {"A": 3, "B": 3, "C": 3, "D": 3})
        self.assertEqual(w0["landless"], [])

    def test_conquest_absorbs_all_land(self):
        layer = run([game("g1", 1, "2026-09-01", "A", "B", 21, 10)])
        e = layer["ledger"][0]
        self.assertEqual((e["winner"], e["loser"], e["score"]), ("A", "B", "21-10"))
        self.assertEqual(e["transferred"], B_LAND)
        self.assertEqual(layer["weeks"][1]["holdings"], {"A": 6, "C": 3, "D": 3})
        self.assertEqual(layer["weeks"][1]["landless"], ["B"])
        self.assertEqual(layer["current"], ["A"] * 6 + ["C"] * 3 + ["D"] * 3)

    def test_landless_loser_transfers_nothing(self):
        layer = run([game("g1", 1, "2026-09-01", "A", "B", 3, 0),
                     game("g2", 2, "2026-09-08", "C", "B", 3, 0)])
        self.assertEqual(layer["ledger"][1]["transferred"], [])
        self.assertEqual(layer["weeks"][2]["holdings"], {"A": 6, "C": 3, "D": 3})

    def test_landless_team_reenters(self):
        layer = run([game("g1", 1, "2026-09-01", "A", "B", 3, 0),
                     game("g2", 2, "2026-09-08", "B", "C", 7, 0)])
        self.assertEqual(layer["ledger"][1]["transferred"], C_LAND)
        self.assertEqual(layer["weeks"][2]["holdings"], {"A": 6, "B": 3, "D": 3} | {})
        self.assertEqual(layer["weeks"][2]["landless"], ["C"])
        self.assertEqual(layer["weeks"][1]["landless"], ["B"])

    def test_chain_conquest(self):
        layer = run([game("g1", 1, "2026-09-01", "A", "B", 3, 0),
                     game("g2", 2, "2026-09-08", "C", "A", 3, 0)])
        # C beats A who now holds A+B land: C takes all 6 plus keeps its own
        self.assertEqual(layer["ledger"][1]["transferred"], A_LAND + B_LAND)
        self.assertEqual(layer["weeks"][2]["holdings"], {"C": 9, "D": 3})
        self.assertEqual(set(layer["weeks"][2]["landless"]), {"A", "B"})

    def test_ties_ignored(self):
        layer = run([game("g1", 1, "2026-09-01", "A", "B", 14, 14)])
        self.assertEqual(layer["ledger"], [])
        self.assertEqual([w["n"] for w in layer["weeks"]], [0, 1])  # the week still exists
        self.assertEqual(layer["current"], layer["home"])

    def test_games_outside_layer_ignored(self):
        layer = run([game("g1", 1, "2026-09-01", "A", "FCS", 50, 0),
                     game("g2", 1, "2026-09-02", "FCS", "D", 7, 3)])
        self.assertEqual(layer["ledger"], [])
        self.assertEqual(layer["current"], layer["home"])

    def test_order_by_date_then_id(self):
        # Given out of order: B beats A first (by date) then A (holding A+B? no: A is landless) ...
        g_late = game("g1", 1, "2026-09-05", "A", "C", 3, 0)
        g_early = game("g2", 1, "2026-09-01", "B", "A", 3, 0)
        layer = run([g_late, g_early])
        self.assertEqual([e["game"] for e in layer["ledger"]], ["g2", "g1"])
        self.assertEqual(layer["ledger"][1]["transferred"], [])  # A already landless

    def test_nfl_conferences_independent(self):
        nfl = [{"id": "A", "lat": 0, "lon": 1.0}, {"id": "B", "lat": 0, "lon": 4.0},
               {"id": "C", "lat": 0, "lon": 7.0}, {"id": "D", "lat": 0, "lon": 10.0}]
        conf = {"A": "AFC", "B": "AFC", "C": "NFC", "D": "NFC"}
        games = [game("g1", 1, "2026-09-01", "A", "C", 3, 0),   # cross-conference
                 game("g2", 2, "2026-09-08", "B", "A", 3, 0)]
        afc = engine.run_layer("AFC", "AFC", "NFL", [t for t in nfl if conf[t["id"]] == "AFC"], COUNTIES, games)
        nfc = engine.run_layer("NFC", "NFC", "NFL", [t for t in nfl if conf[t["id"]] == "NFC"], COUNTIES, games)
        self.assertEqual([e["game"] for e in afc["ledger"]], ["g2"])  # NFC game ignored
        self.assertEqual(nfc["ledger"], [])
        self.assertEqual(set(afc["current"]), {"B"})
        self.assertEqual(set(nfc["current"]), {"C", "D"})

    def test_state_at_matches_current_and_snapshots(self):
        layer = run([game("g1", 1, "2026-09-01", "A", "B", 3, 0),
                     game("g2", 2, "2026-09-08", "C", "A", 3, 0),
                     game("g3", 3, "2026-09-15", "D", "C", 9, 8)])
        self.assertEqual(engine.state_at(layer, layer["weeks"][-1]["n"]), layer["current"])
        self.assertEqual(engine.state_at(layer, 0), layer["home"])
        mid = engine.state_at(layer, 1)
        self.assertEqual(mid, ["A"] * 6 + ["C"] * 3 + ["D"] * 3)
        for w in layer["weeks"]:
            owners = engine.state_at(layer, w["n"])
            self.assertEqual({t: owners.count(t) for t in set(owners)}, w["holdings"])

    def test_determinism(self):
        games = [game("g1", 1, "2026-09-01", "A", "B", 3, 0), game("g2", 2, "2026-09-08", "C", "A", 3, 0)]
        a = json.dumps(run(games), sort_keys=False)
        b = json.dumps(run(list(reversed(games))), sort_keys=False)
        self.assertEqual(a, b)


class ConferenceTests(unittest.TestCase):
    CONF = {"A": "X", "B": "X", "C": "Y", "D": "Z"}

    def test_native_captured_held(self):
        games = [game("g1", 1, "2026-09-01", "C", "A", 3, 0),   # Y captures X's A land
                 game("g2", 2, "2026-09-08", "D", "C", 3, 0),   # Z (different conf) takes it from Y: still captured
                 game("g3", 3, "2026-09-15", "B", "D", 3, 0)]   # B (conf X) beats D: A land returns to X, plus C/D land captured
        nat = run(games)
        cl = engine.conference_layer(nat, self.CONF, nat["home"])
        self.assertEqual(cl["base"], "national")
        self.assertEqual(cl["native"], ["X"] * 6 + ["Y"] * 3 + ["Z"] * 3)
        w = {x["n"]: x["byConf"] for x in cl["weeks"]}
        self.assertEqual(w[0]["X"], {"native": 6, "captured": 0, "held": 6})
        self.assertEqual(w[1]["X"], {"native": 6, "captured": 3, "held": 3})
        self.assertEqual(w[1]["Y"], {"native": 3, "captured": 0, "held": 3})
        # D (Z) beats C (Y), who holds Y's + A's land: A land stays captured, Y land now captured
        self.assertEqual(w[2]["X"], {"native": 6, "captured": 3, "held": 3})
        self.assertEqual(w[2]["Y"], {"native": 3, "captured": 3, "held": 0})
        # B (X) beats D: owns everything D had; X natives all held, Y natives captured, Z natives captured
        self.assertEqual(w[3]["X"], {"native": 6, "captured": 0, "held": 6})
        self.assertEqual(w[3]["Z"], {"native": 3, "captured": 3, "held": 0})
        for n in w:
            for c in w[n].values():
                self.assertEqual(c["held"], c["native"] - c["captured"])


class BuildCliTests(unittest.TestCase):
    def espn_team(self, tid, name, abbr, group=None, ncaa=True):
        return {"id": tid, "displayName": name, "abbreviation": abbr, "color": "112233", "alternateColor": "ffeedd",
                "logos": [{"href": "https://x/%s.png" % tid}, {"href": "https://x/500-dark/%s.png" % tid}]}

    def test_end_to_end(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw, geo = os.path.join(tmp, "raw"), os.path.join(tmp, "geo")
            os.makedirs(raw)
            os.makedirs(geo)
            w = lambda p, d: json.dump(d, open(os.path.join(tmp, p), "w"))
            w("geo/counties.json", COUNTIES)
            w("geo/stadiums.json", {
                "CFB": {"1": {"stadium": "S1", "lat": 0, "lon": 1}, "2": {"stadium": "S2", "lat": 0, "lon": 6},
                        "3": {"stadium": "S3", "lat": 0, "lon": 10}},   # team 4 has no stadium
                "NFL": {"10": {"stadium": "N1", "lat": 0, "lon": 1}, "11": {"stadium": "N2", "lat": 0, "lon": 4},
                        "12": {"stadium": "N3", "lat": 0, "lon": 7}, "13": {"stadium": "N4", "lat": 0, "lon": 10}}})
            cfb = [self.espn_team(i, "Team %s" % i, "T" + i) for i in "1234"]
            nfl = [self.espn_team(str(10 + i), "Pro %d" % i, "P%d" % i) for i in range(4)]
            for lg, teams in (("cfb", cfb), ("nfl", nfl)):
                w("raw/%s-teams.json" % lg, {"sports": [{"leagues": [{"teams": [{"team": t} for t in teams]}]}]})
            confs = [("Southeastern Conference", "SEC"), ("Sun Belt - East", "Sun Belt - East"),
                     ("Sun Belt - West", "Sun Belt - West"), ("FBS Independents", "FBS Indep.")]
            w("raw/cfb-fpi.json", {"teams": [{"team": dict(t, group={"name": c[0], "shortName": c[1]})}
                                              for t, c in zip(cfb, confs)]})
            divs = [("AFC East", "AFC"), ("AFC West", "AFC"), ("NFC East", "NFC"), ("NFC West", "NFC")]
            w("raw/nfl-fpi.json", {"teams": [{"team": dict(t, group={"name": d[0], "parent": {"abbreviation": d[1]}})}
                                              for t, d in zip(nfl, divs)]})
            w("raw/cfb-finals.json", {"season": 2026, "games": [
                game("g1", 1, "2026-09-01T16:00Z", "1", "2", 10, 3),
                game("g2", 1, "2026-09-02T16:00Z", "3", "999", 10, 3),   # FCS
                game("g3", 2, "2026-09-09T16:00Z", "3", "1", 10, 3)]})
            w("raw/nfl-finals.json", {"season": 2026, "games": [
                game("n1", 1, "2026-09-10T16:00Z", "10", "12", 10, 3),   # cross-conference
                game("n2", 2, "2026-09-17T16:00Z", "11", "10", 10, 3)]})

            out = os.path.join(tmp, "out", "imp.json")
            env = dict(os.environ, RAW_DIR=raw, GEO_DIR=geo, OUT_FILE=out, NOW="2026-10-07T00:00:00Z")
            r = subprocess.run([sys.executable, os.path.join(HERE, "build.py")], env=env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("WARNING", r.stdout)
            first = open(out, "rb").read()
            r = subprocess.run([sys.executable, os.path.join(HERE, "build.py")], env=env, capture_output=True, text=True)
            self.assertEqual(first, open(out, "rb").read())  # deterministic

            d = json.loads(first)
            self.assertEqual(set(d), {"version", "season", "generatedAt", "counties", "teams", "weeks", "maps"})
            n = len(COUNTIES)
            self.assertEqual(len(d["counties"]), n)
            self.assertEqual(len(d["teams"]["CFB"]), 3)
            self.assertEqual(len(d["teams"]["NFL"]), 4)
            self.assertEqual({t["conf"] for t in d["teams"]["CFB"]}, {"SEC", "Sun Belt", "Independent"})
            self.assertEqual(d["teams"]["NFL"][0]["division"], "AFC East")
            self.assertTrue(d["teams"]["CFB"][0]["color"].startswith("#"))
            self.assertIn("500-dark", d["teams"]["CFB"][0]["logo"])
            self.assertEqual(d["weeks"]["CFB"], [{"n": 0, "label": "Start"}, {"n": 1, "label": "Week 1"},
                                                  {"n": 2, "label": "Week 2"}])
            self.assertEqual(set(d["maps"]["CFB"]), {"national", "conference"})
            self.assertEqual(set(d["maps"]["NFL"]), {"full", "AFC", "NFC"})
            for lg in ("CFB", "NFL"):
                for layer in d["maps"][lg].values():
                    if "ledger" in layer:
                        self.assertEqual(len(layer["home"]), n)
                        self.assertEqual(len(layer["current"]), n)
                        weeks = [t["week"] for t in layer["ledger"]]
                        self.assertEqual(weeks, sorted(weeks))
                        self.assertEqual(engine.state_at(layer, 99), layer["current"])
                        self.assertEqual(layer["weeks"][0]["n"], 0)
                    else:
                        self.assertEqual(len(layer["native"]), n)
            self.assertEqual(len(d["maps"]["CFB"]["national"]["ledger"]), 2)
            self.assertEqual(len(d["maps"]["NFL"]["AFC"]["ledger"]), 1)
            self.assertEqual(len(d["maps"]["NFL"]["full"]["ledger"]), 2)
            self.assertEqual(d["maps"]["NFL"]["NFC"]["ledger"], [])

            # missing finals -> week 0 only
            os.remove(os.path.join(raw, "cfb-finals.json"))
            r = subprocess.run([sys.executable, os.path.join(HERE, "build.py")], env=env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("zero games", r.stdout)
            d = json.load(open(out))
            self.assertEqual(d["weeks"]["CFB"], [{"n": 0, "label": "Start"}])


if __name__ == "__main__":
    unittest.main()

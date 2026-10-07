import { test,expect } from '@playwright/test';
import { parseFox,parseCbs,matchListing,resolveBroadcast,channel } from '../scripts/broadcasts.mjs';
const game={date:'2026-10-10T01:00Z',matchup:'Iowa @ Washington'};
const now=Date.parse('2026-10-07T18:00Z');
const saved={date:'2026-10-09',broadcast:'FOX or FS1 (final channel pending)',network:null,checkedAt:'2026-10-07T17:00Z'};
test('official schedule preserves pending alternatives and matches the local game date',()=>{
 const rows=parseFox('<p>Friday, Oct. 9, 2026</p><ul><li>Iowa vs Washington (FOX or FS1 (TBD)) - 9:00 p.m. ET</li></ul><p>Friday, Oct. 16, 2026</p><ul><li>Iowa vs Washington (FS1) - 9:00 p.m. ET</li></ul>');
 expect(matchListing(game,rows)?.broadcast).toBe(saved.broadcast);
 expect(matchListing(game,rows)?.network).toBeNull();
 expect(matchListing({...game,date:'2026-10-17T01:00Z'},rows)?.broadcast).toBe('FS1');
 expect(matchListing(game,[...rows,rows[0]])).toBeNull();
});
test('missing channels use saved checks, confirmed ESPN channels survive and stale checks expire',()=>{
 expect(resolveBroadcast('TBA',saved,game.date,now)).toEqual(saved);
 expect(resolveBroadcast('FOX or FS1 (TBD)',{...saved,broadcast:'FS1',network:'fs1'},game.date,now)?.broadcast).toBe('FS1');
 expect(resolveBroadcast('ESPN',saved,game.date,now)).toBeNull();
 expect(resolveBroadcast('TBA',{...saved,date:'2026-10-16'},game.date,now)).toBeNull();
 expect(resolveBroadcast('TBA',{...saved,checkedAt:'2026-09-20'},game.date,now)).toBeNull();
 expect(channel('TBA')).toBeNull();
 expect(channel('CBSSN')?.network).toBe('cbssn');
});
test('publisher schedules identify games by date and both teams without guessing unknown networks',()=>{
 const rows=parseCbs('<table><tr><td><span class="TeamName"><a href="/nfl/teams/TB/tampa-bay-buccaneers/">Tampa Bay</a></span></td><td><span class="TeamName"><a href="/nfl/teams/DAL/dallas-cowboys/">Dallas</a></span></td><td><a href="/nfl/gametracker/live/NFL_20261008_TB@DAL/">8:15 pm</a><div class="CellGame-tv">AMZN</div></td></tr></table>');
 expect(matchListing({date:'2026-10-09T00:15Z',matchup:'Tampa Bay Buccaneers @ Dallas Cowboys'},rows)?.broadcast).toBe('Prime Video');
 expect(matchListing({date:'2026-10-09T00:15Z',matchup:'Tampa Bay Buccaneers @ Seattle Seahawks'},rows)).toBeNull();
});

// Independent broadcaster/publisher schedules; failure never blocks refresh.
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { parseFox,parseCbs,matchListing,pending } from './broadcasts.mjs';
const root=new URL('../',import.meta.url), file=new URL('src/data/broadcast-checks.json',root);
const cache=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
const games=JSON.parse(readFileSync(new URL('src/data/slate.json',root),'utf8')).games;
// Fresh ESPN scoreboards supply the new week's event IDs before the builder runs.
for(const league of ['nfl','cfb']) {
  const path=new URL(`${process.env.RAW_DIR || 'data-raw'}/${league}-scoreboard.json`,root);
  if(!existsSync(path))continue;
  for(const event of JSON.parse(readFileSync(path,'utf8')).events || []) {
    const competitors=event.competitions?.[0]?.competitors || [];
    const side=name=>{const team=competitors.find(team=>team.homeAway===name)?.team;return league==='nfl'?team?.displayName:team?.location;};
    if(side('away')&&side('home')&&!games.some(game=>game.espnId===event.id))games.push({espnId:event.id,date:event.date,league:league==='nfl'?'NFL':'CFB',matchup:`${side('away')} @ ${side('home')}`});
  }
}
const sources=[
 {url:'https://www.fox.com/stream/college-football-schedule',league:'CFB',parse:parseFox},
 {url:'https://www.cbssports.com/college-football/schedule/',league:'CFB',parse:parseCbs},
 {url:'https://www.cbssports.com/nfl/schedule/',league:'NFL',parse:parseCbs},
];
for(const source of sources) {
 try {
  const response=await fetch(source.url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const rows=source.parse(await response.text()); if(!rows.length)throw new Error('No recognized listings');
  let matched=0;
  for(const game of games.filter(game=>game.league===source.league)) {
   const listing=matchListing(game,rows);if(!listing)continue;
   const previous=cache[game.espnId];
   // The broadcaster itself decides whether its final channel is confirmed.
   if(previous?.source?.includes('fox.com')&&Date.now()-Date.parse(previous.checkedAt)<7*864e5&&source.url.includes('cbssports'))continue;
   cache[game.espnId]={date:listing.date,broadcast:listing.broadcast,network:listing.network,source:source.url,checkedAt:new Date().toISOString()};matched++;
  }
  console.log(`${source.url}: checked ${matched} games`);
 }catch(error){console.warn(`Broadcast check unavailable (${source.url}): ${error.message}; preserving saved checks`);}
}
writeFileSync(file,JSON.stringify(cache,null,2)+'\n');

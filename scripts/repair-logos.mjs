// Replaces six malformed PNG data URIs in the legacy artifact with ESPN team logos.
// This is a one-time migration repair; normal builds never access the network.
import {readFileSync,writeFileSync} from 'node:fs';
const path=new URL('../src/data/logos.json',import.meta.url);
const logos=JSON.parse(readFileSync(path,'utf8'));
const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000');
if(!response.ok)throw new Error(`Team lookup failed: ${response.status}`);
const json=await response.json();const teams=json.sports[0].leagues[0].teams.map(entry=>entry.team);
const targets={missouri:'Missouri',georgia:'Georgia',clemson:'Clemson',uconn:'UConn',charlotte:'Charlotte',tulsa:'Tulsa'};
const repairs=[];
for(const [key,location] of Object.entries(targets)){
 const matches=teams.filter(t=>t.location===location && (key!=='charlotte'||t.id==='2429'));
 if(matches.length!==1)throw new Error(`Ambiguous team ${location}: ${matches.length}`);
 const team=matches[0],url=team.logos[0].href;
 const res=await fetch(url);if(!res.ok)throw new Error(`Logo failed: ${url}`);
 const buffer=Buffer.from(await res.arrayBuffer());
 logos[key]=`data:${res.headers.get('content-type').split(';')[0]};base64,${buffer.toString('base64')}`;
 repairs.push({logoId:key,team:team.displayName,source:url,reason:'Malformed palette chunk in original embedded PNG',retrievedAt:new Date().toISOString().slice(0,10)});
}
writeFileSync(path,JSON.stringify(logos,null,2)+'\n');
writeFileSync(new URL('../src/data/logo-repairs.json',import.meta.url),JSON.stringify(repairs,null,2)+'\n');
console.log(repairs);

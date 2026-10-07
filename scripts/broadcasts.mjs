import { load } from "cheerio";

const tidy = value => String(value || "").replace(/[\u200b-\u200f]/g, "").replace(/\s+/g," ").trim();
const norm = value => tidy(value).toLowerCase().replace(/\bst\.?\b/g,"state").replace(/[^a-z0-9]+/g," ").trim();
export const pending = value => !value || /\b(TBA|TBD|pending)\b|\sor\s/i.test(value);
const channels = { CBSSN: "CBS Sports Network", AMZN: "Prime Video", ESPD: "ESPN+", BTN: "Big Ten Network", FS1: "FS1", FS2: "FS2", FOX: "Fox", CBS: "CBS", ABC: "ABC", NBC: "NBC", ESPN: "ESPN", ESPN2: "ESPN2", ESPNU: "ESPNU", ACCN: "ACC Network", SECN: "SEC Network", CW: "The CW", PEAC: "Peacock" };
export function channel(value) {
  const raw=tidy(value);
  if (/^FOX or FS1(?: \(TBD\))?$/i.test(raw)) return { broadcast: "FOX or FS1 (final channel pending)", network: null };
  const broadcast=channels[raw.toUpperCase()];
  return broadcast ? { broadcast, network: ({"CBS Sports Network":"cbssn","Prime Video":"prime-video","Big Ten Network":"btn","ACC Network":"acc-network","SEC Network":"sec-network","The CW":"cw","ESPN+":"espn-plus"})[broadcast] || broadcast.toLowerCase() } : null;
}
export function parseFox(html) {
  const $=load(html), rows=[]; let date="";
  $("p,li").each((_,el)=>{
    const value=tidy($(el).text());
    if(el.tagName==='p' && /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/.test(value)) {
      const parsed=new Date(value.replace(/Sept\./,"Sep"));
      date=Number.isNaN(+parsed) ? "" : parsed.toISOString().slice(0,10);
    }
    if(el.tagName!=='li'||!date)return;
    const match=value.match(/^(.*?) vs (.*?) \((.*?)\)\s*[-—]/);
    const tv=match && channel(match[3]);
    if(tv)rows.push({date,away:match[1],home:match[2],...tv});
  });return rows;
}
export function parseCbs(html) {
  const $=load(html), rows=[];
  $("tr").each((_,el)=>{
    const row=$(el), href=row.find('a[href*="/gametracker/"]').attr('href') || "";
    const date=href.match(/_(\d{4})(\d{2})(\d{2})_/);
    const teams=row.find('.TeamName a').map((_,a)=>({short:tidy($(a).text()),slug:($(a).attr('href')||'').split('/').filter(Boolean).pop()?.replace(/-/g,' ')})).get();
    const tv=channel(row.find('.CellGame-tv').text());
    if(date&&teams.length===2&&tv)rows.push({date:`${date[1]}-${date[2]}-${date[3]}`,away:teams[0].short,home:teams[1].short,awaySlug:teams[0].slug,homeSlug:teams[1].slug,...tv});
  });return rows;
}
export function matchListing(game,rows) {
  const date=new Date(game.date).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  const [away,home]=game.matchup.split(' @ ');
  if(!away||!home)return null;
  const matches=(name,short,slug)=>norm(name)===norm(short)||(norm(slug)===norm(name)||norm(slug).startsWith(norm(name)+' '));
  const found=rows.filter(row=>row.date===date&&matches(away,row.away,row.awaySlug)&&matches(home,row.home,row.homeSlug));
  return found.length===1 ? found[0] : null;
}
export function resolveBroadcast(primary,record,gameDate,now=Date.now()) {
  if(!record||!Number.isFinite(Date.parse(record.checkedAt))||!pending(primary)||record.date!==new Date(gameDate).toLocaleDateString('en-CA',{timeZone:'America/New_York'})||now-Date.parse(record.checkedAt)>7*864e5)return null;
  return record;
}

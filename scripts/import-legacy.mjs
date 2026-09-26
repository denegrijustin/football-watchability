import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
const source = readFileSync(new URL('../source/original.html', import.meta.url), 'utf8');
const $ = load(source);
const text = (node, selector) => node.find(selector).first().text().trim();
const list = (node, selector) => node.find(selector).map((_, el) => $(el).text().trim()).get();
const logos = {};
const games = [];
$('section').each((_, section) => {
  const league = $(section).hasClass('nflSection') ? 'NFL' : 'CFB';
  $(section).find('.card').each((index, el) => {
    const c = $(el);
    const teams = c.find('.teamPanel').map((_, team) => {
      const t = $(team);
      const name = text(t, '.teamName');
      const logoId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      logos[logoId] = t.find('img').attr('src');
      return { name, logoId, record: text(t, '.teamMeta'), rankings: list(t, '.rk'), playoffOdds: t.find('.pct').map((_, p) => Number($(p).text().replace('%', ''))).get() };
    }).get();
    const boxes = c.find('.historyBox').map((_, b) => ({label:text($(b), '.historyLabel'), value:text($(b), '.historyValue'), items:list($(b), '.recentChip')})).get();
    games.push({ id: `${league.toLowerCase()}-${index+1}`, league, conferences: (c.attr('class') || '').split(' ').filter(v => v.startsWith('conf-')).map(v=>v.slice(5)), score: Number(text(c,'.score')), tier: c.attr('class').split(' ')[1], delta: text(c,'.delta'), matchup: text(c,'.match'), meta: text(c,'.meta'), chips:list(c,'.chipRow .chip:not(.whereWatch):not(.weatherChip)'), broadcast: text(c,'.whereWatch').replace(/^📺\s*/,''), weather:{icon:text(c,'.weatherIcon'), title:text(c,'.wTitle'), detail:text(c,'.wSub'), impact:text(c,'[class^="risk"]')}, teams, narrative: text(c,'.expandNarrative'), narrativeChips:list(c,'.detailChip'), history: {boxes, source:text(c,'.historySource')} });
  });
});
const conferences = $('.filters label').map((_,el) => ({id: $(el).text().trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'), label:$(el).text().trim()})).get();
const slate = {schemaVersion:1, title:'Football Watchability', period:'Sept. 24–28, 2026', snapshotDate:'2026-09-24', provenance:{file:'source/original.html',sha256:createHash('sha256').update(source).digest('hex'), note:'Imported unchanged from the supplied dashboard. Schedule, weather, history and projections have not been independently reverified.'}, broadcastNote:$('.broadcastNote').text().trim(), footerNotes:$('.footerNote').map((_,e)=>$(e).text().trim()).get(), conferences, games};
writeFileSync(new URL('../src/data/slate.json',import.meta.url),JSON.stringify(slate,null,2)+'\n');
writeFileSync(new URL('../src/data/logos.json',import.meta.url),JSON.stringify(logos,null,2)+'\n');
console.log(JSON.stringify({games:games.length,leagues:games.reduce((a,g)=>(a[g.league]=(a[g.league]||0)+1,a),{}),logos:Object.keys(logos).length,conferences,footerNotes:slate.footerNotes},null,2));

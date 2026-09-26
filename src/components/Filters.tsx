import { slate, type League } from '../data';
type Props={league:League; conference:string; query:string; onLeague:(v:League)=>void; onConference:(v:string)=>void; onQuery:(v:string)=>void};
export function Filters({league,conference,query,onLeague,onConference,onQuery}:Props) {
  return <div className="filter-dock"><div className="filter-main"><div className="league-switch" role="group" aria-label="League">{(['NFL','CFB'] as const).map(l=><button key={l} aria-pressed={league===l} onClick={()=>onLeague(l)}>{l==='NFL'?'NFL':'College football'}<span>{slate.games.filter(g=>g.league===l).length}</span></button>)}</div><label className="search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search teams, channels or locations" placeholder="Search teams, channels…" value={query} onChange={e=>onQuery(e.target.value)}/></label></div>
    {league==='CFB' && <div className="conference-filters" role="group" aria-label="Conference">{slate.conferences.map(c=><button key={c.id} aria-pressed={conference===c.id} onClick={()=>onConference(c.id)}>{c.label}</button>)}</div>}
  </div>;
}

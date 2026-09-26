import { logos, type Team } from '../data';
const scenarios = ['Now', 'Win', 'Loss'];
export function TeamImpact({ team }: { team: Team }) {
  return <section className="team-impact" aria-label={`${team.name} projections`}>
    <div className="team-heading"><img src={logos[team.logoId]} alt="" width="36" height="36" loading="lazy"/><div><h4>{team.name}</h4><p>{team.record}</p></div></div>
    <div className="micro-label">Projected ranking</div>
    <div className="ranking-grid">{team.rankings.map((rank,i) => <div className={`ranking scenario-${i}`} key={i}><span>{scenarios[i]}</span><strong>{rank.replace(/^[▲▼]\s*/, '')}</strong></div>)}</div>
    <div className="micro-label odds-label">Playoff odds</div>
    {team.playoffOdds.map((odds,i) => <div className={`odds-row scenario-${i}`} key={i}><span>{scenarios[i]}</span><div className="odds-track" aria-hidden="true"><div style={{width:`${odds}%`}}/></div><strong>{odds}%</strong></div>)}
  </section>;
}

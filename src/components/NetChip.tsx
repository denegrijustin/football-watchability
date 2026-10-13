import { directvChannel, directvTitle } from "../directv";
import { directvLink, openInApp, watchLink } from "../watchLinks";

/**
 * The network logo with its DIRECTV channel number (Overland Park, KS). The logo opens the game in the ESPN app for ESPN
 * games (or the streaming outlet's home page); the number opens the DIRECTV guide. On a phone the ESPN and DIRECTV links open
 * their apps first, and fall back to the web page. Without a game (a TV grid lane),
 * only the number links. Links open in a new tab and never trigger the card they sit on.
 */
export function NetChip({
  network,
  logo,
  alt = "",
  height = 16,
  game,
}: {
  network?: string | null;
  logo: string;
  alt?: string;
  height?: number;
  game?: { league: string; espnId?: string | null; broadcast?: string };
}) {
  const ch = directvChannel(network);
  const watch = game ? watchLink({ network, broadcast: game.broadcast, league: game.league, espnId: game.espnId }) : null;
  const dtv = directvLink(network);
  const img = <img src={logo} alt={alt} height={height} loading="lazy" decoding="async" />;
  return (
    <span className={`net-chip${ch ? " has-ch" : ""}${watch ? " has-link" : ""}`} title={directvTitle(network)}>
      {watch ? (
        <a className="net-link" href={watch.url} target="_blank" rel="noopener noreferrer" title={watch.title} data-kind={watch.kind} onClick={(e) => openInApp(e, watch.app, watch.url)}>
          {img}
        </a>
      ) : (
        img
      )}
      {ch && dtv && (
        <a className="ch-num" href={dtv.url} target="_blank" rel="noopener noreferrer" title={dtv.title} aria-label={dtv.title} onClick={(e) => openInApp(e, dtv.app, dtv.url)}>
          {ch}
        </a>
      )}
    </span>
  );
}

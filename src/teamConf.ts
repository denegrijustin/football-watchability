import conferences from "./data/team-conferences.json";
import { confOfIn, inConferenceIn, type ConfTable } from "./teamConfLogic";

const table = conferences as ConfTable;

/** The NFL's two conferences, for the filters (college conferences come with the slate). */
export const NFL_CONFERENCES = [
  { id: "all-fbs", label: "Both conferences" },
  { id: "afc", label: "AFC" },
  { id: "nfc", label: "NFC" },
];

export const confOf = (league: "NFL" | "CFB", logoId: string) => confOfIn(table, league, logoId);
export const inConference = (league: "NFL" | "CFB", conference: string | undefined, logoIds: string[]) => inConferenceIn(table, league, conference, logoIds);

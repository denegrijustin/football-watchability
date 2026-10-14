/** The sheet's FBS team names against the board's: where they differ, and the ESPN ids for teams the board has no logo file for. */
export const SHEET_TO_BOARD: Record<string, string> = {
  "Miami-FL": "Miami (FL)", "Miami-OH": "Miami (OH)", Hawaii: "Hawai'i", "San Jose State": "San José State", "UL-Monroe": "UL Monroe",
  "UL-Lafayette": "Louisiana", USF: "South Florida", Connecticut: "UConn", "Appalachian State": "App State",
};
/** Used only when the board's own team list does not have the team. */
export const ESPN_EXTRA: Record<string, string> = {
  Arizona: "12", USC: "30", Iowa: "2294", "South Carolina": "2579", "Boise State": "68", Liberty: "2335", Illinois: "356", UCF: "2116",
  Minnesota: "135", "Iowa State": "66", USF: "58", "North Texas": "249", Connecticut: "41", "NC State": "152", "UL-Lafayette": "309",
  "Appalachian State": "2026", "Miami-OH": "193", "Utah State": "328", "South Alabama": "6", "San Jose State": "23", Hawaii: "62",
  Marshall: "276", "New Mexico State": "166", "UL-Monroe": "2433", "Miami-FL": "2390",
};

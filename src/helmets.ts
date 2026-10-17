// The real helmet of each NFL team: the shell, the stripe down the middle and the facemask. Colleges (and any team not listed) wear
// their own team colour with a white stripe and a grey mask.
export type HelmetLook = { shell: string; stripe: string; mask: string };
const GREY = "#aab2ba";
const H = (shell: string, stripe: string, mask = GREY): HelmetLook => ({ shell, stripe, mask });
export const NFL_HELMETS: Record<string, HelmetLook> = {
  "baltimore-ravens": H("#16101f", "#9e7c0c", "#16101f"),
  "buffalo-bills": H("#f4f5f7", "#c60c30"),
  "cincinnati-bengals": H("#fb4f14", "#101010", "#101010"),
  "cleveland-browns": H("#ff3c00", "#5b2c0c", "#5b2c0c"),
  "denver-broncos": H("#0b2265", "#fb4f14"),
  "houston-texans": H("#03202f", "#a71930", "#03202f"),
  "indianapolis-colts": H("#f4f5f7", "#003b7a"),
  "jacksonville-jaguars": H("#101820", "#d7a22a", "#101820"),
  "kansas-city-chiefs": H("#e31837", "#ffffff", "#f1f2f3"),
  "las-vegas-raiders": H("#b4bac0", "#111111", "#c9ced3"),
  "los-angeles-chargers": H("#f4f5f7", "#ffc20e", "#ffc20e"),
  "miami-dolphins": H("#f4f5f7", "#f58220"),
  "new-england-patriots": H("#b8bec4", "#0c2340"),
  "new-york-jets": H("#125740", "#ffffff", "#f1f2f3"),
  "pittsburgh-steelers": H("#101010", "#ffb612", "#101010"),
  "tennessee-titans": H("#0c2340", "#4b92db", "#0c2340"),
  "arizona-cardinals": H("#f1f2f3", "#111111", "#111111"),
  "atlanta-falcons": H("#111111", "#a71930", "#111111"),
  "carolina-panthers": H("#101820", "#0085ca", "#101820"),
  "chicago-bears": H("#0b162a", "#e64100"),
  "dallas-cowboys": H("#b5bcc3", "#041e42"),
  "detroit-lions": H("#b8c2cc", "#0076b6"),
  "green-bay-packers": H("#ffb612", "#ffffff"),
  "los-angeles-rams": H("#003594", "#ffd100"),
  "minnesota-vikings": H("#4f2683", "#ffc62f", "#f1f2f3"),
  "new-orleans-saints": H("#d3bc8d", "#101010"),
  "new-york-giants": H("#0b2265", "#a71930"),
  "philadelphia-eagles": H("#004c54", "#a5acaf"),
  "san-francisco-49ers": H("#b3995d", "#aa0000", "#b3995d"),
  "seattle-seahawks": H("#002244", "#69be28"),
  "tampa-bay-buccaneers": H("#6b6e70", "#d50a0a", "#6b6e70"),
  "washington-commanders": H("#5a1414", "#ffb612"),
};
export const helmetFor = (logoId: string | undefined, color: string): HelmetLook => (logoId && NFL_HELMETS[logoId]) || H(color, "#ffffff");

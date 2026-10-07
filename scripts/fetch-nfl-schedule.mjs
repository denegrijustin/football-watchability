// The NFL games still to play (see schedule-lib.mjs). Run in GitHub Actions.
import { fetchSchedule } from "./schedule-lib.mjs";
await fetchSchedule("nfl");

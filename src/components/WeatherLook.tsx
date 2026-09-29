import type { Game } from "../data";

export type WeatherHour = {
  label: string;
  time: string;
  icon: string;
  tempF: number;
  feelsF: number;
  precip: number;
  windMph: number;
  gustMph: number;
  dir: string;
};
export type Weather = {
  icon: string;
  title: string;
  detail: string;
  impact: string;
  level?: string;
  effects?: string[];
  hours?: WeatherHour[];
  confidence?: string;
  indoor?: boolean;
};

/** Game-window forecast strip (about one reading per quarter) + impact notes. */
export function WeatherLook({ game }: { game: Game }) {
  const wx = game.weather as Weather;
  if (!wx.hours?.length) return null;
  const notable = wx.level === "moderate" || wx.level === "high";
  return (
    <div className={`wx-look level-${wx.level ?? "none"}`}>
      <ol className="wx-strip" aria-label="Game-time forecast by quarter">
        {wx.hours.map((h) => (
          <li key={h.label}>
            <span className="wx-when">
              {h.label} <span>{h.time}</span>
            </span>
            <span className="wx-icon" aria-hidden="true">
              {h.icon}
            </span>
            <strong>{h.tempF}°</strong>
            <span className={`wx-rain ${h.precip >= 50 ? "hi" : ""}`}>
              <span aria-hidden="true">💧</span>
              {h.precip}%
            </span>
            <span className={`wx-wind ${h.gustMph >= 25 ? "hi" : ""}`}>
              <span aria-hidden="true">💨</span>
              {Math.max(h.windMph, h.gustMph)}
              <span className="sr-only"> mph gusts</span>
            </span>
          </li>
        ))}
      </ol>
      {notable && wx.effects && wx.effects.length > 0 && (
        <ul className="wx-effects">
          {wx.effects.slice(0, 2).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {wx.confidence && <p className="wx-conf">{wx.confidence}</p>}
    </div>
  );
}

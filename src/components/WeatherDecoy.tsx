import { useEffect, useMemo, useRef } from "react";
import { Cloud, CloudRain, CloudSun, Sun, Wind, Droplets } from "lucide-react";

interface WeatherDecoyProps {
  /** Called after the temperature has been held for HOLD_MS. */
  onReveal: () => void;
}

const HOLD_MS = 2000;

type Condition = { label: string; Icon: typeof Sun };
const CONDITIONS: Condition[] = [
  { label: "Sunny", Icon: Sun },
  { label: "Mostly Sunny", Icon: CloudSun },
  { label: "Partly Cloudy", Icon: CloudSun },
  { label: "Cloudy", Icon: Cloud },
  { label: "Showers", Icon: CloudRain },
];

/** Small deterministic PRNG so the forecast is stable for the day without any network access. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function forecastFor(date: Date) {
  const dayKey = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const rand = seeded(dayKey);
  const base = 14 + Math.round(rand() * 14);
  const hour = date.getHours();
  const now = base + Math.round(Math.sin(((hour - 9) / 24) * Math.PI * 2) * 4);
  const condition = CONDITIONS[Math.floor(rand() * CONDITIONS.length)];
  const hourly = Array.from({ length: 6 }, (_, i) => ({
    label: i === 0 ? "Now" : `${(hour + i) % 24}`.padStart(2, "0"),
    temp: now + Math.round((rand() - 0.4) * 3) + (i < 3 ? i : 3 - i),
    Icon: CONDITIONS[Math.floor(rand() * 3)].Icon,
  }));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const daily = Array.from({ length: 7 }, (_, i) => {
    const low = base - 6 + Math.round(rand() * 4);
    return {
      label: i === 0 ? "Today" : days[(date.getDay() + i) % 7],
      low,
      high: low + 7 + Math.round(rand() * 6),
      Icon: CONDITIONS[Math.floor(rand() * CONDITIONS.length)].Icon,
    };
  });
  return {
    now,
    condition,
    high: Math.max(now, daily[0].high),
    low: Math.min(now, daily[0].low),
    humidity: 40 + Math.round(rand() * 45),
    wind: 5 + Math.round(rand() * 25),
    hourly,
    daily,
  };
}

/**
 * Working-looking weather app shown in place of the lock screen when the Weather
 * disguise is on. Pressing and holding the current temperature for two seconds
 * opens the PIN pad. Nothing on screen changes while the press is held, so an
 * onlooker sees an ordinary forecast. No location or network request is made.
 */
const WeatherDecoy = ({ onReveal }: WeatherDecoyProps) => {
  const forecast = useMemo(() => forecastFor(new Date()), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      onReveal();
    }, HOLD_MS);
  };
  useEffect(() => cancel, []);

  const { condition } = forecast;
  return (
    <div className="fixed inset-0 overflow-y-auto bg-gradient-to-b from-sky-500 via-sky-600 to-indigo-800 text-white select-none pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="max-w-md mx-auto px-5">
        <div className="flex flex-col items-center text-center pt-8 pb-6">
          <p className="text-2xl font-medium">My Location</p>
          <p
            data-testid="weather-temperature"
            className="text-8xl font-extralight leading-none mt-2 touch-none"
            onPointerDown={start}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}
            style={{ WebkitTouchCallout: "none" }}
          >
            {forecast.now}°
          </p>
          <p className="text-lg mt-2 opacity-90">{condition.label}</p>
          <p className="text-base opacity-90">H:{forecast.high}°  L:{forecast.low}°</p>
        </div>

        <div className="rounded-2xl bg-white/15 backdrop-blur p-4 mb-3">
          <p className="text-xs uppercase tracking-wide opacity-80 mb-3">Hourly forecast</p>
          <div className="flex justify-between">
            {forecast.hourly.map((h) => (
              <div key={h.label} className="flex flex-col items-center gap-2 text-sm">
                <span className="opacity-90">{h.label}</span>
                <h.Icon className="h-5 w-5" />
                <span className="font-medium">{h.temp}°</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white/15 backdrop-blur p-4 mb-3">
          <p className="text-xs uppercase tracking-wide opacity-80 mb-2">7-day forecast</p>
          {forecast.daily.map((d) => (
            <div key={d.label} className="flex items-center justify-between py-2 border-t border-white/15 first:border-t-0 text-sm">
              <span className="w-14">{d.label}</span>
              <d.Icon className="h-5 w-5" />
              <span className="opacity-70 w-8 text-right">{d.low}°</span>
              <div className="flex-1 mx-3 h-1 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-teal-300 to-amber-300" style={{ marginLeft: `${(d.low - forecast.low + 6) * 3}%`, width: `${(d.high - d.low) * 4}%` }} />
              </div>
              <span className="w-8 text-right font-medium">{d.high}°</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/15 backdrop-blur p-4">
            <p className="text-xs uppercase tracking-wide opacity-80 flex items-center gap-1"><Droplets className="h-3.5 w-3.5" /> Humidity</p>
            <p className="text-3xl mt-2">{forecast.humidity}%</p>
          </div>
          <div className="rounded-2xl bg-white/15 backdrop-blur p-4">
            <p className="text-xs uppercase tracking-wide opacity-80 flex items-center gap-1"><Wind className="h-3.5 w-3.5" /> Wind</p>
            <p className="text-3xl mt-2">{forecast.wind} <span className="text-base">km/h</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherDecoy;

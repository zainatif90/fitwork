/*
 * Night sky for the dark sidebar: a few tiny still stars, and shooting stars that streak across now and then.
 * Each shooting star is a thin line of light with a bright glowing head. It flies along its own angle, its tail
 * stretches out, then it fades, and it comes back a few seconds later. Different speeds, angles and pauses make it
 * feel random. Only transform and opacity are animated (graphics card, no repaints).
 * Styles: `.shooting-sky` in index.css.
 */

// Shooting stars: [left %, top %, angle deg, length px, cycle s, delay s]
const SHOOTERS: [number, number, number, number, number, number][] = [
  [95, 4, 145, 210, 7, 0.5],
  [70, 30, 150, 160, 9, 3.2],
  [105, 48, 140, 230, 10.5, 6],
  [85, 66, 152, 170, 8, 1.8],
  [60, 12, 138, 140, 12, 8.4],
];

// Tiny still stars: [left %, top %, size px, brightness]
const STARS: [number, number, number, number][] = [
  [12, 8, 1.5, 0.8], [78, 14, 1, 0.6], [40, 22, 1.5, 0.5], [88, 38, 1, 0.7], [20, 46, 1, 0.5], [64, 54, 1.5, 0.6],
  [8, 63, 1, 0.7], [52, 72, 1, 0.5], [90, 78, 1.5, 0.6], [30, 86, 1, 0.7], [70, 92, 1, 0.5], [46, 4, 1, 0.6],
];

export function ShootingStars() {
  return (
    <div className="shooting-sky" aria-hidden>
      {STARS.map(([x, y, s, o], i) => (
        <span key={`s${i}`} className="sky-star" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, opacity: o }} />
      ))}
      {SHOOTERS.map(([x, y, angle, length, cycle, delay], i) => (
        <span key={i} className="shooter" style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${angle}deg)` }}>
          <span className="shooter-trail" style={{ width: length, animationDuration: `${cycle}s`, animationDelay: `${delay}s` }} />
        </span>
      ))}
    </div>
  );
}

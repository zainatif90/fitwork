import { useEffect, useRef, useState } from "react";

/*
 * Decorative 3D atom: a nucleus of protons (pink) and neutrons (blue) with three electrons
 * orbiting on tilted paths. Only CSS `transform` is animated (done by the graphics card, no repaints),
 * and the animation pauses while the atom is off screen, so it costs almost nothing.
 * Styles: `.atom3d` in index.css.
 */

// Nucleus particles: [x %, y %, proton?] inside the nucleus box
const NUCLEONS: [number, number, boolean][] = [
  [50, 50, true], [28, 38, false], [70, 34, true], [36, 70, true],
  [66, 68, false], [50, 22, false], [22, 58, true], [78, 54, false],
];

// Glitter: [x %, y %, size %, delay s] - small four-pointed stars that twinkle one after another
const SPARKLES: [number, number, number, number][] = [
  [8, 20, 7, 0], [88, 12, 9, 0.6], [94, 62, 6, 1.3], [74, 92, 8, 0.3], [18, 84, 9, 1.0], [2, 52, 5, 1.7],
  [50, 2, 6, 2.1], [34, 30, 4, 0.9], [66, 70, 4, 1.5], [60, 24, 5, 2.4], [28, 64, 4, 0.2], [96, 34, 5, 2.8],
];

export function Orb3D({ size = 160, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  // Pause the orbits while the atom is scrolled out of view
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`atom3d pointer-events-none ${visible ? "" : "is-paused"} ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="atom-glow" />
      {SPARKLES.map(([x, y, s, d], i) => (
        <span
          key={`s${i}`}
          className="atom-sparkle"
          style={{ left: `${x}%`, top: `${y}%`, width: `${s}%`, height: `${s}%`, animationDelay: `${d}s` }}
        />
      ))}
      <div className="atom-scene">
        {/* Three orbits, each tilted differently; the electron rides on the spinning plane */}
        {[0, 1, 2].map((i) => (
          <div key={i} className={`atom-orbit atom-orbit-${i}`}>
            <div className="atom-spin">
              <span className="atom-trail" />
              <span className="atom-electron" />
            </div>
          </div>
        ))}
        <div className="atom-nucleus">
          {NUCLEONS.map(([x, y, proton], i) => (
            <span
              key={i}
              className={proton ? "atom-proton" : "atom-neutron"}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

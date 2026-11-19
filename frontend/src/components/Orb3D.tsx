import { useEffect, useRef, useState } from "react";

/*
 * Decorative 3D atom: one shiny, glowing nucleus with three electrons
 * orbiting on tilted paths. Only CSS `transform` is animated (done by the graphics card, no repaints),
 * and the animation pauses while the atom is off screen, so it costs almost nothing.
 * Styles: `.atom3d` in index.css.
 */


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
        {/* Nucleus: one shiny ball; its colour sheen turns and a small glint sparkles on it */}
        <div className="atom-nucleus">
          <span className="atom-core" />
          <span className="atom-sheen" />
          <span className="atom-glint" />
        </div>
      </div>
    </div>
  );
}

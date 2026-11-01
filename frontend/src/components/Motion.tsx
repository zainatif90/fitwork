/** Reusable motion pieces: drifting colour glows, scroll reveal, rotating words, 3D tilt. */
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

/** Three big blurred colour blobs that slowly drift (place inside a `relative overflow-hidden` box). */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

/** Slides its content in when it scrolls into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className ?? ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Cycles through words with a 3D flip-in, e.g. "developers" -> "designers" -> "writers". */
export function RotatingWords({ words, interval = 2200, className }: { words: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);
  return (
    <span className="inline-block [perspective:600px]">
      <span key={i} className={`animate-word-in inline-block ${className ?? ""}`}>{words[i]}</span>
    </span>
  );
}

/** Tilts gently towards the mouse in 3D (desktop only; no effect on touch screens). */
export function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const [style, setStyle] = useState<CSSProperties>({});
  function onMove(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setStyle({
      transform: `perspective(900px) rotateX(${-y * max}deg) rotateY(${x * max}deg) translateZ(12px) translateY(-4px)`,
      ["--gx" as string]: `${(x + 0.5) * 100}%`,
      ["--gy" as string]: `${(y + 0.5) * 100}%`,
    });
  }
  return (
    <div className={`tilt-host relative ${className ?? ""}`} onMouseMove={onMove} onMouseLeave={() => setStyle({})}
      style={{ transition: "transform 0.25s ease-out", transformStyle: "preserve-3d", ...style }}>
      {children}
      <span className="tilt-glare" aria-hidden />
    </div>
  );
}

/*
 * Button click effect: when a button is clicked, three electrons (the same colours as the atom) fly in,
 * race around the button's rounded outline, and the button glows while they orbit. Then they fade away.
 *
 * Cheap on purpose: one small overlay per click (the previous one is removed), only `transform` and
 * `opacity` are animated (graphics card, no repaints), and nothing runs between clicks.
 * Visitors who ask their system for less motion get no effect.
 */

const COLOURS = ["#fde68a", "#f9a8d4", "#d8b4fe"]; // gold, rose, lilac (as in the atom)
const DURATION_MS = 1500;
const PAD = 7; // gap between the button edge and the electrons' path (px)
const BUTTONS = 'button, [role="button"], input[type="submit"], a.btn-3d, a[class*="bg-gradient"]';

/**
 * A point at fraction `t` (0..1) of the way around a rounded rectangle of size w x h with corner radius r,
 * starting at the middle of the top edge and going clockwise. Also returns the outward direction (nx, ny),
 * used to let the electrons fly in from outside. Coordinates are relative to the rectangle's top-left corner.
 */
export function pointOnRoundedRect(w: number, h: number, r: number, t: number): { x: number; y: number; nx: number; ny: number } {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const sw = w - 2 * r; // straight top/bottom part
  const sh = h - 2 * r; // straight left/right part
  const arc = (Math.PI / 2) * r;
  // Pieces in clockwise order from the top middle: [length, function of distance along the piece]
  const pieces: [number, (d: number) => { x: number; y: number; nx: number; ny: number }][] = [
    [sw / 2, (d) => ({ x: w / 2 + d, y: 0, nx: 0, ny: -1 })],
    [arc, (d) => corner(w - r, r, -Math.PI / 2 + d / r)],
    [sh, (d) => ({ x: w, y: r + d, nx: 1, ny: 0 })],
    [arc, (d) => corner(w - r, h - r, d / r)],
    [sw, (d) => ({ x: w - r - d, y: h, nx: 0, ny: 1 })],
    [arc, (d) => corner(r, h - r, Math.PI / 2 + d / r)],
    [sh, (d) => ({ x: 0, y: h - r - d, nx: -1, ny: 0 })],
    [arc, (d) => corner(r, r, Math.PI + d / r)],
    [sw / 2, (d) => ({ x: r + d, y: 0, nx: 0, ny: -1 })],
  ];
  function corner(cx: number, cy: number, a: number) {
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) };
  }
  const total = pieces.reduce((sum, [len]) => sum + len, 0);
  let d = (((t % 1) + 1) % 1) * total;
  for (const [len, at] of pieces) {
    if (d <= len || len === total) return at(Math.max(0, d));
    d -= len;
  }
  return pieces[0][1](0);
}

let current: HTMLElement | null = null;

function play(button: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return;
  current?.remove();

  // Overlay covering the button plus the orbit gap, in page coordinates (stays put if the page scrolls)
  const w = rect.width + 2 * PAD;
  const h = rect.height + 2 * PAD;
  const box = document.createElement("div");
  box.className = "electron-click";
  box.style.cssText = `left:${rect.left + window.scrollX - PAD}px;top:${rect.top + window.scrollY - PAD}px;width:${w}px;height:${h}px`;
  const radius = parseFloat(getComputedStyle(button).borderTopLeftRadius) || 8;

  // The glow on the button (fades in, holds while the electrons orbit, fades out)
  const glow = document.createElement("span");
  glow.className = "electron-click-glow";
  glow.style.borderRadius = `${radius + PAD}px`;
  box.appendChild(glow);
  glow.animate(
    [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "scale(1)", offset: 0.2 },
     { opacity: 1, transform: "scale(1)", offset: 0.7 }, { opacity: 0, transform: "scale(1.04)" }],
    { duration: DURATION_MS, easing: "ease-out" },
  );

  // Three electrons, a third of a lap apart: fly in from outside, do ~1.3 laps, fade out
  const STEPS = 60;
  COLOURS.forEach((colour, i) => {
    const e = document.createElement("span");
    e.className = "electron-click-dot";
    e.style.setProperty("--c", colour);
    box.appendChild(e);
    const frames: Keyframe[] = [];
    for (let s = 0; s <= STEPS; s++) {
      const k = s / STEPS;
      const p = pointOnRoundedRect(w, h, radius + PAD, i / 3 + 1.3 * k * k * (3 - 2 * k)); // eases in and out
      const fly = 36 * Math.max(0, 1 - k / 0.22) ** 2; // distance still to travel inwards
      frames.push({
        transform: `translate(${p.x + p.nx * fly}px, ${p.y + p.ny * fly}px) scale(${k < 0.15 ? 0.4 + 4 * k : 1})`,
        opacity: k < 0.12 ? k / 0.12 : k > 0.8 ? (1 - k) / 0.2 : 1,
      });
    }
    e.animate(frames, { duration: DURATION_MS, delay: i * 60, fill: "both" });
  });

  document.body.appendChild(box);
  current = box;

  // Follow the button if the page moves it while the effect plays (e.g. an error message appears above it)
  const started = performance.now();
  const follow = () => {
    if (current !== box || performance.now() - started > DURATION_MS + 150) {
      box.remove();
      if (current === box) current = null;
      return;
    }
    if (button.isConnected) {
      const r = button.getBoundingClientRect();
      box.style.left = `${r.left + window.scrollX - PAD}px`;
      box.style.top = `${r.top + window.scrollY - PAD}px`;
    }
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
}

/** Call once at start-up: every button click on the site gets the electron effect. */
export function installElectronClick(): void {
  if (typeof window === "undefined" || typeof Element.prototype.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  document.addEventListener("click", (ev) => {
    const target = ev.target instanceof Element ? ev.target.closest<HTMLElement>(BUTTONS) : null;
    if (!target || (target as HTMLButtonElement).disabled) return;
    play(target);
  }, { capture: true, passive: true });
}

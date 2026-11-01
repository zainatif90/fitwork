/** Decorative 3D gyroscope: three glowing rings spinning on different axes around a glowing core. */
export function Orb3D({ size = 160, className }: { size?: number; className?: string }) {
  return (
    <div className={`orb3d pointer-events-none ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden>
      <div className="orb-stage">
        <span className="ring" />
        <span className="ring" />
        <span className="ring" />
      </div>
      <span className="core" />
    </div>
  );
}

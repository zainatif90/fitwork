import { describe, expect, it } from "vitest";

import { pointOnRoundedRect } from "./electronClick";

describe("pointOnRoundedRect (path of the electrons around a clicked button)", () => {
  const W = 200, H = 40, R = 12;

  it("starts at the middle of the top edge, pointing outwards (up)", () => {
    expect(pointOnRoundedRect(W, H, R, 0)).toEqual({ x: 100, y: 0, nx: 0, ny: -1 });
  });

  it("is half way round at the middle of the bottom edge", () => {
    const p = pointOnRoundedRect(W, H, R, 0.5);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(H);
    expect(p.ny).toBe(1);
  });

  it("stays on the outline: every point is on an edge or on a corner arc", () => {
    for (let i = 0; i < 100; i++) {
      const { x, y } = pointOnRoundedRect(W, H, R, i / 100);
      const onEdge = Math.abs(y) < 1e-9 || Math.abs(y - H) < 1e-9 || Math.abs(x) < 1e-9 || Math.abs(x - W) < 1e-9;
      const cx = x < R ? R : x > W - R ? W - R : x;
      const cy = y < R ? R : y > H - R ? H - R : y;
      const onArc = Math.abs(Math.hypot(x - cx, y - cy) - R) < 1e-6;
      expect(onEdge || onArc).toBe(true);
    }
  });

  it("wraps around: t = 1.25 is the same point as t = 0.25", () => {
    expect(pointOnRoundedRect(W, H, R, 1.25)).toEqual(pointOnRoundedRect(W, H, R, 0.25));
  });

  it("works for a round button (radius larger than half the height)", () => {
    const p = pointOnRoundedRect(40, 40, 99, 0.25);
    expect(p.x).toBeCloseTo(40);
    expect(p.y).toBeCloseTo(20);
  });
});

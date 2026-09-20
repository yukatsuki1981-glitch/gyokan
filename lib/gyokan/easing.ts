/**
 * Standard cubic-bezier solver (Newton-Raphson with bisection fallback).
 * Lets a release animation match an exact easing curve/duration that
 * native smooth-scroll can't guarantee.
 */
export function makeCubicBezierEasing(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
): (x: number) => number {
  const a = (x1: number, x2: number) => 1 - 3 * x2 + 3 * x1;
  const b = (x1: number, x2: number) => 3 * x2 - 6 * x1;
  const c = (x1: number) => 3 * x1;

  const calcBezier = (t: number, x1: number, x2: number) =>
    ((a(x1, x2) * t + b(x1, x2)) * t + c(x1)) * t;
  const getSlope = (t: number, x1: number, x2: number) =>
    3 * a(x1, x2) * t * t + 2 * b(x1, x2) * t + c(x1);

  const getTForX = (x: number) => {
    let t = x;
    for (let i = 0; i < 4; i++) {
      const slope = getSlope(t, p1x, p2x);
      if (slope === 0) break;
      t -= (calcBezier(t, p1x, p2x) - x) / slope;
    }
    if (Math.abs(calcBezier(t, p1x, p2x) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 12; i++) {
        const current = calcBezier(t, p1x, p2x);
        if (Math.abs(current - x) < 1e-6) break;
        if (current < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return t;
  };

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return calcBezier(getTForX(x), p1y, p2y);
  };
}

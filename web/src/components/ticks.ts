export function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

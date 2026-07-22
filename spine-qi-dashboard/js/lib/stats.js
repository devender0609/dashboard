/* stats.js — descriptive statistics, confidence intervals, control-chart limits.
   No statistical-significance claims are made anywhere in this library; it only
   returns estimates and intervals for display. */
(function () {
  const S = {};

  S.sum = a => a.reduce((x, y) => x + y, 0);
  S.mean = a => (a.length ? S.sum(a) / a.length : null);

  S.median = a => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  S.quantile = (a, q) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };

  S.iqr = a => (a.length ? [S.quantile(a, 0.25), S.quantile(a, 0.75)] : null);

  S.sd = a => {
    if (a.length < 2) return null;
    const m = S.mean(a);
    return Math.sqrt(S.sum(a.map(x => (x - m) ** 2)) / (a.length - 1));
  };

  /* Wilson score 95% CI for a proportion — preferred over normal approximation
     for the small samples typical of a single clinic. */
  S.wilsonCI = (successes, n, z = 1.96) => {
    if (!n) return null;
    const p = successes / n, z2 = z * z;
    const denom = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denom;
    const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
    return [Math.max(0, center - half), Math.min(1, center + half)];
  };

  /* 95% CI for a mean (t≈z for n>=30, otherwise a light t adjustment table). */
  const T95 = { 2: 12.71, 3: 4.30, 4: 3.18, 5: 2.78, 6: 2.57, 7: 2.45, 8: 2.36, 9: 2.31, 10: 2.26, 15: 2.14, 20: 2.09, 25: 2.06, 30: 2.04 };
  S.meanCI = a => {
    const n = a.length;
    if (n < 2) return null;
    const m = S.mean(a), sd = S.sd(a);
    let t = 1.96;
    if (n < 30) { const keys = Object.keys(T95).map(Number); t = T95[keys.reduce((b, k) => (k <= n ? k : b), 2)]; }
    const half = t * sd / Math.sqrt(n);
    return [m - half, m + half];
  };

  /* p-chart limits for proportion control charts (per-period n varies). */
  S.pChart = periods => {
    const totalN = S.sum(periods.map(p => p.n));
    const totalX = S.sum(periods.map(p => p.x));
    if (!totalN) return null;
    const pBar = totalX / totalN;
    return {
      pBar,
      points: periods.map(p => {
        const sigma = p.n ? Math.sqrt(pBar * (1 - pBar) / p.n) : 0;
        return {
          ...p,
          p: p.n ? p.x / p.n : null,
          ucl: Math.min(1, pBar + 3 * sigma),
          lcl: Math.max(0, pBar - 3 * sigma),
          signal: p.n ? (p.x / p.n > pBar + 3 * sigma || p.x / p.n < pBar - 3 * sigma) : false
        };
      })
    };
  };

  /* XmR (individuals) chart limits for continuous values over time. */
  S.xmrChart = values => {
    if (values.length < 2) return null;
    const mrs = [];
    for (let i = 1; i < values.length; i++) mrs.push(Math.abs(values[i] - values[i - 1]));
    const mrBar = S.mean(mrs);
    const xBar = S.mean(values);
    return { xBar, ucl: xBar + 2.66 * mrBar, lcl: xBar - 2.66 * mrBar };
  };

  S.round = (v, d = 1) => (v === null || v === undefined || isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
  S.pct = (num, den, d = 1) => (den ? S.round((num / den) * 100, d) : null);

  /* Minimum sample size below which comparisons are flagged as unreliable. */
  S.MIN_N = 10;

  window.SQIStats = S;
  if (typeof module !== "undefined") module.exports = S; // allows Node smoke tests
})();

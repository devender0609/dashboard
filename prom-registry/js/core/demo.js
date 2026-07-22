/* demo.js — deterministic synthetic PROM demonstration data (seed 20260701).
   SYNTHETIC ONLY: subjects are study IDs, no real patient information.
   Loaded on demand from the Import page so users can explore before loading
   their own REDCap/PROMIS/portal export. */
(function () {
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const R = rng(20260701);
  const pick = a => a[Math.floor(R() * a.length)];
  const chance = p => R() < p;
  const norm = (m, s) => { const u = Math.max(R(), 1e-9), v = Math.max(R(), 1e-9); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const DAY = 86400000, iso = d => new Date(d).toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(s + "T00:00:00").getTime() + n * DAY);
  const AS_OF = "2026-07-01";
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / DAY);

  const COHORTS = [["Lumbar", "ODI"], ["Cervical", "NDI"], ["Deformity", "SRS-22r"]];
  const PROVIDERS = ["Dr. A. Rivera", "Dr. B. Chen", "Dr. C. Osei", "Dr. D. Malhotra"];
  const TPS = [["baseline", 0, 0], ["6w", 42, 14], ["3m", 91, 21], ["6m", 182, 42], ["12m", 365, 56], ["24m", 730, 84]];
  const INSTR = {
    "ODI": { dir: -1, base: [46, 12], gain: [16, 10], min: 0, max: 100 },
    "NDI": { dir: -1, base: [42, 11], gain: [14, 9], min: 0, max: 100 },
    "SRS-22r": { dir: +1, base: [2.9, 0.5], gain: [0.6, 0.4], min: 1, max: 5 },
    "PROMIS-PF": { dir: +1, base: [36, 6], gain: [6, 4], min: 20, max: 80 },
    "NRS-Pain": { dir: -1, base: [6.8, 1.4], gain: [2.8, 1.8], min: 0, max: 10 }
  };

  function generate() {
    const subjects = [], scores = [];
    for (let i = 1; i <= 90; i++) {
      const [cohort, primary] = pick(COHORTS);
      const anchor = iso(new Date(2023, 6, 1).getTime() + R() * (new Date(2026, 4, 1) - new Date(2023, 6, 1)));
      const id = "S-" + String(i).padStart(4, "0");
      subjects.push({ subjectId: id, cohort, anchorDate: anchor, diagnosis: cohort + " spine condition", provider: pick(PROVIDERS) });
      const set = [primary, "PROMIS-PF", "NRS-Pain"];
      // ~10% of subjects worsen over time (negative responders) so the
      // deterioration worklist category is populated in the demo.
      const worsens = chance(0.10);
      const shift = worsens ? -Math.abs(norm(1.6, 0.5)) : norm(0, 0.8);
      const hasBase = chance(0.9);
      set.forEach(instr => {
        const c = INSTR[instr]; const baseVal = norm(c.base[0], c.base[1]);
        TPS.forEach(([code, days, win]) => {
          if (code === "baseline" && !hasBase) return;
          const due = addDays(anchor, days);
          if (daysBetween(due, AS_OF) < -win) return;             // not yet due
          const comp = code === "baseline" ? 1 : [0.8, 0.72, 0.64, 0.5, 0.4][TPS.findIndex(t => t[0] === code) - 1];
          if (code !== "baseline" && !chance(comp)) return;        // missing follow-up
          const frac = Math.min(1, days / 365);
          // improvement magnitude (positive = better); worseners get a clearly
          // negative improvement that exceeds the MCID so deterioration triggers.
          const improvement = worsens
            ? -(c.gain[0] * 0.45 + Math.abs(norm(0, c.gain[1]))) * Math.sqrt(frac || 0)
            : (norm(c.gain[0], c.gain[1]) + shift * c.gain[1] * 0.6) * Math.sqrt(frac || 0);
          let v = code === "baseline" ? baseVal : baseVal + c.dir * improvement;
          v = Math.min(c.max, Math.max(c.min, v));
          const off = code === "baseline" ? 0 : Math.round(norm(0, win * 0.5));
          scores.push({ subjectId: id, instrument: instr, timepoint: code, collectedDate: addDays(due, off), score: Math.round(v * 10) / 10, source: pick(["Portal", "Portal", "Clinic tablet", "REDCap"]) });
        });
      });
    }
    // a couple of deliberate data-quality issues
    if (subjects[4]) subjects[4].anchorDate = "";
    return { subjects, scores };
  }

  window.PROMDemo = { generate, AS_OF };
  if (typeof module !== "undefined") module.exports = window.PROMDemo;
})();

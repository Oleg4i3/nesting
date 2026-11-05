// node test_puzzle.js
const N = require('./raster.js');
const P = require('./puzzle.js');
const f = (x, d = 1) => (+x).toFixed(d);

const configs = [];
for (const pieces of [6, 10, 16, 24])
  for (const wiggle of [0, 0.5, 1])
    for (const waste of [0, 0.1])
      configs.push({ pieces, wiggle, waste, rules: { rotations: 'any', mirror: true } });
configs.push({ pieces: 10, wiggle: 0.5, waste: 0, rules: { rotations: 'none', mirror: false } });
configs.push({ pieces: 16, wiggle: 0.5, waste: 0, rules: { rotations: 'half', mirror: false } });

const SEEDS = 6;
let badTruth = 0, total = 0, scaled = 0;
console.log('деталей wiggle waste  правила      | еталон  | жадібний: ефект. ratio | best-of-20 random: ефект. ratio | мс/розв');
for (const c of configs) {
  let eP = 0, eG = 0, rG = 0, eR = 0, rR = 0, ms = 0, n = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const pz = P.generate({ width: 300, length: 500, seed, ...c });
    total++; if (pz.meta.ampScale < 1 && c.wiggle > 0) scaled++;
    // 1) еталон відновлюється з перемішаних деталей: кожна ставиться в сітку без перетину
    const g = new N.Grid(300, 500);
    pz.pieces.forEach((p, i) => {
      const s = pz.solution[i], v = new N.Variant(p, s.rot, s.mirror);
      if (!g.fits(v, s.px, s.py)) badTruth++;
      g.place(v, s.px, s.py);
    });
    if (g.filledCells() !== pz.meta.cells) badTruth++;
    // 2) евристика
    const t0 = Date.now();
    const r = P.solveGreedy(pz.pieces, pz.rules, { width: 300, maxLength: 3000 });
    ms += Date.now() - t0;
    const rng = P.mulberry32(seed);
    let bestR = null;
    for (let k = 0; k < 20; k++) {
      const q = P.solveGreedy(pz.pieces, pz.rules, { width: 300, maxLength: 3000, order: 'random', rng });
      if (!bestR || q.lengthPx < bestR.lengthPx) bestR = q;
    }
    eP += pz.meta.plantedEfficiency; eG += r.efficiency; rG += pz.meta.plantedLength / r.lengthPx;
    eR += bestR.efficiency; rR += pz.meta.plantedLength / bestR.lengthPx; n++;
  }
  const rl = c.rules.rotations + (c.rules.mirror ? '+m' : '');
  console.log(String(c.pieces).padStart(5), String(c.wiggle).padStart(6), String(c.waste).padStart(5), ' ', rl.padEnd(10), '|',
    f(eP / n * 100, 0).padStart(5) + '%  |', f(eG / n * 100).padStart(14) + '%', f(rG / n, 2).padStart(5), ' |',
    f(eR / n * 100).padStart(20) + '%', f(rR / n, 2).padStart(5), ' |', f(ms / n, 0).padStart(5));
}
console.log(`\nПазлів: ${total}; помилок відновлення еталона: ${badTruth}; пазлів, де довелося зменшити амплітуду кривих: ${scaled}`);

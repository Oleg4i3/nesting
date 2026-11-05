// Фінальне порівняння на 20 пазлах hard20 (seed 95001..): евристики, стара мережа, дистильовані мережі, ширина променя.
// node final_study.js <частина> <частин> [тег=final]
const fs = require('fs');
const NN = require('./nn.js'), X = require('./nnx.js'), Bm = require('./beam.js'), P = require('./puzzle.js'), N = require('./raster.js');
const { randomSpecHard20, makePuzzle } = require('./common.js');
const part = +process.argv[2] || 0, parts = +process.argv[3] || 1, tag = process.argv[4] || 'final';
const ld = f => X.MLPX.fromJSON(JSON.parse(fs.readFileSync(f, 'utf8')));
const learned = {
  'стара мережа (ES)': NN.MLP.fromJSON(JSON.parse(fs.readFileSync('weights/net_es.json', 'utf8'))),
};
for (const arg of process.argv.slice(5)) { const [nm, file] = arg.split('='); learned[nm] = ld(file); }
const WIDTHS = [1, 4, 16, 64];
fs.mkdirSync('results', { recursive: true });
const outFile = `results/${tag}_part${part}.jsonl`, doneSeeds = new Set();
if (fs.existsSync(outFile)) for (const l of fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean)) doneSeeds.add(JSON.parse(l).seed);
const out = fs.openSync(outFile, 'a');
for (let i = 0; i < 20; i++) {
  if (i % parts !== part) continue;
  const seed = 95001 + i; if (doneSeeds.has(seed)) continue;
  const pz = makePuzzle(randomSpecHard20(seed));
  const row = { seed, pieces: pz.pieces.length, rules: pz.rules, planted: pz.meta.plantedEfficiency, res: {} };
  row.greedy = P.solveGreedy(pz.pieces, pz.rules, { width: pz.width, maxLength: 4000 }).efficiency;
  const hs = new Bm.HeurAreaScorer();
  for (const B of WIDTHS) {
    const t = Date.now(), r = Bm.solveBeam(pz.pieces, pz.rules, hs, { width: pz.width, maxLength: 4000, beam: B, rank: 'waste', order: 'area' });
    row.res[`евристика (порядок за площею)|${B}`] = { eff: r.efficiency, ms: Date.now() - t };
  }
  for (const [nm, net] of Object.entries(learned)) for (const B of WIDTHS) {
    const t = Date.now(), r = Bm.solveBeam(pz.pieces, pz.rules, net, { width: pz.width, maxLength: 4000, beam: B, rank: 'logp' });
    // незалежна перевірка найкращої розкладки
    const ev = N.evaluateLayout(P.placementsToPolys(pz.pieces, r.placements), { width: pz.width, height: 4000 });
    if (!ev.valid || r.placed !== pz.pieces.length) throw new Error(`недійсна розкладка seed ${seed} ${nm} B=${B}`);
    row.res[`${nm}|${B}`] = { eff: r.efficiency, effIndep: ev.efficiency, ms: Date.now() - t };
  }
  fs.writeSync(out, JSON.stringify(row) + '\n');
  console.log(`[${part}] ${i} seed ${seed} готово`);
}

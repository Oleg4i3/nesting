// Залежність якості від ширини променя.  node beam_study.js <частина> <частин> [кількість_пазлів]
// Пише рядки JSON у results/beam_part<частина>.jsonl
const fs = require('fs');
const NN = require('./nn.js'), P = require('./puzzle.js'), Fe = require('./features.js'), Bm = require('./beam.js');
const { randomSpecHard20, makePuzzle } = require('./common.js');
const part = +process.argv[2] || 0, parts = +process.argv[3] || 1, NP = +process.argv[4] || 20;
const net = NN.MLP.fromJSON(JSON.parse(fs.readFileSync('weights/net_es.json', 'utf8')));
const scorers = { 'лінійний': new Bm.LinearScorer(), 'мережа(стара)': net };
const WIDTHS = [1, 2, 4, 8, 16, 32];
fs.mkdirSync('results', { recursive: true });
const out = fs.openSync(`results/beam_part${part}.jsonl`, 'w');
for (let i = 0; i < NP; i++) {
  if (i % parts !== part) continue;
  const seed = 95001 + i, spec = randomSpecHard20(seed), pz = makePuzzle(spec);
  const row = { seed, pieces: pz.pieces.length, rules: spec.rules, planted: pz.meta.plantedEfficiency, res: {} };
  let t = Date.now();
  row.greedy = P.solveGreedy(pz.pieces, pz.rules, { width: pz.width, maxLength: 4000 }).efficiency; row.greedyMs = Date.now() - t;
  const rng = NN.mulberry32(seed); let best = 0; t = Date.now();
  for (let k = 0; k < 20; k++) best = Math.max(best, P.solveGreedy(pz.pieces, pz.rules, { width: pz.width, maxLength: 4000, order: 'random', rng }).efficiency);
  row.greedy20 = best; row.greedy20Ms = Date.now() - t;
  for (const [sn, sc] of Object.entries(scorers)) for (const rank of ['waste', 'logp']) for (const B of WIDTHS) {
    t = Date.now();
    const r = Bm.solveBeam(pz.pieces, pz.rules, sc, { width: pz.width, maxLength: 4000, beam: B, rank });
    row.res[`${sn}|${rank}|${B}`] = { eff: r.efficiency * (r.placed / pz.pieces.length), ms: Date.now() - t };
  }
  fs.writeSync(out, JSON.stringify(row) + '\n');
  console.log(`[${part}] puzzle ${i} seed ${seed} done`);
}

// Друге дослідження променя: ширші промені для мережі + евристика (порядок за площею) при тому самому пошуку.
// node beam_study2.js <частина> <частин> [кількість_пазлів] [шлях_до_ваг_nnx.json]
const fs = require('fs');
const NN = require('./nn.js'), X = require('./nnx.js'), Bm = require('./beam.js');
const { randomSpecHard20, makePuzzle } = require('./common.js');
const part = +process.argv[2] || 0, parts = +process.argv[3] || 1, NP = +process.argv[4] || 20, extra = process.argv[5];
const old = NN.MLP.fromJSON(JSON.parse(fs.readFileSync('weights/net_es.json', 'utf8')));
const scorers = {
  'мережа(стара)': { sc: old, rank: 'logp', order: undefined, widths: [32, 64, 128] },
  'евристика-площа': { sc: new Bm.HeurAreaScorer(), rank: 'waste', order: 'area', widths: [1, 4, 16, 32, 64, 128] },
  'евристика-площа logp': { sc: new Bm.HeurAreaScorer(), rank: 'logp', order: 'area', widths: [1, 4, 16, 32, 64, 128] },
};
if (extra) scorers['нова: ' + extra] = { sc: X.MLPX.fromJSON(JSON.parse(fs.readFileSync(extra, 'utf8'))), rank: 'logp', order: undefined, widths: [1, 4, 16, 32, 64] };
fs.mkdirSync('results', { recursive: true });
const out = fs.openSync(`results/beam2_part${part}.jsonl`, 'w');
for (let i = 0; i < NP; i++) {
  if (i % parts !== part) continue;
  const seed = 95001 + i, pz = makePuzzle(randomSpecHard20(seed)), row = { seed, pieces: pz.pieces.length, res: {} };
  for (const [sn, c] of Object.entries(scorers)) for (const B of c.widths) {
    const t = Date.now();
    const r = require('./beam.js').solveBeam(pz.pieces, pz.rules, c.sc, { width: pz.width, maxLength: 4000, beam: B, rank: c.rank, order: c.order });
    row.res[`${sn}|${B}`] = { eff: r.efficiency * (r.placed / pz.pieces.length), ms: Date.now() - t };
  }
  fs.writeSync(out, JSON.stringify(row) + '\n');
  console.log(`[${part}] puzzle ${i} seed ${seed} done`);
}

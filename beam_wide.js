// Ширші промені для однієї мережі на тих самих 20 пазлах. node beam_wide.js <частина> <частин> <ваги.json> <ширини через кому>
const fs = require('fs');
const X = require('./nnx.js'), Bm = require('./beam.js');
const { randomSpecHard20, makePuzzle } = require('./common.js');
const part = +process.argv[2], parts = +process.argv[3], net = X.MLPX.fromJSON(JSON.parse(fs.readFileSync(process.argv[4], 'utf8')));
const widths = process.argv[5].split(',').map(Number);
const out = fs.openSync(`results/wide_part${part}.jsonl`, 'w');
for (let i = 0; i < 20; i++) {
  if (i % parts !== part) continue;
  const seed = 95001 + i, pz = makePuzzle(randomSpecHard20(seed)), row = { seed, res: {} };
  for (const B of widths) {
    const t = Date.now(), r = Bm.solveBeam(pz.pieces, pz.rules, net, { width: pz.width, maxLength: 4000, beam: B, rank: 'logp' });
    row.res[B] = { eff: r.efficiency, ms: Date.now() - t, placed: r.placed === pz.pieces.length };
  }
  fs.writeSync(out, JSON.stringify(row) + '\n'); console.log(`[${part}] ${i} готово`);
}

// Етап A: навчання ранжуванню за еталоном пазлів. node train_imitation.js
const fs = require('fs');
const F = require('./features.js');
const NN = require('./nn.js');
const P = require('./puzzle.js');
const { randomSpec, makePuzzle } = require('./common.js');

const NTRAIN = +process.argv[2] || 400, NVAL = 40;
fs.mkdirSync('weights', { recursive: true });
const t0 = Date.now(), el = () => ((Date.now() - t0) / 1000).toFixed(0) + 'с';

const build = seeds => { const out = []; for (const s of seeds) { try { out.push(...F.buildImitationSamples(makePuzzle(randomSpec(s)))); } catch (e) { console.log('пропуск seed', s, e.message); } } return out; };
const trainSeeds = Array.from({ length: NTRAIN }, (_, i) => 1 + i), valSeeds = Array.from({ length: NVAL }, (_, i) => 5001 + i);
const train = build(trainSeeds), val = build(valSeeds);
console.log(`[${el()}] зразків (кроків): train ${train.length}, val ${val.length}; кандидатів у кроці ~${(train.reduce((a, s) => a + s.count, 0) / train.length).toFixed(0)}, позитивів ~${(train.reduce((a, s) => a + s.pos.reduce((x, y) => x + y, 0), 0) / train.length).toFixed(1)}`);

const net = new NN.MLP().init(1);
const before = { hitVal: val.reduce((a, s) => a + net.hit(s), 0) / val.length };
console.log('до навчання: top-1 збіг на val =', before.hitVal.toFixed(3));
NN.trainImitation(net, train, val, { epochs: 40, onLog: r => console.log(`[${el()}] ep ${r.ep} loss ${r.loss.toFixed(3)} trainHit ${r.trainHit.toFixed(3)} valHit ${r.valHit.toFixed(3)}`) });
fs.writeFileSync('weights/net_imitation.json', JSON.stringify(net.toJSON()));

// якість як розкрійника на val-пазлах
let eN = 0, eG = 0, eP = 0, n = 0;
for (const s of valSeeds) {
  const pz = makePuzzle(randomSpec(s));
  const r = F.solveNN(pz.pieces, pz.rules, net, { width: pz.width, maxLength: 3000 });
  const g = P.solveGreedy(pz.pieces, pz.rules, { width: pz.width, maxLength: 3000 });
  eN += r.efficiency; eG += g.efficiency; eP += pz.meta.plantedEfficiency; n++;
}
console.log(`[${el()}] val-пазли (${n}): еталон ${(eP / n * 100).toFixed(1)}%  жадібна ${(eG / n * 100).toFixed(1)}%  мережа(імітація) ${(eN / n * 100).toFixed(1)}%`);

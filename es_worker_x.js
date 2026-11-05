// Воркер ES для узагальненої мережі: workerData = {F, hidden, act, skip}; повідомлення {id, params, seeds, kind}
const { parentPort, workerData } = require('worker_threads');
const F = require('./features.js');
const X = require('./nnx.js');
const C = require('./common.js');
const net = new X.MLPX(workerData.F, workerData.hidden, workerData.act, workerData.skip);
const specFn = { mid: C.randomSpecMid, hard20: C.randomSpecHard20, old: C.randomSpec };
parentPort.on('message', m => {
  net.p.set(m.params);
  let sum = 0;
  for (const seed of m.seeds) {
    const pz = C.makePuzzle(specFn[m.kind](seed));
    const r = F.solveNN(pz.pieces, pz.rules, net, { width: pz.width, maxLength: 4000 });
    sum += r.efficiency * (r.placed / pz.pieces.length);
  }
  parentPort.postMessage({ id: m.id, fit: sum / m.seeds.length });
});

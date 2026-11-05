// Воркер для ES: рахує середню ефективність мережі на наборі специфікацій пазлів.
const { parentPort } = require('worker_threads');
const F = require('./features.js');
const NN = require('./nn.js');
const { makePuzzle } = require('./common.js');

const net = new NN.MLP();
parentPort.on('message', m => {
  net.p.set(m.params);
  let sum = 0;
  for (const spec of m.specs) {
    const pz = makePuzzle(spec);
    const r = F.solveNN(pz.pieces, pz.rules, net, { width: pz.width, maxLength: 3000 });
    // нерозміщені деталі штрафуються
    sum += r.efficiency * (r.placed / pz.pieces.length);
  }
  parentPort.postMessage({ id: m.id, fit: sum / m.specs.length });
});

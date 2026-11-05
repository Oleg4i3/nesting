// Воркер ES (донавчання з підкріпленням): отримує ваги й перелік задач, повертає середню винагороду = щільність розкладки
// (недокладені деталі штрафуються часткою розміщених). Політика — жадібний режим «мережа вибирає (деталь, варіант), позиція BL».
const { parentPort, workerData } = require('worker_threads');
const X = require('./nnx.js'), T = require('./rl_tasks.js'), Gd = require('./guided.js');
const net = X.MLPX.fromJSON(workerData.net), cache = new Map();
const task = s => { const k = JSON.stringify(s); if (!cache.has(k)) { if (cache.size > 400) cache.clear(); cache.set(k, T.build(s)); } return cache.get(k); };
parentPort.on('message', m => {
  net.p.set(m.params); let sum = 0;
  for (const s of m.specs) {
    const t = task(s);
    try {
      const g = Gd.solveGuided(t.pcs, t.rules, net, { width: t.W, maxLength: 4000, temp: 0, budgetMs: 1, maxIters: 1, blocked: t.blocked });
      const e = T.evaluate(t, g.placements);
      sum += e ? e.dens : (g.efficiency * g.placed / t.pcs.length) * 0.5;
    } catch (err) { sum += 0; }
  }
  parentPort.postMessage({ id: m.id, fit: sum / m.specs.length });
});

// Етап B: ES (OpenAI-ES, антитетична вибірка) за реальною метрикою — ефективністю розкладки.
// node train_es.js [iterations] [pairs] [batch]
const fs = require('fs');
const { Worker } = require('worker_threads');
const NN = require('./nn.js');
const { randomSpec } = require('./common.js');

const ITERS = +process.argv[2] || 60, PAIRS = +process.argv[3] || 10, BATCH = +process.argv[4] || 8;
const SIGMA = 0.06, LR = 0.03, NWORK = 2, VAL = Array.from({ length: 24 }, (_, i) => randomSpec(5001 + i));
const POOL_SEEDS = Array.from({ length: 400 }, (_, i) => 1 + i);

class Pool {
  constructor(n) {
    this.workers = Array.from({ length: n }, () => new Worker('./es_worker.js'));
    this.pending = new Map(); this.id = 0;
    this.workers.forEach(w => w.on('message', m => { const cb = this.pending.get(m.id); this.pending.delete(m.id); cb(m.fit); }));
  }
  /** tasks: [{params, specs}] -> Promise<number[]> */
  run(tasks) {
    return new Promise(resolve => {
      const res = new Array(tasks.length); let next = 0, done = 0;
      const feed = w => {
        if (next >= tasks.length) return;
        const i = next++, id = ++this.id;
        this.pending.set(id, fit => { res[i] = fit; if (++done === tasks.length) resolve(res); else feed(w); });
        w.postMessage({ id, params: tasks[i].params, specs: tasks[i].specs });
      };
      this.workers.forEach(feed);
    });
  }
  close() { this.workers.forEach(w => w.terminate()); }
}

(async () => {
  const net = NN.MLP.fromJSON(JSON.parse(fs.readFileSync(process.argv[5] || 'weights/net_imitation.json', 'utf8')));
  const pool = new Pool(NWORK), rng = NN.mulberry32(12345), opt = new NN.Adam(net.n, LR);
  const t0 = Date.now(), el = () => ((Date.now() - t0) / 1000).toFixed(0) + 'с';
  const evalVal = async p => { const half = VAL.length / 2; const r = await pool.run([{ params: p, specs: VAL.slice(0, half) }, { params: p, specs: VAL.slice(half) }]); return (r[0] + r[1]) / 2; };

  let best = await evalVal(net.p), bestP = Float64Array.from(net.p);
  console.log(`[${el()}] старт: val ефективність ${(best * 100).toFixed(2)}%`);
  for (let it = 1; it <= ITERS; it++) {
    const specs = Array.from({ length: BATCH }, () => randomSpec(POOL_SEEDS[Math.floor(rng() * POOL_SEEDS.length)]));
    const eps = [], tasks = [];
    for (let k = 0; k < PAIRS; k++) {
      const e = new Float64Array(net.n).map(() => NN.gauss(rng)); eps.push(e);
      const pp = Float64Array.from(net.p, (v, i) => v + SIGMA * e[i]), pm = Float64Array.from(net.p, (v, i) => v - SIGMA * e[i]);
      tasks.push({ params: Array.from(pp), specs }, { params: Array.from(pm), specs });
    }
    tasks.push({ params: Array.from(net.p), specs });           // поточна мережа на цьому ж батчі
    const fits = await pool.run(tasks);
    const cur = fits.pop();
    // центровані рангові ваги
    const order = fits.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]), u = new Array(fits.length);
    order.forEach(([, i], r) => { u[i] = r / (fits.length - 1) - 0.5; });
    const g = new Float64Array(net.n);
    for (let k = 0; k < PAIRS; k++) { const d = u[2 * k] - u[2 * k + 1]; for (let i = 0; i < net.n; i++) g[i] += d * eps[k][i]; }
    for (let i = 0; i < net.n; i++) g[i] = -g[i] / (2 * PAIRS * SIGMA);       // Adam мінімізує → мінус
    opt.step(net.p, g, 1e-4);
    let line = `[${el()}] it ${it} batch: поточна ${(cur * 100).toFixed(2)}% найкраща з популяції ${(Math.max(...fits) * 100).toFixed(2)}%`;
    if (it % 5 === 0 || it === ITERS) {
      const v = await evalVal(net.p); line += `  | val ${(v * 100).toFixed(2)}%`;
      if (v > best) { best = v; bestP = Float64Array.from(net.p); fs.writeFileSync('weights/net_es.json', JSON.stringify(Object.assign(net.toJSON(), { params: Array.from(bestP) }))); line += ' *'; }
    }
    console.log(line);
  }
  pool.close();
  console.log(`[${el()}] готово. найкраща val ефективність ${(best * 100).toFixed(2)}%`);
})();

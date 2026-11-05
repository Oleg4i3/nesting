// Донавчання мережі з підкріпленням (OpenAI-ES, антитетична вибірка, нагорода = щільність розкладки на реальних деталях).
// node rl_train.js <ім'я> <стартові ваги> <конфіг: real|scen|free|freescen> [ітерацій=80] [пар=14] [задач на батч=24] [sigma=0.04]
const fs = require('fs'), { Worker } = require('worker_threads'), X = require('./nnx.js'), NN = require('./nn.js'), P = require('./puzzle.js');
const name = process.argv[2], start = process.argv[3], cfg = process.argv[4] || 'real';
const ITERS = +process.argv[5] || 80, PAIRS = +process.argv[6] || 14, BATCH = +process.argv[7] || 24, SIGMA = +process.argv[8] || 0.04, LR = 0.02, NW = +process.env.NW || 2;
const TRAIN_SETS = ['albano', 'dagli', 'swim', 'trousers'];
const free = cfg.startsWith('free'), scen = cfg.endsWith('scen');
const KINDS = ['plain', 'defects', 'ragged', 'both'];
const mk = (seed, i) => ({ set: TRAIN_SETS[(seed + i) % 4], kind: scen ? KINDS[(seed * 3 + i) % 4] : 'plain', seed, n: free ? 14 : 18, rot: free ? 'deg5' : 'dataset' });
const rng = P.mulberry32(2024 + ITERS), valSpecs = Array.from({ length: 32 }, (_, i) => mk(5000 + i, i));
const netJ = JSON.parse(fs.readFileSync(start, 'utf8')), net = X.MLPX.fromJSON(netJ);
class Pool {
  constructor() { this.ws = Array.from({ length: NW }, () => { const w = new Worker('./rl_worker.js', { workerData: { net: netJ } }); w.on('message', m => { const f = this.pend.get(m.id); this.pend.delete(m.id); f(m.fit); }); return w; }); this.pend = new Map(); this.id = 0; }
  run(jobs) { return new Promise(res => { const out = new Array(jobs.length); let nx = 0, done = 0; const feed = w => { if (nx >= jobs.length) return; const i = nx++, id = ++this.id; this.pend.set(id, f => { out[i] = f; if (++done === jobs.length) res(out); else feed(w); }); w.postMessage({ id, params: jobs[i].params, specs: jobs[i].specs }); }; this.ws.forEach(feed); }); }
  close() { this.ws.forEach(w => w.terminate()); }
}
(async () => {
  const pool = new Pool(), t0 = Date.now(), el = () => ((Date.now() - t0) / 1000).toFixed(0) + 'с', opt = new NN.Adam(net.n, LR);
  const val = async p => { const h = 16, r = await pool.run([{ params: Array.from(p), specs: valSpecs.slice(0, h) }, { params: Array.from(p), specs: valSpecs.slice(h) }]); return (r[0] + r[1]) / 2; };
  let best = await val(net.p), bestP = Float64Array.from(net.p); const v0 = best;
  console.log(`[${el()}] ${name}: старт val щільність ${(best * 100).toFixed(2)}% (${cfg}, sigma ${SIGMA})`);
  for (let it = 1; it <= ITERS; it++) {
    const seed0 = 1000 + Math.floor(rng() * 3000), specs = Array.from({ length: BATCH }, (_, i) => mk(seed0 + i, i));
    const eps = [], jobs = [];
    for (let k = 0; k < PAIRS; k++) {
      const e = new Float64Array(net.n).map(() => NN.gauss(rng)); eps.push(e);
      jobs.push({ params: Array.from(net.p, (v, i) => v + SIGMA * e[i]), specs }, { params: Array.from(net.p, (v, i) => v - SIGMA * e[i]), specs });
    }
    jobs.push({ params: Array.from(net.p), specs });
    const fits = await pool.run(jobs), cur = fits.pop();
    const order = fits.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]), u = new Array(fits.length);
    order.forEach(([, i], r) => { u[i] = r / (fits.length - 1) - 0.5; });
    const g = new Float64Array(net.n);
    for (let k = 0; k < PAIRS; k++) { const d = u[2 * k] - u[2 * k + 1]; for (let i = 0; i < net.n; i++) g[i] += d * eps[k][i]; }
    for (let i = 0; i < net.n; i++) g[i] = -g[i] / (2 * PAIRS * SIGMA);
    opt.step(net.p, g, 1e-4);
    let line = `[${el()}] it ${it}: поточна ${(cur * 100).toFixed(2)}% найкраща в популяції ${(Math.max(...fits) * 100).toFixed(2)}%`;
    if (it % 5 === 0 || it === ITERS) { const v = await val(net.p); line += ` | val ${(v * 100).toFixed(2)}%`; if (v > best) { best = v; bestP = Float64Array.from(net.p); fs.writeFileSync(`weights/v2/${name}.json`, JSON.stringify(Object.assign(net.toJSON(), { params: Array.from(bestP) }))); line += ' *'; } }
    console.log(line);
  }
  if (!fs.existsSync(`weights/v2/${name}.json`)) fs.writeFileSync(`weights/v2/${name}.json`, JSON.stringify(netJ));
  pool.close(); console.log(`[${el()}] готово ${name}: val ${(v0 * 100).toFixed(2)}% -> ${(best * 100).toFixed(2)}%`);
})();

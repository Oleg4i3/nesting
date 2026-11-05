// Пошук архітектури скорера (ширина/глибина/активація/skip) з ОДНАКОВИМ бюджетом навчання (ES).
// node arch_sweep.js [ітерацій=40] [зерен=2] [фільтр-імені]
// Результати дописуються в results/arch.jsonl (уже виконані пари name+seed пропускаються).
const fs = require('fs');
const { Worker } = require('worker_threads');
const X = require('./nnx.js'), NN = require('./nn.js');

const ITERS = +process.argv[2] || 40, SEEDS = +process.argv[3] || 2, FILTER = process.argv[4] || '';
const PAIRS = 8, BATCH = 6, SIGMA = 0.06, LR = 0.03, NWORK = 2;
const CONFIGS = [
  { name: 'лінійний (лише skip)', hidden: [], act: 'tanh', skip: true },
  { name: '[8] tanh', hidden: [8], act: 'tanh', skip: true },
  { name: '[16] tanh', hidden: [16], act: 'tanh', skip: true },
  { name: '[32] tanh', hidden: [32], act: 'tanh', skip: true },
  { name: '[16,8] tanh', hidden: [16, 8], act: 'tanh', skip: true },
  { name: '[24,12] tanh', hidden: [24, 12], act: 'tanh', skip: true },
  { name: '[16,16] tanh', hidden: [16, 16], act: 'tanh', skip: true },
  { name: '[16,8,4] tanh', hidden: [16, 8, 4], act: 'tanh', skip: true },
  { name: '[16,8] relu', hidden: [16, 8], act: 'relu', skip: true },
  { name: '[16,8] silu', hidden: [16, 8], act: 'silu', skip: true },
  { name: '[16,8] softsign', hidden: [16, 8], act: 'softsign', skip: true },
  { name: '[16,8] tanh без skip', hidden: [16, 8], act: 'tanh', skip: false },
];
const VAL = Array.from({ length: 24 }, (_, i) => 6001 + i);      // тип "mid", вибір контрольних точок/звіт
const H20 = Array.from({ length: 12 }, (_, i) => 96001 + i);     // тип "hard20", узагальнення на більші пазли
const POOL = Array.from({ length: 400 }, (_, i) => 1 + i);

class Pool {
  constructor(cfg) {
    this.workers = Array.from({ length: NWORK }, () => new Worker('./es_worker_x.js', { workerData: { F: 18, hidden: cfg.hidden, act: cfg.act, skip: cfg.skip } }));
    this.pending = new Map(); this.id = 0;
    this.workers.forEach(w => w.on('message', m => { const cb = this.pending.get(m.id); this.pending.delete(m.id); cb(m.fit); }));
  }
  run(tasks) {
    return new Promise(resolve => {
      const res = new Array(tasks.length); let next = 0, done = 0;
      const feed = w => {
        if (next >= tasks.length) return;
        const i = next++, id = ++this.id;
        this.pending.set(id, fit => { res[i] = fit; if (++done === tasks.length) resolve(res); else feed(w); });
        w.postMessage({ id, params: tasks[i].params, seeds: tasks[i].seeds, kind: tasks[i].kind });
      };
      this.workers.forEach(feed);
    });
  }
  close() { this.workers.forEach(w => w.terminate()); }
}

const done = new Set();
if (fs.existsSync('results/arch.jsonl')) for (const l of fs.readFileSync('results/arch.jsonl', 'utf8').trim().split('\n').filter(Boolean)) { const r = JSON.parse(l); done.add(r.name + '|' + r.seed); }
fs.mkdirSync('results', { recursive: true }); fs.mkdirSync('weights/arch', { recursive: true });

(async () => {
  for (let seed = 1; seed <= SEEDS; seed++) for (const cfg of CONFIGS) {
    if (FILTER && !cfg.name.includes(FILTER)) continue;
    if (done.has(cfg.name + '|' + seed)) continue;
    const t0 = Date.now();
    const net = new X.MLPX(18, cfg.hidden, cfg.act, cfg.skip).init(seed);
    const pool = new Pool(cfg), rng = NN.mulberry32(1000 * seed + 17), opt = new NN.Adam(net.n, LR);
    const evalSet = async (p, seeds, kind) => {
      const parts = [0, 1].map(k => seeds.filter((_, i) => i % 2 === k));
      const r = await pool.run(parts.map(s => ({ params: Array.from(p), seeds: s, kind })));
      return (r[0] * parts[0].length + r[1] * parts[1].length) / seeds.length;
    };
    const startVal = await evalSet(net.p, VAL, 'mid');
    let curve = [];
    for (let it = 1; it <= ITERS; it++) {
      const seeds = Array.from({ length: BATCH }, () => POOL[Math.floor(rng() * POOL.length)]);
      const eps = [], tasks = [];
      for (let k = 0; k < PAIRS; k++) {
        const e = new Float64Array(net.n).map(() => NN.gauss(rng)); eps.push(e);
        tasks.push({ params: Array.from(net.p, (v, i) => v + SIGMA * e[i]), seeds, kind: 'mid' }, { params: Array.from(net.p, (v, i) => v - SIGMA * e[i]), seeds, kind: 'mid' });
      }
      const fits = await pool.run(tasks);
      const order = fits.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]), u = new Array(fits.length);
      order.forEach(([, i], r) => { u[i] = r / (fits.length - 1) - 0.5; });
      const g = new Float64Array(net.n);
      for (let k = 0; k < PAIRS; k++) { const d = u[2 * k] - u[2 * k + 1]; for (let i = 0; i < net.n; i++) g[i] += d * eps[k][i]; }
      for (let i = 0; i < net.n; i++) g[i] = -g[i] / (2 * PAIRS * SIGMA);
      opt.step(net.p, g, 1e-4);
      if (it % 10 === 0) curve.push(+(fits.reduce((a, b) => a + b, 0) / fits.length).toFixed(4));
    }
    const endVal = await evalSet(net.p, VAL, 'mid');
    const h20 = await evalSet(net.p, H20, 'hard20');
    const rec = { name: cfg.name, seed, params: net.n, iters: ITERS, startVal, endVal, h20, popMeanEvery10: curve, sec: Math.round((Date.now() - t0) / 1000) };
    fs.appendFileSync('results/arch.jsonl', JSON.stringify(rec) + '\n');
    fs.writeFileSync(`weights/arch/${cfg.name.replace(/[^\wа-яіїєґ\[\],]+/gi, '_')}_s${seed}.json`, JSON.stringify(net.toJSON()));
    console.log(`${cfg.name.padEnd(24)} s${seed} params ${String(net.n).padStart(3)} | val ${(startVal * 100).toFixed(1)} → ${(endVal * 100).toFixed(1)} | hard20 ${(h20 * 100).toFixed(1)} | ${rec.sec}с`);
    pool.close();
  }
  console.log('готово');
})();

// Навчання скорера на експертних даних (дистиляція beam search) + оцінка як розкрійника.
// node train_sup.js <тег_даних> <частина> <частин> [епох=40] [зерен=2] [фільтр]
const fs = require('fs');
const X = require('./nnx.js'), NN = require('./nn.js'), Fe = require('./features.js'), Bm = require('./beam.js');
const C = require('./common.js');
const tag = process.argv[2] || 'v1', part = +process.argv[3] || 0, parts = +process.argv[4] || 1;
const EPOCHS = +process.argv[5] || 40, SEEDS = +process.argv[6] || 2, FILTER = process.argv[7] || '';
const NF = Fe.NF;

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
  { name: '[16,8] leaky', hidden: [16, 8], act: 'leaky', skip: true },
  { name: '[16,8] silu', hidden: [16, 8], act: 'silu', skip: true },
  { name: '[16,8] softsign', hidden: [16, 8], act: 'softsign', skip: true },
  { name: '[16,8] tanh без skip', hidden: [16, 8], act: 'tanh', skip: false },
];

function loadData(tag) {
  const train = [], val = [];
  for (const f of fs.readdirSync('data').filter(f => f.startsWith(`expert_${tag}_p`) && f.endsWith('.json'))) {
    const m = JSON.parse(fs.readFileSync('data/' + f, 'utf8')), buf = fs.readFileSync('data/' + f.replace('.json', '.bin'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), all = new Float32Array(ab);
    for (const s of m.meta) {
      const pos = new Uint8Array(s.count); s.pos.forEach(i => { pos[i] = 1; });
      (s.split === 'train' ? train : val).push({ F: all.subarray(s.offset, s.offset + s.count * NF), count: s.count, pos, kind: s.kind });
    }
  }
  return { train, val };
}
const { train, val } = loadData(tag);
const MIDEFF = Array.from({ length: 24 }, (_, i) => 8001 + i), H20 = Array.from({ length: 12 }, (_, i) => 96001 + i);
const effOf = (net, seeds, kind, B) => {
  let s = 0;
  for (const seed of seeds) {
    const pz = C.makePuzzle(kind === 'mid' ? C.randomSpecMid(seed) : C.randomSpecHard20(seed));
    const r = B === 1 ? Fe.solveNN(pz.pieces, pz.rules, net, { width: pz.width, maxLength: 4000 })
      : Bm.solveBeam(pz.pieces, pz.rules, net, { width: pz.width, maxLength: 4000, beam: B, rank: 'logp' });
    s += r.efficiency * (r.placed / pz.pieces.length);
  }
  return s / seeds.length;
};
const evalVal = (net, set) => { let l = 0, h = 0; for (const s of set) { const e = net.evalSample(s); l += e.loss; h += e.hit; } return { loss: l / set.length, hit: h / set.length }; };

fs.mkdirSync('results', { recursive: true }); fs.mkdirSync('weights/sup', { recursive: true });
const outFile = `results/sup_${tag}.jsonl`, done = new Set();
if (fs.existsSync(outFile)) for (const l of fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean)) { const r = JSON.parse(l); done.add(r.name + '|' + r.seed); }
console.log(`[${part}] дані: train ${train.length}, val ${val.length} зразків`);
let job = 0;
for (let seed = 1; seed <= SEEDS; seed++) for (const cfg of CONFIGS) {
  if (FILTER && !cfg.name.includes(FILTER)) continue;
  if (job++ % parts !== part || done.has(cfg.name + '|' + seed)) continue;
  const t0 = Date.now(), net = new X.MLPX(NF, cfg.hidden, cfg.act, cfg.skip).init(seed);
  const rng = NN.mulberry32(77 * seed + 3), opt = new NN.Adam(net.n, 3e-3), g = new Float64Array(net.n), idx = train.map((_, i) => i);
  let best = { loss: Infinity, p: null, ep: 0 }, trainLoss = NaN;
  for (let ep = 1; ep <= EPOCHS; ep++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let tl = 0;
    for (let b = 0; b < idx.length; b += 16) {
      g.fill(0); const n = Math.min(16, idx.length - b);
      for (let k = 0; k < n; k++) tl += net.lossGrad(train[idx[b + k]], g);
      for (let i = 0; i < g.length; i++) g[i] /= n;
      opt.step(net.p, g, 1e-4);
    }
    trainLoss = tl / idx.length;
    if (ep % 4 === 0 || ep === EPOCHS) { const v = evalVal(net, val); if (v.loss < best.loss) best = { loss: v.loss, p: Float64Array.from(net.p), ep }; }
  }
  net.p.set(best.p);
  const v = evalVal(net, val), vm = evalVal(net, val.filter(s => s.kind === 'mid')), vh = evalVal(net, val.filter(s => s.kind === 'hard20'));
  const tTrain = (Date.now() - t0) / 1000;
  const rec = {
    name: cfg.name, seed, params: net.n, epochs: EPOCHS, bestEpoch: best.ep, trainLoss, valLoss: v.loss, valTop1: v.hit, valTop1Mid: vm.hit, valTop1H20: vh.hit,
    effMid1: effOf(net, MIDEFF, 'mid', 1), effH20_1: effOf(net, H20, 'hard20', 1), effH20_8: effOf(net, H20, 'hard20', 8),
    secTrain: Math.round(tTrain), secTotal: Math.round((Date.now() - t0) / 1000),
  };
  fs.appendFileSync(outFile, JSON.stringify(rec) + '\n');
  fs.writeFileSync(`weights/sup/${tag}_${cfg.name.replace(/[^\wа-яіїєґ\[\],]+/gi, '_')}_s${seed}.json`, JSON.stringify(net.toJSON()));
  console.log(`${cfg.name.padEnd(22)} s${seed} p=${String(net.n).padStart(3)} ep*=${String(best.ep).padStart(2)} | val loss ${v.loss.toFixed(3)} top1 ${(v.hit * 100).toFixed(1)}% | eff mid B1 ${(rec.effMid1 * 100).toFixed(1)} | hard20 B1 ${(rec.effH20_1 * 100).toFixed(1)} B8 ${(rec.effH20_8 * 100).toFixed(1)} | ${rec.secTrain}с+${rec.secTotal - rec.secTrain}с`);
}
console.log(`[${part}] готово`);

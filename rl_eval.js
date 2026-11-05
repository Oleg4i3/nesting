// Порівняння на відкладених задачах (набори, яких мережа не бачила в донавчанні). Один запуск на задачу.
// node rl_eval.js <ч> <частин> <тег> <rot> <kinds> <seeds> <models name=path,...> [ms=10000] [sets=marques,mao,shirts,suit] [hyb=names]
const fs = require('fs'), X = require('./nnx.js'), T = require('./rl_tasks.js'), Pf = require('./portfolio.js'), B = require('./baselines.js'), L = require('./lns2.js');
const part = +process.argv[2] || 0, parts = +process.argv[3] || 1, tag = process.argv[4], rot = process.argv[5], kinds = process.argv[6].split(','), seeds = process.argv[7].split(',').map(Number);
const models = process.argv[8].split(',').map(s => { const [n, p] = s.split('='); return { n, net: X.MLPX.fromJSON(JSON.parse(fs.readFileSync(p, 'utf8'))) }; });
const ms = +process.argv[9] || 10000, sets = (process.argv[10] || 'marques,mao,shirts,suit').split(','), hybN = (process.argv[11] || models[0].n + ',' + models[models.length - 1].n).split(',');
const out = `results/${tag}_part${part}.jsonl`, done = new Set(fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).name) : []);
const fd = fs.openSync(out, 'a'), jobs = [];
for (const set of sets) for (const kind of kinds) for (const seed of seeds) jobs.push({ set, kind, seed, n: set === 'suit' ? 13 : (rot === 'dataset' ? 18 : 14), rot });
jobs.forEach((j, ji) => {
  if (ji % parts !== part) return;
  const t = T.build(j); if (done.has(t.name + '|' + rot)) return;
  const row = { name: t.name + '|' + rot, set: j.set, kind: j.kind, seed: j.seed, n: t.pcs.length, res: {} }, o = { width: t.W, maxLength: 4000, seed: 7, blocked: t.blocked };
  const ev = pl => T.evaluate(t, pl), seqs = {};
  for (const m of models) { const t0 = Date.now(); const bm = Pf.solvePortfolio(t.pcs, t.rules, m.net, { width: t.W, maxLength: 4000, blocked: t.blocked, maxMs: 15000 }); row.res['net:' + m.n] = Object.assign({ ms: Date.now() - t0, how: bm.how }, ev(bm.placements)); seqs[m.n] = { bm, ms: Date.now() - t0 }; }
  let t0 = Date.now(); row.res.bl = Object.assign({ ms: 0 }, ev(B.solveBLSA(t.pcs, t.rules, Object.assign({}, o, { budgetMs: ms })).placements)); row.res.bl.ms = Date.now() - t0;
  t0 = Date.now(); row.res.lns = Object.assign({}, ev(L.solveLNS(t.pcs, t.rules, Object.assign({}, o, { budgetMs: ms, recreate: 'BL', kMin: 6, kMax: 14, T0: 0.6 })).placements)); row.res.lns.ms = Date.now() - t0;
  for (const nm of hybN) { const s = seqs[nm]; if (!s) continue; const init = new Array(t.pcs.length).fill(null); s.bm.seq.forEach(q => { init[q.pi] = { vi: q.vi, A: q.A, cy: q.cy }; });
    t0 = Date.now(); const r = L.solveLNS(t.pcs, t.rules, Object.assign({}, o, { budgetMs: Math.max(1000, ms - s.ms), recreate: 'BL', kMin: 4, kMax: 10, T0: 0.25, init })); row.res['hyb:' + nm] = Object.assign({ ms: Date.now() - t0 + s.ms }, ev(r.placements)); }
  fs.writeSync(fd, JSON.stringify(row) + '\n'); console.log(row.name, Object.entries(row.res).map(([k, v]) => k + ' ' + (v.dens ? (v.dens * 100).toFixed(1) : '—')).join(' | '));
});

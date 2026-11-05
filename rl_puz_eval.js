// Пазли з кроком кута 5° (відкладені зерна): мережі, навчені з/без 5°-даних, проти BL-відпалу й LNS.
// node rl_puz_eval.js <ч> <частин> <тег> <rot> <models name=path,...> [ms=10000] [count=8]
const fs = require('fs'), X = require('./nnx.js'), C = require('./common.js'), N = require('./raster.js'), P = require('./puzzle.js'), Pf = require('./portfolio.js'), B = require('./baselines.js'), L = require('./lns2.js');
const part = +process.argv[2] || 0, parts = +process.argv[3] || 1, tag = process.argv[4], rot = process.argv[5];
const models = process.argv[6].split(',').map(s => { const [n, p] = s.split('='); return { n, net: X.MLPX.fromJSON(JSON.parse(fs.readFileSync(p, 'utf8'))) }; });
const ms = +process.argv[7] || 10000, CNT = +process.argv[8] || 8, out = `results/${tag}_part${part}.jsonl`, fd = fs.openSync(out, 'a');
const jobs = []; for (const stage of [1, 2]) for (let i = 1; i <= CNT; i++) jobs.push({ stage, seed: 900000 + stage * 1000 + i });
jobs.forEach((j, ji) => {
  if (ji % parts !== part) return;
  let pz; try { pz = C.makePuzzle(Object.assign(C.randomSpecAng(j.seed, j.stage, +(process.env.BIG||0)), { rules: { rotations: rot, mirror: false } })); } catch (e) { return; }
  const W = pz.width, pcs = pz.pieces, rules = pz.rules, plant = pz.meta.cells * N.CELL * N.CELL / (W * pz.length), area = pcs.reduce((s, p) => s + N.polygonArea(p), 0);
  const ev = pl => { if (!pl || pl.filter(Boolean).length !== pcs.length) return null; const e = N.evaluateLayout(P.placementsToPolys(pcs, pl), { width: W, height: 8000, rollWidth: W }); return e.valid ? { dens: e.efficiency, len: e.extent.length } : null; };
  const row = { name: `st${j.stage}/${j.seed}`, stage: j.stage, n: pcs.length, planted: pz.meta.cells ? plant : null, res: {} }, o = { width: W, maxLength: 4000, seed: 7 };
  for (const m of models) { const t0 = Date.now(), bm = Pf.solvePortfolio(pcs, rules, m.net, { width: W, maxLength: 4000, blocked: [], maxMs: 15000 }); row.res['net:' + m.n] = Object.assign({ ms: Date.now() - t0 }, ev(bm.placements)); }
  let t0 = Date.now(); row.res.bl = Object.assign({}, ev(B.solveBLSA(pcs, rules, Object.assign({}, o, { budgetMs: ms })).placements), { ms: Date.now() - t0 });
  t0 = Date.now(); row.res.lns = Object.assign({}, ev(L.solveLNS(pcs, rules, Object.assign({}, o, { budgetMs: ms, recreate: 'BL', kMin: 6, kMax: 14, T0: 0.6 })).placements), { ms: Date.now() - t0 });
  fs.writeSync(fd, JSON.stringify(row) + '\n'); console.log(row.name, 'planted', row.planted && row.planted.toFixed(3), Object.entries(row.res).map(([k, v]) => k + ' ' + (v.dens ? (v.dens * 100).toFixed(1) : '—')).join(' | '));
});

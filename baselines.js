/*
 * baselines.js — «промислові» бази для чесного порівняння з мережею, на тому самому растрі й тих самих правилах.
 *  - decodeBL: Bottom-Left-Fill декодер послідовності (деталь → найвища-ліва позиція, куди вміщується; без вимоги контакту).
 *  - solveBLMulti: BL-декодер із вибором найкращого варіанта (поворот/дзеркало) + перебір порядків
 *      (площа ↓, висота bbox ↓, ширина bbox ↓, периметр-проксі, потім випадкові) до вичерпання бюджету часу.
 *  - solveBLSA: відпал (simulated annealing) по послідовності+варіантах, BL-декодер. Бюджет часу.
 *  - solveGreedyRestarts: старий жадібний солвер зі випадковим порядком, найкращий із запусків. Бюджет часу.
 * Усі повертають {placements, lengthPx, placed, efficiency, iters}.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'), require('./features.js'), require('./puzzle.js'));
  else root.NestBase = factory(root.Nest, root.NestFeat, root.NestPuzzle);
})(typeof self !== 'undefined' ? self : this, function (N, Fe, P) {
  'use strict';
  const CELL = N.CELL, STEP = N.STEP;

  function setup(pieces, rules, width, maxLength, blocked) {
    const tpl = new Fe.Board(width, maxLength), W = tpl.W;
    for (const bp of (blocked || [])) Fe.blockPoly(tpl, bp);
    const vars = pieces.map(p => N.makeVariants(p, N.allowedFor(p, rules)));
    return { tpl, W, vars, n: pieces.length };
  }

  // перший (min cy, потім min A) варіант-позиція, що вміщується; bound — не шукати нижче за cy+h > bound
  function firstFit(board, v, bound) {
    const W = board.W, H = board.H;
    const pxMin = Math.ceil(-v.x0 * CELL / STEP) * STEP, pxMax = Math.floor((W - v.w - v.x0) * CELL / STEP) * STEP;
    const pyMin = Math.ceil(-v.y0 * CELL / STEP) * STEP;
    const pyMax = Math.floor((H - v.h - v.y0) * CELL / STEP) * STEP;
    if (pxMax < pxMin || pyMax < pyMin) return null;
    const ri = (v._ri || (Fe.rowInfo(v))), rcnt = ri.cnt, rspan = ri.span, rF = board.rowFree, rR = board.rowRun, vh = v.h;
    for (let py = pyMin; py <= pyMax; py += STEP) {
      const cy = v.y0 + py / CELL;
      if (cy + vh > bound) return null;
      let ok = true;
      for (let r = 0; r < vh; r++) if (rcnt[r] > rF[cy + r] || rspan[r] > rR[cy + r]) { ok = false; break; }
      if (!ok) continue;
      for (let px = pxMin; px <= pxMax; px += STEP) {
        const A = v.x0 + px / CELL;
        if (board.fits(v, A, cy)) return { A, cy };
      }
    }
    return null;
  }

  /** order — масив індексів деталей; vsel[pi] — індекс варіанта або -1 (= вибрати найкращий за нижнім краєм). */
  function decodeBL(S, order, vsel, bound = 1e9) {
    const board = S.tpl.clone(), pl = new Array(S.n).fill(null), pos = new Array(S.n).fill(null);
    let placed = 0, sumBottom = 0;
    for (const pi of order) {
      const vs = S.vars[pi];
      let best = null, bvi = -1;
      const cand = vsel && vsel[pi] >= 0 ? [vsel[pi]] : vs.map((_, i) => i);
      let bb = bound;
      for (const vi of cand) {
        const v = vs[vi];
        const f = firstFit(board, v, bb);
        if (!f) continue;
        const bottom = f.cy + v.h;
        if (!best || bottom < best.bottom || (bottom === best.bottom && f.A < best.A)) { best = { A: f.A, cy: f.cy, bottom }; bvi = vi; bb = Math.min(bb, bottom); }
      }
      if (!best) continue;      // не вмістилась (мало ймовірно) — залишається неброшеною
      const v = vs[bvi];
      board.place(v, best.A, best.cy);
      pl[pi] = { rot: v.rot, mirror: v.mirror, px: (best.A - v.x0) * CELL, py: (best.cy - v.y0) * CELL };
      placed++; sumBottom += best.bottom;
    }
    return { board, pl, placed, len: board.len, sumBottom };
  }

  function result(S, r, iters, order, vsel) {
    const eff = r.board.placed / (S.W * Math.max(r.len, 1));
    return { placements: r.pl, lengthPx: r.len * CELL, placed: r.placed, efficiency: eff, iters, order, vsel };
  }
  const cost = (r, n) => (n - r.placed) * 1e6 + r.len + 1e-4 * r.sumBottom / Math.max(r.placed, 1);

  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function solveBLMulti(pieces, rules, opts) {
    const S = setup(pieces, rules, opts.width, opts.maxLength || 4000, opts.blocked), n = S.n, rng = P.mulberry32(opts.seed || 1);
    const t0 = Date.now(), budget = opts.budgetMs || 9000;
    const idx = [...Array(n).keys()];
    const area = i => S.vars[i][0].area, bh = i => Math.max(...S.vars[i].map(v => v.h)), bw = i => Math.max(...S.vars[i].map(v => v.w));
    const orders = [
      idx.slice().sort((a, b) => area(b) - area(a)),
      idx.slice().sort((a, b) => Math.max(S.vars[b][0].w, S.vars[b][0].h) - Math.max(S.vars[a][0].w, S.vars[a][0].h)),
      idx.slice().sort((a, b) => bh(b) - bh(a)),
      idx.slice().sort((a, b) => bw(b) - bw(a)),
    ];
    let best = null, bestOrd = null, it = 0;
    while (Date.now() - t0 < budget && (!opts.maxIters || it < opts.maxIters)) {
      let ord;
      if (it < orders.length) ord = orders[it];
      else {   // збурення найкращого відомого: частково випадковий порядок за площею
        ord = idx.slice().sort((a, b) => area(b) * (0.6 + 0.8 * rng()) - area(a) * (0.6 + 0.8 * rng()));
        if (it % 3 === 0) shuffle(ord, rng);
      }
      const r = decodeBL(S, ord, null, best ? best.len + 6 : 1e9);
      it++;
      if (!best || cost(r, n) < cost(best, n)) { best = r; bestOrd = ord; }
    }
    const vs = new Array(n).fill(0); pieceVariantFromPl(S, best.pl, vs);
    return result(S, best, it, bestOrd, vs);
  }

  function solveBLSA(pieces, rules, opts) {
    const S = setup(pieces, rules, opts.width, opts.maxLength || 4000, opts.blocked), n = S.n, rng = P.mulberry32(opts.seed || 1);
    const t0 = Date.now(), budget = opts.budgetMs || 9000;
    // старт: порядок за площею, варіанти за найкращим нижнім краєм
    let order = [...Array(n).keys()].sort((a, b) => S.vars[b][0].area - S.vars[a][0].area);
    let cur = decodeBL(S, order, null);
    // зафіксуємо варіанти, які вибрав декодер
    let vsel = new Array(n).fill(0);
    pieceVariantFromPl(S, cur.pl, vsel);
    cur = decodeBL(S, order, vsel);
    let curC = cost(cur, n), best = cur, bestC = curC, it = 0, bestSAOrder = order, bestSAVsel = vsel;
    const T0 = 3, T1 = 0.15;
    while (true) {
      const el = Date.now() - t0; if (el >= budget) break;
      const T = T0 * Math.pow(T1 / T0, el / budget);
      const o2 = order.slice(), v2 = vsel.slice();
      const m = rng();
      if (m < 0.45) { const i = Math.floor(rng() * n), j = Math.floor(rng() * n); [o2[i], o2[j]] = [o2[j], o2[i]]; }
      else if (m < 0.7) { const i = Math.floor(rng() * n), j = Math.floor(rng() * n); const x = o2.splice(i, 1)[0]; o2.splice(j, 0, x); }
      else { const p = Math.floor(rng() * n), k = S.vars[p].length; if (k > 1) v2[p] = Math.floor(rng() * k); else continue; }
      const r = decodeBL(S, o2, v2, curC < 1e5 ? cur.len + 8 : 1e9);
      it++;
      const c = cost(r, n);
      if (c <= curC || rng() < Math.exp((curC - c) / T)) { order = o2; vsel = v2; cur = r; curC = c; if (c < bestC) { best = r; bestC = c; bestSAOrder = order; bestSAVsel = vsel; } }
    }
    return result(S, best, it, bestSAOrder, bestSAVsel);
  }

  function pieceVariantFromPl(S, pl, vsel) {
    pl.forEach((p, pi) => {
      if (!p) return;
      const k = S.vars[pi].findIndex(v => v.rot === p.rot && v.mirror === p.mirror);
      vsel[pi] = k < 0 ? 0 : k;
    });
  }

  function solveGreedyRestarts(pieces, rules, opts) {
    const t0 = Date.now(), budget = opts.budgetMs || 9000, rng = P.mulberry32(opts.seed || 1);
    let best = P.solveGreedy(pieces, rules, { width: opts.width, maxLength: opts.maxLength || 4000 }), it = 1;
    while (Date.now() - t0 < budget) {
      const q = P.solveGreedy(pieces, rules, { width: opts.width, maxLength: opts.maxLength || 4000, order: 'random', rng });
      it++;
      const np = a => a.placements ? a.placements.filter(Boolean).length : a.placed;
      if (np(q) > np(best) || (np(q) === np(best) && q.lengthPx < best.lengthPx)) best = q;
    }
    return Object.assign(best, { iters: it });
  }

  return { firstFit, decodeBL, solveBLMulti, solveBLSA, solveGreedyRestarts };
});

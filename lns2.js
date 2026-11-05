/* lns2.js — LNS (зруйнувати й відновити) з настроюваними параметрами та двома операторами відновлення:
 *  'BL'     — нижній-лівий, випадковий порядок за площею (із шумом), найкращий варіант;
 *  'GUIDED' — політика-мережа поверх BL-позицій (guided.js): вибір (деталь,варіант) за softmax(score/T).
 * Параметри: kMin,kMax — скільки сусідніх деталей руйнуємо; T0,T1 — температура прийняття (у клітинках довжини).
 * Початок і критерій прийняття однакові для обох операторів. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'), require('./features.js'), require('./puzzle.js'), require('./baselines.js'), require('./guided.js'));
  else root.NestLNS2 = factory(root.Nest, root.NestFeat, root.NestPuzzle, root.NestBase, root.NestGuided);
})(typeof self !== 'undefined' ? self : this, function (N, Fe, P, Bs, Gd) {
  'use strict';
  const CELL = N.CELL, NF = Fe.NF;
  function solveLNS(pieces, rules, opts) {
    const op = opts.recreate || 'BL', net = opts.net, Tm = opts.temp || 0.3, budget = opts.budgetMs || 15000, rng = P.mulberry32(opts.seed || 1);
    const kMin = opts.kMin || 2, kMax = opts.kMax || 6, T0 = opts.T0 === undefined ? 0.6 : opts.T0, T1 = opts.T1 === undefined ? 0.05 : opts.T1;
    const G = new Gd.Guided(pieces, rules, opts.width, opts.maxLength, false, opts.blocked), vars = G.vars, n = pieces.length, W = G.W;
    let F = new Float32Array(256 * NF), S = new Float64Array(256);
    const sumBottom = pl => pl.reduce((s, p, i) => s + p.cy + vars[i][p.vi].h, 0);
    const area = i => vars[i][0].area, idx = [...Array(n).keys()];
    function placeBL(board, pl, order, bound) {
      for (const pi of order) {
        let best = null;
        for (let vi = 0; vi < vars[pi].length; vi++) {
          const v = vars[pi][vi], f = Bs.firstFit(board, v, best ? best.bottom : bound);
          if (!f) continue; const bottom = f.cy + v.h;
          if (!best || bottom < best.bottom || (bottom === best.bottom && f.A < best.A)) best = { vi, A: f.A, cy: f.cy, bottom };
        }
        if (!best) return false;
        board.place(vars[pi][best.vi], best.A, best.cy); pl[pi] = { vi: best.vi, A: best.A, cy: best.cy };
      }
      return true;
    }
    function placeGuided(board, pl, removed) {
      const st = G.start(); st.board = board; st.rem = removed.slice();
      while (st.rem.length) {
        const c = G.actions(st); if (!c.length) return false;
        if (c.length * NF > F.length) { F = new Float32Array(c.length * NF * 2); S = new Float64Array(c.length * 2); }
        G.features(st, c, F); net.score(F, c.length, S);
        let mx = -Infinity; for (let i = 0; i < c.length; i++) if (S[i] > mx) mx = S[i];
        let z = 0; for (let i = 0; i < c.length; i++) { S[i] = Math.exp((S[i] - mx) / Tm); z += S[i]; }
        let r = rng() * z, pick = c.length - 1; for (let i = 0; i < c.length; i++) { if ((r -= S[i]) <= 0) { pick = i; break; } }
        const cd = c[pick], v = vars[cd.pi][cd.vi]; G.place(st, cd); pl[cd.pi] = { vi: cd.vi, A: cd.A, cy: cd.cy };
      }
      return true;
    }
    let board = G.tpl.clone(), cur = new Array(n).fill(null);
    // старт: або з готової розкладки opts.init (масив {vi,A,cy} за індексом деталі — напр. результат beam), або BL за площею
    let started = false;
    if (opts.init) {
      const b0 = G.tpl.clone(), c0 = new Array(n).fill(null);
      const ord = idx.slice().sort((a, b) => opts.init[a].cy - opts.init[b].cy || opts.init[a].A - opts.init[b].A);
      let ok0 = true;
      for (const pi of ord) { const it0 = opts.init[pi]; if (!it0) { ok0 = false; break; } const v = vars[pi][it0.vi]; if (!b0.fits(v, it0.A, it0.cy)) { ok0 = false; break; } b0.place(v, it0.A, it0.cy); c0[pi] = { vi: it0.vi, A: it0.A, cy: it0.cy }; }
      if (ok0) { board = b0; cur = c0; started = true; }
    }
    if (!started && !placeBL(board, cur, idx.slice().sort((a, b) => area(b) - area(a)), 1e9)) throw new Error('початкове розміщення не вдалося');
    let curLen = board.len, curSB = sumBottom(cur), best = cur.slice(), bestLen = curLen, bestBoard = board, it = 0, acc = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < budget) {
      const frac = (Date.now() - t0) / budget, Tsa = T0 * (1 - frac) + T1;
      const k = kMin + Math.floor(rng() * (kMax - kMin + 1)), seedP = Math.floor(rng() * n);
      const ctr = i => { const v = vars[i][cur[i].vi]; return [cur[i].A + v.w / 2, cur[i].cy + v.h / 2]; };
      const c0 = ctr(seedP);
      const removed = idx.slice().sort((a, b) => { const A = ctr(a), B = ctr(b); return Math.hypot(A[0] - c0[0], A[1] - c0[1]) - Math.hypot(B[0] - c0[0], B[1] - c0[1]); }).slice(0, k);
      const rset = new Set(removed), b2 = G.tpl.clone(), pl = cur.slice();
      for (const pi of idx) if (!rset.has(pi)) b2.place(vars[pi][cur[pi].vi], cur[pi].A, cur[pi].cy);
      let ok;
      if (op === 'BL') {
        const ord = removed.slice().sort((a, b) => area(b) * (0.7 + 0.6 * rng()) - area(a) * (0.7 + 0.6 * rng()));
        ok = placeBL(b2, pl, ord, curLen + 6);
      } else ok = placeGuided(b2, pl, removed);
      it++;
      if (!ok) continue;
      const nl = b2.len, nsb = sumBottom(pl), dC = (nl - curLen) + 1e-3 * (nsb - curSB) / n;
      if (dC <= 0 || rng() < Math.exp(-dC / Tsa)) {
        cur = pl; curLen = nl; curSB = nsb; acc++;
        if (nl < bestLen) { bestLen = nl; best = pl.slice(); bestBoard = b2; }
      }
    }
    const placements = best.map((p, i) => { const v = vars[i][p.vi]; return { rot: v.rot, mirror: v.mirror, px: (p.A - v.x0) * CELL, py: (p.cy - v.y0) * CELL }; });
    return { placements, lengthPx: bestLen * CELL, placed: n, efficiency: bestBoard.placed / (W * bestLen), iters: it, accepted: acc, layout: best };
  }
  return { solveLNS };
});

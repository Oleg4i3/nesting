/* lns.js — пошук «зруйнувати й відновити» (ruin & recreate) з відпалоподібним прийняттям. Ламаркова за природою:
 * зберігається сама розкладка. Оператор відновлення: 'BL' (нижній-лівий, випадковий порядок, найкращий варіант)
 * або 'NET' (стохастична мережа, softmax(score/T) серед кандидатів). Початок і всі інші частини однакові. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'), require('./features.js'), require('./puzzle.js'), require('./baselines.js'));
  else root.NestLNS = factory(root.Nest, root.NestFeat, root.NestPuzzle, root.NestBase);
})(typeof self !== 'undefined' ? self : this, function (N, Fe, P, Bs) {
  'use strict';
  const CELL = N.CELL, NF = Fe.NF;
  function solveLNS(pieces, rules, opts) {
    const op = opts.recreate || 'BL', net = opts.net, K = opts.K || 56, Tm = opts.temp || 0.3, budget = opts.budgetMs || 15000, rng = P.mulberry32(opts.seed || 1);
    const tpl = new Fe.Board(opts.width, opts.maxLength || 4000), W = tpl.W, n = pieces.length;
    const vars = pieces.map(p => N.makeVariants(p, N.allowedFor(p, rules)));
    const ctx = Fe.makeCtx(vars, W, [...Array(n).keys()], tpl);
    let F = new Float32Array(K * 3 * NF), S = new Float64Array(K * 3);
    const sumBottom = pl => pl.reduce((s, p, i) => s + p.cy + vars[i][p.vi].h, 0);
    // --- початок: BL за площею ↓, найкращий варіант
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
    function placeNET(board, pl, rem) {
      rem = rem.slice();
      while (rem.length) {
        const M = Math.max(5, Math.ceil(K / rem.length));
        let c = Fe.genCandidates(board, vars, rem, M); if (!c.length) c = Fe.genCandidates(board, vars, rem, M, 2);
        if (!c.length) return false;
        if (c.length * NF > F.length) { F = new Float32Array(c.length * NF * 2); S = new Float64Array(c.length * 2); }
        const T = Fe.minDim(vars, rem); for (let i = 0; i < c.length; i++) Fe.fillFeatures(board, ctx, c[i], rem.length, T, F, i * NF);
        net.score(F, c.length, S);
        let mx = -Infinity; for (let i = 0; i < c.length; i++) if (S[i] > mx) mx = S[i];
        let z = 0; for (let i = 0; i < c.length; i++) { S[i] = Math.exp((S[i] - mx) / Tm); z += S[i]; }
        let r = rng() * z, pick = c.length - 1; for (let i = 0; i < c.length; i++) { if ((r -= S[i]) <= 0) { pick = i; break; } }
        const cd = c[pick]; board.place(vars[cd.pi][cd.vi], cd.A, cd.cy); pl[cd.pi] = { vi: cd.vi, A: cd.A, cy: cd.cy };
        rem = rem.filter(x => x !== cd.pi);
      }
      return true;
    }
    const idx = [...Array(n).keys()], area = i => vars[i][0].area;
    let board = tpl.clone(), cur = new Array(n).fill(null);
    if (!placeBL(board, cur, idx.slice().sort((a, b) => area(b) - area(a)), 1e9)) throw new Error('початкове розміщення не вдалося');
    let curLen = board.len, curSB = sumBottom(cur), best = cur.slice(), bestLen = curLen, bestBoard = board, it = 0, acc = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < budget) {
      const frac = (Date.now() - t0) / budget, Tsa = 0.6 * (1 - frac) + 0.05;
      // руйнування: випадкова деталь + (k-1) найближчих за центром
      const k = 2 + Math.floor(rng() * 5), seedP = Math.floor(rng() * n);
      const ctr = i => { const v = vars[i][cur[i].vi]; return [cur[i].A + v.w / 2, cur[i].cy + v.h / 2]; };
      const c0 = ctr(seedP);
      const removed = idx.slice().sort((a, b) => { const A = ctr(a), B = ctr(b); return Math.hypot(A[0] - c0[0], A[1] - c0[1]) - Math.hypot(B[0] - c0[0], B[1] - c0[1]); }).slice(0, k);
      const rset = new Set(removed), b2 = tpl.clone(), pl = cur.slice();
      for (const pi of idx) if (!rset.has(pi)) b2.place(vars[pi][cur[pi].vi], cur[pi].A, cur[pi].cy);
      let ok;
      if (op === 'BL') {
        const ord = removed.slice().sort((a, b) => area(b) * (0.7 + 0.6 * rng()) - area(a) * (0.7 + 0.6 * rng()));
        ok = placeBL(b2, pl, ord, curLen + 6);
      } else ok = placeNET(b2, pl, removed);
      it++;
      if (!ok) continue;
      const nl = b2.len, nsb = sumBottom(pl), dC = (nl - curLen) + 1e-3 * (nsb - curSB) / n;
      if (dC <= 0 || rng() < Math.exp(-dC / Tsa)) {
        cur = pl; curLen = nl; curSB = nsb; acc++;
        if (nl < bestLen) { bestLen = nl; best = pl.slice(); bestBoard = b2; }
      }
    }
    const placements = best.map((p, i) => { const v = vars[i][p.vi]; return { rot: v.rot, mirror: v.mirror, px: (p.A - v.x0) * CELL, py: (p.cy - v.y0) * CELL }; });
    return { placements, lengthPx: bestLen * CELL, placed: n, efficiency: bestBoard.placed / (W * bestLen), iters: it, accepted: acc };
  }
  return { solveLNS };
});

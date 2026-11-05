/* sampler.js — стохастична мережа: багато швидких конструктивних прогонів з вибіркою з softmax(score/T), до вичерпання бюджету часу.
 * Прогін обривається, щойно довжина дошки ≥ найкращої відомої (далі вона лише росте). Перший прогін — жадібний. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'), require('./features.js'), require('./puzzle.js'));
  else root.NestSampler = factory(root.Nest, root.NestFeat, root.NestPuzzle);
})(typeof self !== 'undefined' ? self : this, function (N, Fe, P) {
  'use strict';
  const CELL = N.CELL, NF = Fe.NF;
  function solveSampled(pieces, rules, net, opts) {
    const K = opts.K || 56, Tm = opts.temp === undefined ? 1 : opts.temp, budget = opts.budgetMs || 15000, rng = P.mulberry32(opts.seed || 1), maxLength = opts.maxLength || 4000;
    const tpl = new Fe.Board(opts.width, maxLength), vars = pieces.map(p => N.makeVariants(p, N.allowedFor(p, rules)));
    const rem0 = []; pieces.forEach((_, i) => { if (vars[i].some(v => v.w <= tpl.W)) rem0.push(i); });
    const ctx = Fe.makeCtx(vars, tpl.W, rem0, tpl), W = tpl.W;
    let F = new Float32Array(K * 3 * NF), S = new Float64Array(K * 3), best = null, it = 0, bestLen = Infinity;
    const t0 = Date.now();
    while (it === 0 || Date.now() - t0 < budget) {
      const board = tpl.clone(), pl = new Array(pieces.length).fill(null); let rem = rem0.slice(), ok = true; const greedy = it === 0 || Tm <= 0;
      while (rem.length) {
        const M = Math.max(5, Math.ceil(K / rem.length));
        let c = Fe.genCandidates(board, vars, rem, M); if (!c.length) c = Fe.genCandidates(board, vars, rem, M, 2);
        if (!c.length) { ok = false; break; }
        if (c.length * NF > F.length) { F = new Float32Array(c.length * NF * 2); S = new Float64Array(c.length * 2); }
        const T = Fe.minDim(vars, rem); for (let i = 0; i < c.length; i++) Fe.fillFeatures(board, ctx, c[i], rem.length, T, F, i * NF);
        net.score(F, c.length, S);
        let pick = 0;
        if (greedy) { for (let i = 1; i < c.length; i++) if (S[i] > S[pick]) pick = i; }
        else {
          let mx = -Infinity; for (let i = 0; i < c.length; i++) if (S[i] > mx) mx = S[i];
          let z = 0; for (let i = 0; i < c.length; i++) { S[i] = Math.exp((S[i] - mx) / Tm); z += S[i]; }
          let r = rng() * z; pick = c.length - 1; for (let i = 0; i < c.length; i++) { if ((r -= S[i]) <= 0) { pick = i; break; } }
        }
        const cd = c[pick], v = vars[cd.pi][cd.vi];
        board.place(v, cd.A, cd.cy);
        pl[cd.pi] = { rot: v.rot, mirror: v.mirror, px: (cd.A - v.x0) * CELL, py: (cd.cy - v.y0) * CELL };
        rem = rem.filter(x => x !== cd.pi);
        if (board.len >= bestLen) { ok = false; break; }   // не покращить
      }
      it++;
      if (ok && !rem.length && board.len < bestLen) { bestLen = board.len; best = { pl, board }; }
    }
    return { placements: best.pl, lengthPx: best.board.len * CELL, placed: best.pl.filter(Boolean).length, efficiency: best.board.placed / (W * best.board.len), iters: it };
  }
  return { solveSampled };
});

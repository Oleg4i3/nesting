/* guided.js — «BL з нейронною підказкою»: дія = (деталь, варіант), позиція = перше нижнє-ліве місце, куди вміщується.
 * Для кожної пари тримаємо кеш нижньої межі рядка (дошка лише заповнюється, тож ранішні позиції лишаються недійсними)
 * і кешовану позицію (якщо вона досі вміщується — вона й досі перша). Мережа обирає пару; можна вибірково (softmax/T). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'), require('./features.js'), require('./puzzle.js'));
  else root.NestGuided = factory(root.Nest, root.NestFeat, root.NestPuzzle);
})(typeof self !== 'undefined' ? self : this, function (N, Fe, P) {
  'use strict';
  const CELL = N.CELL, STEP = N.STEP, NF = Fe.NF;

  function firstFitFrom(board, v, startCy) {
    const W = board.W, H = board.H;
    const pxMin = Math.ceil(-v.x0 * CELL / STEP) * STEP, pxMax = Math.floor((W - v.w - v.x0) * CELL / STEP) * STEP;
    const pyMin = Math.max(Math.ceil(-v.y0 * CELL / STEP) * STEP, Math.ceil((startCy - v.y0) * CELL / STEP) * STEP);
    const pyMax = Math.floor((H - v.h - v.y0) * CELL / STEP) * STEP;
    if (pxMax < pxMin || pyMax < pyMin) return null;
    const ri = Fe.rowInfo(v), rcnt = ri.cnt, rspan = ri.span, rF = board.rowFree, rR = board.rowRun, vh = v.h;
    for (let py = pyMin; py <= pyMax; py += STEP) {
      const cy = v.y0 + py / CELL;
      let ok = true;
      for (let r = 0; r < vh; r++) if (rcnt[r] > rF[cy + r] || rspan[r] > rR[cy + r]) { ok = false; break; }
      if (!ok) continue;
      for (let px = pxMin; px <= pxMax; px += STEP) { const A = v.x0 + px / CELL; if (board.fits(v, A, cy)) return { A, cy }; }
    }
    return null;
  }

  class Guided {
    constructor(pieces, rules, width, maxLength, slit, blocked) {
      this.tpl = new Fe.Board(width, maxLength || 4000); this.W = this.tpl.W;
      for (const bp of (blocked || [])) Fe.blockPoly(this.tpl, bp);
      this.vars = pieces.map(p => N.makeVariants(p, N.allowedFor(p, rules)));
      this.n = pieces.length; this.rem0 = [];
      pieces.forEach((_, i) => { if (this.vars[i].some(v => v.w <= this.W)) this.rem0.push(i); });
      this.ctx = Fe.makeCtx(this.vars, this.W, this.rem0, this.tpl); this.ctx.noSlit = !slit;   // ознаки щілин дорогі: за замовчуванням вимкнені
    }
    start() {
      const pos = this.vars.map(vs => vs.map(() => ({ cy: 0, A: -1, ok: true })));
      return { board: this.tpl.clone(), rem: this.rem0.slice(), pos, pl: new Array(this.n).fill(null), seq: [] };
    }
    /** Актуалізує кешовані позиції й повертає список кандидатів-дій {pi,vi,A,cy,ct,cheap}. */
    actions(st) {
      const out = [], b = st.board;
      for (const pi of st.rem) for (let vi = 0; vi < this.vars[pi].length; vi++) {
        const v = this.vars[pi][vi], c = st.pos[pi][vi];
        if (!c.ok) continue;
        if (c.A < 0 || !b.fits(v, c.A, c.cy)) {
          const f = firstFitFrom(b, v, c.cy);
          if (!f) { c.ok = false; continue; }
          c.A = f.A; c.cy = f.cy;
        }
        out.push({ pi, vi, A: c.A, cy: c.cy, ct: b.contact(v, c.A, c.cy), cheap: 0 });
      }
      return out;
    }
    place(st, c) {
      const v = this.vars[c.pi][c.vi];
      st.board.place(v, c.A, c.cy);
      st.pl[c.pi] = { vi: c.vi, rot: v.rot, mirror: v.mirror, A: c.A, cy: c.cy, px: (c.A - v.x0) * CELL, py: (c.cy - v.y0) * CELL };
      st.rem = st.rem.filter(x => x !== c.pi); st.seq.push({ pi: c.pi, vi: c.vi });
    }
    features(st, cands, out) {
      const T = Fe.minDim(this.vars, st.rem);
      for (let i = 0; i < cands.length; i++) Fe.fillFeatures(st.board, this.ctx, cands[i], st.rem.length, T, out, i * NF);
    }
  }

  /** Багато стохастичних прогонів політики (T<=0 — жадібний). Обрив, коли довжина ≥ найкращої. */
  function solveGuided(pieces, rules, net, opts) {
    const G = new Guided(pieces, rules, opts.width, opts.maxLength, opts.slit, opts.blocked), Tm = opts.temp === undefined ? 0.5 : opts.temp, budget = opts.budgetMs || 15000, maxIters = opts.maxIters || 1e9;
    const rng = P.mulberry32(opts.seed || 1);
    let F = new Float32Array(256 * NF), S = new Float64Array(256), best = null, bestLen = Infinity, it = 0;
    const t0 = Date.now();
    while (it === 0 || (Date.now() - t0 < budget && it < maxIters)) {
      const st = G.start(), greedy = it === 0 || Tm <= 0; let ok = true;
      while (st.rem.length) {
        const c = G.actions(st); if (!c.length) { ok = false; break; }
        if (c.length * NF > F.length) { F = new Float32Array(c.length * NF * 2); S = new Float64Array(c.length * 2); }
        G.features(st, c, F); net.score(F, c.length, S);
        let pick = 0;
        if (greedy) { for (let i = 1; i < c.length; i++) if (S[i] > S[pick]) pick = i; }
        else {
          let mx = -Infinity; for (let i = 0; i < c.length; i++) if (S[i] > mx) mx = S[i];
          let z = 0; for (let i = 0; i < c.length; i++) { S[i] = Math.exp((S[i] - mx) / Tm); z += S[i]; }
          let r = rng() * z; pick = c.length - 1; for (let i = 0; i < c.length; i++) { if ((r -= S[i]) <= 0) { pick = i; break; } }
        }
        G.place(st, c[pick]);
        if (st.board.len >= bestLen) { ok = false; break; }
      }
      it++;
      if (ok && !st.rem.length && st.board.len < bestLen) { bestLen = st.board.len; best = st; }
    }
    return { placements: best.pl, lengthPx: bestLen * CELL, placed: best.pl.filter(Boolean).length, efficiency: best.board.placed / (G.W * bestLen), iters: it, seq: best.seq };
  }
  return { Guided, solveGuided, firstFitFrom };
});

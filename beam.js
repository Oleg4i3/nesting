/*
 * beam.js — beam search поверх тих самих кандидатів/ознак/скорера, що й solveNN.
 * На кожному кроці кожен стан променя дає до `expand` дітей (найкращі кандидати за скорером);
 * з усіх дітей лишаємо `beam` найкращих за ключем rank:
 *   'waste' — найменша "відходна" площа: len·W − покладена площа (потім більший ∑ логарифм-імовірності),
 *   'logp'  — найбільша ∑ log-softmax скорера (імовірність траєкторії за політикою).
 * Однакові стани (збігається бітова зайнятість) відсіюються.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'), require('./features.js'));
  else root.NestBeam = factory(root.Nest, root.NestFeat);
})(typeof self !== 'undefined' ? self : this, function (N, Fe) {
  'use strict';
  const CELL = N.CELL, NF = Fe.NF;

  /** Проста лінійна "евристика" як скорер (ваги за замовчуванням = skip-частина мережі). */
  class LinearScorer {
    constructor(w) { this.w = Float64Array.from(w || LinearScorer.defaultWeights()); }
    static defaultWeights() { const w = new Float64Array(NF); w[0] = -4; w[1] = -1; w[3] = 1.5; w[6] = -0.5; w[7] = -0.5; return w; }
    score(F, count, out) {
      const w = this.w;
      for (let k = 0; k < count; k++) { let s = 0; const o = k * NF; for (let i = 0; i < NF; i++) s += F[o + i] * w[i]; out[k] = s; }
    }
  }

  /**
   * Евристика старого жадібного солвера в лінійному вигляді: мінімум приросту довжини (головне),
   * далі ближче до верхнього лівого кута. Разом з opts.order='area' відтворює його вибір кроку.
   */
  class HeurAreaScorer {
    constructor() { this.w = new Float64Array(NF); this.w[0] = -100; this.w[10] = -1; this.w[8] = -0.3; }
    score(F, count, out) {
      const w = this.w;
      for (let k = 0; k < count; k++) { let s = 0; const o = k * NF; for (let i = 0; i < NF; i++) s += F[o + i] * w[i]; out[k] = s; }
    }
  }

  function hashOcc(occ) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < occ.length; i++) { h ^= occ[i]; h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }

  function solveBeam(pieces, rules, scorer, opts = {}) {
    const B = opts.beam || 4, C = opts.expand || B, K = opts.K || 56, rank = opts.rank || 'waste';
    const width = opts.width, maxLength = opts.maxLength || 3000;
    const board0 = new Fe.Board(width, maxLength), W = board0.W;
    let bz = 0;   // нижній край заборонених зон (клітинки): кадр кандидатів інакше застрягає в зрізаному куті
    for (const bp of (opts.blocked || [])) { Fe.blockPoly(board0, bp); bz = Math.max(bz, Math.ceil(N.vertexBBox({ vertices: bp.vertices.concat((bp.bezierControls || []).filter(Boolean)) }).maxY / CELL) + 2); }
    const vars = pieces.map(p => N.makeVariants(p, N.allowedFor(p, rules)));
    const rem0 = [];
    pieces.forEach((_, i) => { if (vars[i].some(v => v.w <= W)) rem0.push(i); });
    const ctx = Fe.makeCtx(vars, W, rem0, board0); ctx.noSlit = !!opts.noSlit;
    let beam = [{ board: board0, rem: rem0, pl: new Array(pieces.length).fill(null), lp: 0, seq: [] }];
    const done = [];
    let F = new Float32Array(K * 3 * NF), S = new Float64Array(K * 3);
    while (beam.length) {
      const kids = [];
      for (const st of beam) {
        if (!st.rem.length) { done.push(st); continue; }
        // order:'area' — деталі в порядку спадання площі (як у жадібному солвері), крок = вибір варіанта й позиції
        const remGen = opts.order === 'area' ? [st.rem.reduce((a, b) => (vars[b][0].area > vars[a][0].area ? b : a))] : st.rem;
        const M = Math.max(5, Math.ceil(K / remGen.length));
        let cands = Fe.genCandidates(st.board, vars, remGen, M);
        if (!cands.length) cands = Fe.genCandidates(st.board, vars, remGen, M, 2);   // запас: непарна довжина ↔ ґратка 10 px
        if (!cands.length && bz > st.board.len) cands = Fe.genCandidates(st.board, vars, remGen, M, bz - st.board.len);
        if (!cands.length) { done.push(st); continue; }
        if (cands.length * NF > F.length) { F = new Float32Array(cands.length * NF * 2); S = new Float64Array(cands.length * 2); }
        const T = Fe.minDim(vars, st.rem);
        for (let i = 0; i < cands.length; i++) Fe.fillFeatures(st.board, ctx, cands[i], st.rem.length, T, F, i * NF);
        scorer.score(F, cands.length, S);
        let mx = -Infinity; for (let i = 0; i < cands.length; i++) if (S[i] > mx) mx = S[i];
        let z = 0; for (let i = 0; i < cands.length; i++) z += Math.exp(S[i] - mx);
        const lse = mx + Math.log(z);
        const idx = Array.from({ length: cands.length }, (_, i) => i).sort((a, b) => S[b] - S[a]).slice(0, C);
        const len = st.board.len;
        for (const i of idx) {
          const c = cands[i], v = vars[c.pi][c.vi];
          const newLen = Math.max(len, c.cy + v.h);
          kids.push({ st, c, lp: st.lp + S[i] - lse, waste: newLen * W - (st.board.placed + v.area) });
        }
      }
      if (!kids.length) break;
      const beta = opts.mixBeta || 0.3, av = ctx.avgArea || 1;
      kids.sort(rank === 'logp' ? (a, b) => b.lp - a.lp
        : rank === 'mix' ? (a, b) => (a.waste / av - beta * a.lp) - (b.waste / av - beta * b.lp)
        : (a, b) => a.waste - b.waste || b.lp - a.lp);
      const next = [], seen = new Set();
      for (const k of kids) {
        if (next.length >= B) break;
        const board = k.st.board.clone(), v = vars[k.c.pi][k.c.vi];
        board.place(v, k.c.A, k.c.cy);
        const h = hashOcc(board.occ) + ':' + board.len;
        if (seen.has(h)) continue; seen.add(h);
        const pl = k.st.pl.slice();
        pl[k.c.pi] = { rot: v.rot, mirror: v.mirror, px: (k.c.A - v.x0) * CELL, py: (k.c.cy - v.y0) * CELL };
        next.push({ board, rem: k.st.rem.filter(x => x !== k.c.pi), pl, lp: k.lp, seq: k.st.seq.concat([{ pi: k.c.pi, vi: k.c.vi, A: k.c.A, cy: k.c.cy }]) });
      }
      beam = next.filter(s => { if (!s.rem.length) { done.push(s); return false; } return true; });
    }
    // найкращий фінал: найбільше розміщених, далі найбільша ефективність
    let best = null;
    for (const s of done) {
      const placed = s.pl.filter(Boolean).length, eff = s.board.placed / (W * Math.max(s.board.len, 1));
      if (!best || placed > best.placed || (placed === best.placed && eff > best.efficiency)) best = { placed, efficiency: eff, s };
    }
    return {
      placements: best.s.pl, lengthPx: best.s.board.len * CELL, placed: best.placed, efficiency: best.efficiency, seq: best.s.seq,
    };
  }

  return { solveBeam, LinearScorer, HeurAreaScorer };
});

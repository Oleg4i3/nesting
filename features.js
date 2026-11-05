/*
 * features.js — дошка з бітовою зайнятістю, генерація кандидатів, ознаки для скорера, solveNN.
 * Залежить від raster.js (Nest).
 *
 * Ідея: конструктивний розкрій. На кожному кроці серед УСІХ деталей, що лишилися, їхніх допустимих
 * варіантів (повороти/дзеркала за правилами) і позицій (крок 10 px) беремо ті, що торкаються стін або
 * вже покладених деталей, рахуємо ознаки, скорер (нейромережа) ставить бал, кладемо кандидата з
 * найвищим балом.
 *
 * Дошка "падована": навколо рулону 1 клітинка стін (зліва, справа, зверху, знизу = ліміт довжини),
 * тож і перевірка меж, і контакт зі стінами рахуються тим самим AND по бітах.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'));
  else root.NestFeat = factory(root.Nest);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';
  const CELL = N.CELL, STEP = N.STEP, popcount32 = N.popcount32;
  const NF = 18;
  const FEATURE_NAMES = [
    'lenInc', 'wasteAfter', 'wasteDelta', 'contact', 'contactWall', 'contactPiece', 'rowSlit', 'colSlit',
    'xCenter', 'yRelLen', 'yAbs', 'areaRel', 'remaining', 'fill', 'aspect', 'rotOdd', 'mirror', 'growsLen',
  ];

  // ---------- допоміжне: зсув рядків маски на b біт ----------
  function shiftRows(rows, h, nw0, w, b) {
    const nw = (b + w + 31) >> 5, out = new Uint32Array(h * nw);
    for (let r = 0; r < h; r++) {
      for (let k = 0; k < nw0; k++) {
        const val = rows[r * nw0 + k];
        if (!val) continue;
        out[r * nw + k] |= (val << b);
        if (b && k + 1 < nw) out[r * nw + k + 1] |= (val >>> (32 - b));
      }
    }
    return { rows: out, nw };
  }

  /** "Кільце" навколо варіанту: клітинки, що межують (4-сусідство) з маскою, але не в масці. Кешується у варіанті. */
  function ringOf(v) {
    if (v._ring) return v._ring;
    const w2 = v.w + 2, h2 = v.h + 2, nw2 = (w2 + 31) >> 5;
    const bit = (r, c) => (r >= 0 && r < v.h && c >= 0 && c < v.w) ? (v.rows[r * v.nw + (c >> 5)] >>> (c & 31)) & 1 : 0;
    const rows = new Uint32Array(h2 * nw2);
    let area = 0, colFirst = 0, colLast = 0, rowFirst = 0, rowLast = 0;
    for (let r2 = 0; r2 < h2; r2++) {
      for (let c2 = 0; c2 < w2; c2++) {
        const r = r2 - 1, c = c2 - 1;
        if (bit(r, c)) continue;
        if (bit(r - 1, c) || bit(r + 1, c) || bit(r, c - 1) || bit(r, c + 1)) {
          rows[r2 * nw2 + (c2 >> 5)] |= (1 << (c2 & 31)); area++;
          if (c2 === 0) colFirst++; if (c2 === w2 - 1) colLast++;
          if (r2 === 0) rowFirst++; if (r2 === h2 - 1) rowLast++;
        }
      }
    }
    const ring = { w: w2, h: h2, nw: nw2, rows, area: Math.max(area, 1), colFirst, colLast, rowFirst, rowLast, _s: new Array(32).fill(null) };
    ring.shifted = function (b) { return this._s[b] || (this._s[b] = shiftRows(rows, h2, nw2, w2, b)); };
    return (v._ring = ring);
  }

  // ---------- дошка ----------
  class Board {
    constructor(widthPx, maxLenPx) {
      this.W = Math.floor(widthPx / CELL); this.H = Math.floor(maxLenPx / CELL);
      this.PW = this.W + 2; this.PH = this.H + 2; this.gw = (this.PW + 31) >> 5;
      this.occ = new Uint32Array(this.PH * this.gw);
      const gw = this.gw;
      for (let r = 0; r < this.PH; r++) {
        this.occ[r * gw] |= 1; const c = this.W + 1; this.occ[r * gw + (c >> 5)] |= (1 << (c & 31));
      }
      for (const r of [0, this.PH - 1]) for (let c = 0; c < this.PW; c++) this.occ[r * gw + (c >> 5)] |= (1 << (c & 31));
      this.len = 0; this.placed = 0;
      // для швидкого відсіву рядків: вільних клітинок у рядку і найдовша вільна смуга
      this.rowFree = new Int16Array(this.H).fill(this.W); this.rowRun = new Int16Array(this.H).fill(this.W);
      // nbr: клітинки рулону, суміжні (4-сусідство) із зайнятими клітинками чи стінами
      this.nbr = new Uint32Array(this.PH * gw);
      const setN = (r, c) => { this.nbr[r * gw + (c >> 5)] |= (1 << (c & 31)); };
      for (let r = 1; r <= this.H; r++) { setN(r, 1); setN(r, this.W); }
      for (let c = 1; c <= this.W; c++) { setN(1, c); setN(this.H, c); }
    }
    /**
     * Один прохід: -1 якщо перетин, 0 якщо вміщується без контакту, 1 якщо вміщується і торкається.
     */
    fitsContact(v, A, cy) {
      const P = A + 1, wi = P >> 5, s = v.shifted(P & 31), nw = s.nw, rows = s.rows, occ = this.occ, nbr = this.nbr, gw = this.gw;
      let touch = 0;
      for (let r = 0; r < v.h; r++) {
        const o = (cy + 1 + r) * gw + wi, k = r * nw;
        for (let q = 0; q < nw; q++) {
          const m = rows[k + q];
          if (occ[o + q] & m) return -1;
          touch |= nbr[o + q] & m;
        }
      }
      return touch ? 1 : 0;
    }
    clone() {
      const b = Object.create(Board.prototype);
      b.W = this.W; b.H = this.H; b.PW = this.PW; b.PH = this.PH; b.gw = this.gw;
      b.occ = this.occ.slice(); b.nbr = this.nbr.slice(); b.len = this.len; b.placed = this.placed;
      b.rowFree = this.rowFree.slice(); b.rowRun = this.rowRun.slice();
      return b;
    }
    _recalcRow(r) {   // r — рядок рулону без падінгу
      let free = 0, run = 0, best = 0;
      for (let c = 0; c < this.W; c++) {
        if (this.bit(r + 1, c + 1)) run = 0; else { free++; if (++run > best) best = run; }
      }
      this.rowFree[r] = free; this.rowRun[r] = best;
    }
    /** A — абсолютна клітинка лівого краю маски, cy — верхнього (в координатах рулону, без падінгу). */
    fits(v, A, cy) {
      const P = A + 1, wi = P >> 5, s = v.shifted(P & 31), nw = s.nw, rows = s.rows, occ = this.occ, gw = this.gw;
      for (let r = 0; r < v.h; r++) {
        const o = (cy + 1 + r) * gw + wi, k = r * nw;
        for (let q = 0; q < nw; q++) if (occ[o + q] & rows[k + q]) return false;
      }
      return true;
    }
    /** Кількість клітинок кільця, зайнятих (стінами або деталями). */
    contact(v, A, cy) {
      const ring = ringOf(v), wi = A >> 5, s = ring.shifted(A & 31), nw = s.nw, rows = s.rows, occ = this.occ, gw = this.gw;
      let c = 0;
      for (let r = 0; r < ring.h; r++) {
        const o = (cy + r) * gw + wi, k = r * nw;
        for (let q = 0; q < nw; q++) c += popcount32(occ[o + q] & rows[k + q]);
      }
      return c;
    }
    /** Частина контакту, що припадає на стіни. */
    wallContact(v, A, cy) {
      const ring = ringOf(v); let c = 0;
      if (A === 0) c += ring.colFirst;
      if (A + v.w === this.W) c += ring.colLast;
      if (cy === 0) c += ring.rowFirst;
      if (cy + v.h === this.H) c += ring.rowLast;
      return c;
    }
    place(v, A, cy) {
      const P = A + 1, wi = P >> 5, s = v.shifted(P & 31), nw = s.nw, rows = s.rows, occ = this.occ, gw = this.gw;
      for (let r = 0; r < v.h; r++) {
        const o = (cy + 1 + r) * gw + wi, k = r * nw;
        for (let q = 0; q < nw; q++) occ[o + q] |= rows[k + q];
      }
      this.placed += v.area; if (cy + v.h > this.len) this.len = cy + v.h;
      const ring = ringOf(v), rs = ring.shifted(A & 31), rnw = rs.nw, rrows = rs.rows, rwi = A >> 5;
      for (let r = 0; r < ring.h; r++) {
        const o = (cy + r) * gw + rwi, k = r * rnw;
        for (let q = 0; q < rnw; q++) this.nbr[o + q] |= rrows[k + q];
      }
      for (let r = 0; r < v.h; r++) this._recalcRow(cy + r);
    }
    /** Заборонена зона: як place, але не рахується як покладений матеріал і не збільшує довжину. */
    block(v, A, cy) {
      const P = A + 1, wi = P >> 5, s = v.shifted(P & 31), nw = s.nw, rows = s.rows, occ = this.occ, gw = this.gw;
      for (let r = 0; r < v.h; r++) {
        const o = (cy + 1 + r) * gw + wi, k = r * nw;
        for (let q = 0; q < nw; q++) occ[o + q] |= rows[k + q];
      }
      const ring = ringOf(v), rs = ring.shifted(A & 31), rnw = rs.nw, rrows = rs.rows, rwi = A >> 5;
      for (let r = 0; r < ring.h; r++) {
        const o = (cy + r) * gw + rwi, k = r * rnw;
        for (let q = 0; q < rnw; q++) this.nbr[o + q] |= rrows[k + q];
      }
      for (let r = 0; r < v.h; r++) this._recalcRow(cy + r);
    }
    bit(r, c) { return (this.occ[r * this.gw + (c >> 5)] >>> (c & 31)) & 1; }   // падовані координати
  }

  /** Позначає заборонену зону (багатокутник у координатах рулона, px) на дошці. */
  function blockPoly(board, poly) {
    const v = new N.Variant(poly, 0, false), vb = N.vertexBBox(poly);
    const ox = Math.floor(vb.minX / N.STEP + 1e-9) * N.STEP, oy = Math.floor(vb.minY / N.STEP + 1e-9) * N.STEP;
    board.block(v, v.x0 + ox / N.CELL, v.y0 + oy / N.CELL);
  }

  // ---------- вузькі щілини (клітинки, які вже нічим не заповнити) ----------
  let scratchB = new Uint8Array(1 << 14), scratchA = new Uint8Array(1 << 14);
  function slitCount(g, Hh, Ww, T) {
    // порожні відрізки довжини ≤ T, затиснуті з двох боків зайнятим, по рядках і по стовпцях
    let rowS = 0, colS = 0;
    for (let r = 0; r < Hh; r++) {
      const o = r * Ww; let c = 0;
      while (c < Ww) {
        if (g[o + c]) { c++; continue; }
        let c1 = c; while (c1 < Ww && !g[o + c1]) c1++;
        if (c > 0 && c1 < Ww && c1 - c <= T) rowS += c1 - c;
        c = c1;
      }
    }
    for (let c = 0; c < Ww; c++) {
      let r = 0;
      while (r < Hh) {
        if (g[r * Ww + c]) { r++; continue; }
        let r1 = r; while (r1 < Hh && !g[r1 * Ww + c]) r1++;
        if (r > 0 && r1 < Hh && r1 - r <= T) colS += r1 - r;
        r = r1;
      }
    }
    return [rowS, colS];
  }

  /** Зміна кількості "мертвих" вузьких щілин у околі кандидата: [по рядках, по стовпцях] (клітинки). */
  function slitDelta(board, v, A, cy, T) {
    const m = T + 1;
    const R0 = Math.max(0, cy + 1 - m), R1 = Math.min(board.PH, cy + 1 + v.h + m);
    const C0 = Math.max(0, A + 1 - m), C1 = Math.min(board.PW, A + 1 + v.w + m);
    const Hh = R1 - R0, Ww = C1 - C0, sz = Hh * Ww;
    if (sz > scratchB.length) { scratchB = new Uint8Array(sz * 2); scratchA = new Uint8Array(sz * 2); }
    const gB = scratchB.subarray(0, sz), gA = scratchA.subarray(0, sz);
    for (let r = 0; r < Hh; r++) for (let c = 0; c < Ww; c++) gB[r * Ww + c] = board.bit(R0 + r, C0 + c);
    gA.set(gB);
    for (let r = 0; r < v.h; r++) {
      for (let c = 0; c < v.w; c++) {
        if ((v.rows[r * v.nw + (c >> 5)] >>> (c & 31)) & 1) gA[(cy + 1 + r - R0) * Ww + (A + 1 + c - C0)] = 1;
      }
    }
    const b = slitCount(gB, Hh, Ww, T), a = slitCount(gA, Hh, Ww, T);
    return [a[0] - b[0], a[1] - b[1]];
  }

  /** Для відсіву: клітинок у кожному рядку маски та найдовша суцільна смуга в рядку. Кешується у варіанті. */
  function rowInfo(v) {
    if (v._ri) return v._ri;
    const cnt = new Int16Array(v.h), span = new Int16Array(v.h);
    for (let r = 0; r < v.h; r++) {
      let run = 0, best = 0, c0 = 0;
      for (let c = 0; c < v.w; c++) {
        if ((v.rows[r * v.nw + (c >> 5)] >>> (c & 31)) & 1) { c0++; if (++run > best) best = run; } else run = 0;
      }
      cnt[r] = c0; span[r] = best;
    }
    return (v._ri = { cnt, span });
  }

  // ---------- кандидати ----------
  /**
   * Для кожної деталі з `remaining` перебираємо всі варіанти й позиції (крок STEP), що вміщуються і мають контакт > 0.
   * Лишаємо M найкращих на деталь за дешевим балом (контакт, приріст довжини) — решту ознак рахуємо лише для них.
   */
  function genCandidates(board, vars, remaining, M, slack = 0) {
    const out = [], W = board.W, H = board.H, len = board.len;
    for (const pi of remaining) {
      const top = [];   // відсортований за спаданням cheap
      for (let vi = 0; vi < vars[pi].length; vi++) {
        const v = vars[pi][vi], ring = ringOf(v);
        const pxMin = Math.ceil(-v.x0 * CELL / STEP) * STEP, pxMax = Math.floor((W - v.w - v.x0) * CELL / STEP) * STEP;
        const pyMin = Math.ceil(-v.y0 * CELL / STEP) * STEP;
        const cyMax = Math.min(H - v.h, len + slack);
        const pyMax = Math.floor((cyMax - v.y0) * CELL / STEP) * STEP;
        if (pxMax < pxMin || pyMax < pyMin) continue;
        const ri = rowInfo(v), rcnt = ri.cnt, rspan = ri.span, rF = board.rowFree, rR = board.rowRun, vh = v.h;
        for (let py = pyMin; py <= pyMax; py += STEP) {
          const cy = v.y0 + py / CELL;
          let ok = true;      // точний відсів: рядок дошки має вміщати рядок деталі
          for (let r = 0; r < vh; r++) { if (rcnt[r] > rF[cy + r] || rspan[r] > rR[cy + r]) { ok = false; break; } }
          if (!ok) continue;
          const lenInc = Math.max(len, cy + v.h) - len;
          for (let px = pxMin; px <= pxMax; px += STEP) {
            const A = v.x0 + px / CELL;
            if (board.fitsContact(v, A, cy) <= 0) continue;
            const ct = board.contact(v, A, cy);
            const cheap = ct / ring.area - 0.15 * lenInc;
            if (top.length === M && cheap <= top[M - 1].cheap) continue;
            const cand = { pi, vi, A, cy, ct, cheap };
            let i = top.length; top.push(cand);
            while (i > 0 && top[i - 1].cheap < cheap) { top[i] = top[i - 1]; i--; }
            top[i] = cand;
            if (top.length > M) top.pop();
          }
        }
      }
      for (const c of top) out.push(c);
    }
    return out;
  }

  // ---------- ознаки ----------
  function makeCtx(vars, W, remaining, board) {
    let total = 0;
    for (const vs of vars) total += vs[0].area;
    return { vars, W, n: vars.length, totalCells: total, avgArea: total / vars.length, Lb: total / W };
  }
  function minDim(vars, remaining) {
    let t = 99;
    for (const pi of remaining) { const v = vars[pi][0]; t = Math.min(t, v.w, v.h); }
    return Math.max(3, Math.min(10, t));
  }

  /** Записує NF ознак кандидата в out[o..o+NF). */
  function fillFeatures(board, ctx, cand, remCount, T, out, o) {
    const v = ctx.vars[cand.pi][cand.vi], ring = ringOf(v), W = ctx.W;
    const { A, cy } = cand, len = board.len;
    const newLen = Math.max(len, cy + v.h), lenInc = newLen - len;
    const wasteBefore = len > 0 ? 1 - board.placed / (len * W) : 0;
    const wasteAfter = 1 - (board.placed + v.area) / (newLen * W);
    const wall = board.wallContact(v, A, cy), ct = cand.ct;
    const sl = ctx.noSlit ? [0, 0] : slitDelta(board, v, A, cy, T), sq = Math.sqrt(v.area);
    const clip = (x, a, b) => x < a ? a : x > b ? b : x;
    out[o] = Math.min(lenInc / 20, 3);
    out[o + 1] = wasteAfter;
    out[o + 2] = clip((wasteAfter - wasteBefore) * 3, -2, 2);
    out[o + 3] = ct / ring.area;
    out[o + 4] = wall / ring.area;
    out[o + 5] = Math.max(0, ct - wall) / ring.area;
    out[o + 6] = clip(sl[0] / sq, -2, 2);
    out[o + 7] = clip(sl[1] / sq, -2, 2);
    out[o + 8] = (A + v.w / 2) / W;
    out[o + 9] = (cy + v.h / 2) / Math.max(newLen, 1);
    out[o + 10] = Math.min((cy + v.h / 2) / ctx.Lb, 3);
    out[o + 11] = Math.min(v.area / ctx.avgArea, 4) / 2;
    out[o + 12] = remCount / ctx.n;
    out[o + 13] = v.area / (v.w * v.h);
    out[o + 14] = clip(Math.log(v.w / v.h) / 1.5, -2, 2);
    out[o + 15] = Math.round(Math.abs(Math.sin(v.rot * Math.PI / 2)) * 1000) / 1000;
    out[o + 16] = v.mirror ? 1 : 0;
    out[o + 17] = lenInc > 0 ? 1 : 0;
  }

  // ---------- розкрій зі скорером ----------
  /**
   * scorer: { score(F: Float32Array, count, out: Float64Array) } — чим більше, тим краще.
   * opts: {width, maxLength, K (≈кандидатів на крок), trace (масив для запису кроків)}
   */
  function solveNN(pieces, rules, scorer, opts = {}) {
    const width = opts.width, maxLength = opts.maxLength || 3000, K = opts.K || 56;
    const board = new Board(width, maxLength);
    const vars = pieces.map(p => N.makeVariants(p, N.allowedFor(p, rules)));
    const placements = new Array(pieces.length).fill(null);
    let rem = [];
    pieces.forEach((_, i) => { if (vars[i].some(v => v.w <= board.W)) rem.push(i); });
    const ctx = makeCtx(vars, board.W, rem, board);
    let F = new Float32Array(K * 3 * NF), S = new Float64Array(K * 3);
    while (rem.length) {
      const M = Math.max(5, Math.ceil(K / rem.length));
      let cands = genCandidates(board, vars, rem, M);
      if (!cands.length) cands = genCandidates(board, vars, rem, M, 2);   // запас: непарна довжина ↔ ґратка кроку 10 px
      if (!cands.length) break;
      if (cands.length * NF > F.length) { F = new Float32Array(cands.length * NF * 2); S = new Float64Array(cands.length * 2); }
      const T = minDim(vars, rem);
      for (let i = 0; i < cands.length; i++) fillFeatures(board, ctx, cands[i], rem.length, T, F, i * NF);
      scorer.score(F, cands.length, S);
      let bi = 0; for (let i = 1; i < cands.length; i++) if (S[i] > S[bi]) bi = i;
      const c = cands[bi], v = vars[c.pi][c.vi];
      board.place(v, c.A, c.cy);
      placements[c.pi] = { rot: v.rot, mirror: v.mirror, px: (c.A - v.x0) * CELL, py: (c.cy - v.y0) * CELL };
      rem = rem.filter(x => x !== c.pi);
    }
    return {
      placements, lengthPx: board.len * CELL, placed: placements.filter(Boolean).length,
      efficiency: board.placed / (board.W * Math.max(board.len, 1)),
    };
  }

  /**
   * Навчальні зразки з еталона пазла. Деталі кладуться в еталонних позиціях у порядку "зверху вниз".
   * Кожен крок: кандидати (як на інференсі) + еталонні кандидати як позитиви. Повертає [{F, count, pos:Uint8Array}].
   */
  function buildImitationSamples(pz, K = 56) {
    const board = new Board(pz.width, pz.length * 2);
    const vars = pz.pieces.map(p => N.makeVariants(p, N.allowedFor(p, pz.rules)));
    const truth = pz.solution.map((s, i) => {
      const vi = vars[i].findIndex(v => v.rot === s.rot && v.mirror === s.mirror);
      if (vi < 0) return null;
      const v = vars[i][vi];
      return { pi: i, vi, A: v.x0 + s.px / CELL, cy: v.y0 + s.py / CELL };
    });
    if (truth.some(t => !t)) return [];
    const order = truth.map(t => t.pi).sort((a, b) => truth[a].cy - truth[b].cy || truth[a].A - truth[b].A);
    const ctx = makeCtx(vars, board.W, order, board);
    const samples = []; let rem = order.slice();
    while (rem.length) {
      const M = Math.max(5, Math.ceil(K / rem.length));
      let cands = genCandidates(board, vars, rem, M);
      const key = c => c.pi + ':' + c.vi + ':' + c.A + ':' + c.cy;
      const have = new Map(cands.map((c, i) => [key(c), i]));
      const posIdx = new Set();
      const primary = rem[0];
      for (const pi of rem) {
        const t = truth[pi], v = vars[pi][t.vi];
        if (t.cy > board.len) continue;
        if (!board.fits(v, t.A, t.cy)) continue;           // не має траплятися
        const ct = board.contact(v, t.A, t.cy);
        if (!ct && pi !== primary) continue;
        const k = key(t);
        let idx = have.get(k);
        if (idx === undefined) { cands.push({ pi, vi: t.vi, A: t.A, cy: t.cy, ct, cheap: 0 }); idx = cands.length - 1; have.set(k, idx); }
        posIdx.add(idx);
      }
      if (posIdx.size) {
        const T = minDim(vars, rem), F = new Float32Array(cands.length * NF), pos = new Uint8Array(cands.length);
        for (let i = 0; i < cands.length; i++) fillFeatures(board, ctx, cands[i], rem.length, T, F, i * NF);
        for (const i of posIdx) pos[i] = 1;
        samples.push({ F, count: cands.length, pos });
      }
      const t = truth[primary]; board.place(vars[primary][t.vi], t.A, t.cy);
      rem = rem.slice(1);
    }
    return samples;
  }

  return { NF, FEATURE_NAMES, Board, blockPoly, rowInfo, ringOf, slitDelta, genCandidates, fillFeatures, makeCtx, minDim, solveNN, buildImitationSamples };
});

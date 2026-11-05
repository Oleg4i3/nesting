/*
 * puzzle.js — синтетичні задачі розкрою з ВІДОМИМ розв'язком ("пазл") + базова евристика.
 * Залежить від raster.js (Nest).
 *
 * Принцип генерації:
 *  1. Прямокутник рулону (width × length, кроком 10 px) ріжемо гільйотинними розрізами на прямокутники.
 *  2. (опційно) частину прямокутників викидаємо — це "відходи", ефективність еталона = 1 - waste.
 *  3. Кожен спільний відрізок двох сусідніх деталей замінюємо кривою Без'є з ОДНІЄЮ спільною
 *     контрольною точкою -> в одної деталі виступ, у сусідньої западина, прилягання ідеальне.
 *  4. Розбиття перевіряється растеризатором (кожна клітинка рівно в одній деталі). Якщо криві
 *     зачепили одна одну, амплітуду зменшуємо.
 *  5. Деталі перемішуються (повороти/дзеркала лише ті, що дозволені rules), еталон зберігається.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'));
  else root.NestPuzzle = factory(root.Nest);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';
  const CELL = N.CELL, STEP = N.STEP;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 1-2. розбиття ----------
  function splitLeaves(rng, Wc, Lc, n, minSize, spread = 0) {
    const leaves = [{ x0: 0, y0: 0, x1: Wc, y1: Lc }];
    // spread>0: частіше ділимо ВЖЕ малі прямокутники (великі лишаються великими) і зсуваємо розріз до краю
    const expo = 1 - 1.5 * spread, skew = 1 + 2 * spread;
    let guard = 0;
    while (leaves.length < n && guard++ < n * 200) {
      const wts = leaves.map(l => Math.pow((l.x1 - l.x0) * (l.y1 - l.y0), expo));
      let r = rng() * wts.reduce((a, b) => a + b, 0), i = 0;
      while (i < wts.length - 1 && r >= wts[i]) { r -= wts[i]; i++; }
      const l = leaves[i], w = l.x1 - l.x0, h = l.y1 - l.y0;
      const canV = w >= 2 * minSize, canH = h >= 2 * minSize;
      if (!canV && !canH) continue;
      const vertical = canV && canH ? rng() < w / (w + h) : canV;   // розріз вертикальною лінією
      const size = vertical ? w : h;
      let u = rng();
      if (spread > 0) { const e = Math.pow(rng(), skew); u = rng() < 0.5 ? e : 1 - e; }
      const pos = minSize + Math.floor(u * (size - 2 * minSize + 0.999));
      leaves.splice(i, 1,
        vertical ? { x0: l.x0, y0: l.y0, x1: l.x0 + pos, y1: l.y1 } : { x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y0 + pos },
        vertical ? { x0: l.x0 + pos, y0: l.y0, x1: l.x1, y1: l.y1 } : { x0: l.x0, y0: l.y0 + pos, x1: l.x1, y1: l.y1 });
    }
    return leaves;
  }

  // ---------- 3. полігони зі спільними кривими ----------
  function buildPolygons(rng, kept, wiggle, ampScale, pockets = 0) {
    const corners = [];
    kept.forEach(l => corners.push([l.x0, l.y0], [l.x1, l.y0], [l.x1, l.y1], [l.x0, l.y1]));
    // вершини кожного прямокутника + Т-вузли на його сторонах
    const verts = kept.map(l => {
      const out = [];
      const sides = [[[l.x0, l.y0], [l.x1, l.y0]], [[l.x1, l.y0], [l.x1, l.y1]], [[l.x1, l.y1], [l.x0, l.y1]], [[l.x0, l.y1], [l.x0, l.y0]]];
      for (const [a, b] of sides) {
        out.push(a);
        const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
        const mids = corners.filter(p => {
          if (dx) return p[1] === a[1] && (p[0] - a[0]) * dx > 0 && (b[0] - p[0]) * dx > 0;
          return p[0] === a[0] && (p[1] - a[1]) * dy > 0 && (b[1] - p[1]) * dy > 0;
        });
        const uniq = [...new Map(mids.map(p => [p[0] + ',' + p[1], p])).values()];
        uniq.sort((p, q) => dx ? (p[0] - q[0]) * dx : (p[1] - q[1]) * dy);
        out.push(...uniq);
      }
      return out;
    });
    const key = (a, b) => (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])) ? a + '|' + b : b + '|' + a;
    const owners = new Map();   // ключ відрізка -> індекси прямокутників, що його мають
    verts.forEach((vs, li) => vs.forEach((a, i) => {
      const k = key(a, vs[(i + 1) % vs.length]); if (!owners.has(k)) owners.set(k, []); owners.get(k).push(li);
    }));
    const areaOf = l => (l.x1 - l.x0) * (l.y1 - l.y0);
    const controls = new Map();
    const r10 = v => Math.round(v / STEP) * STEP;
    for (const [k, ls] of owners) {
      if (ls.length !== 2 || wiggle <= 0) continue;
      const [a, b] = k.split('|').map(s => s.split(',').map(Number)).map(p => [p[0] * STEP, p[1] * STEP]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-t[1], t[0]];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const L0 = kept[ls[0]], L1 = kept[ls[1]];
      const small = areaOf(L0) <= areaOf(L1) ? L0 : L1, big = small === L0 ? L1 : L0;
      const ratio = areaOf(big) / areaOf(small);
      if (pockets > 0 && ratio >= 2 && rng() < 0.5 + 0.5 * pockets) {
        // кишеня: дрібна деталь врізається дугою у велику, глибина дуги ~ товщина дрібної деталі
        const horiz = Math.abs(b[1] - a[1]) < 1e-9;
        const depth = (horiz ? small.y1 - small.y0 : small.x1 - small.x0) * STEP;
        const cb = [(big.x0 + big.x1) / 2 * STEP, (big.y0 + big.y1) / 2 * STEP];
        const sign = ((cb[0] - mid[0]) * n[0] + (cb[1] - mid[1]) * n[1]) >= 0 ? 1 : -1;
        const off = sign * Math.max(STEP, r10(depth * pockets * ampScale * (0.6 + 0.7 * rng())));
        const shift = r10((rng() - 0.5) * 0.4 * len);
        controls.set(k, { x: r10(mid[0] + n[0] * off + t[0] * shift), y: r10(mid[1] + n[1] * off + t[1] * shift) });
        continue;
      }
      if (rng() > 0.85) continue;
      const sign = rng() < 0.5 ? -1 : 1;
      const off = Math.max(STEP, r10(wiggle * ampScale * len * (0.4 + 0.6 * rng()))) * sign;
      const shift = r10((rng() - 0.5) * 0.5 * len);
      controls.set(k, { x: r10(mid[0] + n[0] * off + t[0] * shift), y: r10(mid[1] + n[1] * off + t[1] * shift) });
    }
    return verts.map(vs => ({
      vertices: vs.map(p => ({ x: p[0] * STEP, y: p[1] * STEP })),
      bezierControls: vs.map((a, i) => controls.get(key(a, vs[(i + 1) % vs.length])) || null),
    }));
  }

  /** Розбиття коректне, якщо кожна клітинка належить рівно одній деталі і все в межах рулону. */
  function partitionOK(polys, keptCells, Wc5, Lc5) {
    const ev = N.evaluateLayout(polys, { width: Wc5 * CELL, height: Lc5 * CELL });
    return ev.valid && ev.pieces.reduce((s, p) => s + p.cells, 0) === keptCells;
  }

  // ---------- 4а. «виїмки»: прямі краї замінюються увігнутою дугою (зворотне до trimArcs) ----------
  /** Прямі ребра довжиною ≥ minLen з імовірністю prob заміняються увігнутою дугою глибиною depth·довжини (depth ∈ [dmin,dmax]). Сусідка не змінюється — виникає лінзоподібна щілина. */
  function scoopEdges(poly, rng, prob, dmin, dmax, minLen) {
    const v = poly.vertices, bc = poly.bezierControls, n = v.length;
    let A2 = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; A2 += v[i].x * v[j].y - v[j].x * v[i].y; }
    const sg = A2 >= 0 ? 1 : -1, nb = []; let cnt = 0;
    for (let i = 0; i < n; i++) {
      const p = v[i], q = v[(i + 1) % n], c = bc && bc[i], len = Math.hypot(q.x - p.x, q.y - p.y);
      if (c || len < minLen || rng() > prob) { nb.push(c ? { x: c.x, y: c.y } : null); continue; }
      const t = [(q.x - p.x) / len, (q.y - p.y) / len], nn = [-t[1], t[0]];
      const off = sg * (dmin + (dmax - dmin) * rng()) * len / 0.75, sh = (rng() - 0.5) * 0.3 * len;
      nb.push({ x: (p.x + q.x) / 2 + nn[0] * off + t[0] * sh, y: (p.y + q.y) / 2 + nn[1] * off + t[1] * sh }); cnt++;
    }
    return { poly: { vertices: v.map(a => ({ x: a.x, y: a.y })), bezierControls: nb }, scooped: cnt };
  }

  // ---------- 4б. обрізка дуг (зазори, реалістичніші форми) ----------
  /**
   * Опуклі (виступаючі) дуги деталі зрізаються по прямій, паралельній хорді, на глибині
   * depth·(макс. прогин). Точки збережених частин дуги беруться з тієї самої ламаної (32 сегменти),
   * що й у сусідки, а хорда між двома точками опуклої кривої лежить всередині деталі,
   * тому нових перетинів не виникає — лише зазор. Вершини стають нецілочисельними.
   */
  function trimArcs(poly, rng, prob, dmin, dmax) {
    const v = poly.vertices, bc = poly.bezierControls, n = v.length;
    let A2 = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; A2 += v[i].x * v[j].y - v[j].x * v[i].y; }
    const nv = [], nb = []; let trimmed = 0;
    for (let i = 0; i < n; i++) {
      const p = v[i], q = v[(i + 1) % n], c = bc && bc[i];
      nv.push({ x: p.x, y: p.y });
      if (!c) { nb.push(null); continue; }
      const cr = (q.x - p.x) * (c.y - p.y) - (q.y - p.y) * (c.x - p.x);
      if (cr * A2 >= 0 || rng() > prob) { nb.push({ x: c.x, y: c.y }); continue; }   // увігнута або не обрана
      const len = Math.hypot(q.x - p.x, q.y - p.y), pts = [], d = [];
      for (let k = 0; k <= 32; k++) {
        const t = k / 32, mt = 1 - t, w0 = mt * mt * mt, w1 = 3 * t * mt, w2 = t * t * t;
        const x = w0 * p.x + w1 * c.x + w2 * q.x, y = w0 * p.y + w1 * c.y + w2 * q.y;
        pts.push({ x, y }); d.push(Math.abs((q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x)) / len);
      }
      const level = (dmin + (dmax - dmin) * rng()) * Math.max(...d);
      let ka = -1, kb = -1;
      for (let k = 1; k < 32; k++) if (d[k] >= level) { if (ka < 0) ka = k; kb = k; }
      if (ka < 0 || kb - ka < 2) { nb.push({ x: c.x, y: c.y }); continue; }
      nb.push(null);
      for (let k = 1; k < 32; k++) {
        if ((k <= ka && (k % 4 === 0 || k === ka)) || (k >= kb && (k % 4 === 0 || k === kb))) { nv.push(pts[k]); nb.push(null); }
      }
      trimmed++;
    }
    return { poly: { vertices: nv, bezierControls: nb }, trimmed };
  }

  // ---------- 5. еталонні позиції ----------
  /** Для кожної вхідної деталі знаходимо варіант і зсув, що відновлюють її еталонне положення. */
  function findTruth(inPoly, orig, rules) {
    const m0 = N.rasterize(orig);
    for (const v of N.makeVariants(inPoly, rules)) {
      if (v.w !== m0.w || v.h !== m0.h) continue;
      const dxc = m0.x0 - v.x0, dyc = m0.y0 - v.y0;
      if ((dxc * CELL) % STEP || (dyc * CELL) % STEP) continue;
      let same = true;
      for (let i = 0; i < m0.rows.length; i++) if (m0.rows[i] !== v.rows[i]) { same = false; break; }
      if (same) return { rot: v.rot, mirror: v.mirror, px: dxc * CELL, py: dyc * CELL };
    }
    return null;
  }

  /**
   * opts: {width, length (px), pieces, wiggle 0..1, waste 0..0.5, rules {rotations, mirror}, seed, minSize (кл. по 10 px)}
   */
  function generate(opts = {}) {
    const width = opts.width || 300, length = opts.length || 500;
    const n = opts.pieces || 10, wiggle = opts.wiggle === undefined ? 0.5 : opts.wiggle;
    const waste = opts.waste || 0, rules = opts.rules || { rotations: 'any', mirror: true };
    const minSize = opts.minSize || 3, seed = opts.seed === undefined ? 1 : opts.seed;
    const spread = opts.spread || 0, pockets = opts.pockets || 0;
    const Wc = Math.round(width / STEP), Lc = Math.round(length / STEP);
    const rng = mulberry32(seed);

    let leaves = splitLeaves(rng, Wc, Lc, n + Math.round(n * waste), minSize, spread);
    // відходи: викидаємо випадкові прямокутники, доки не набереться waste
    const total = Wc * Lc, order = leaves.map((_, i) => i).sort(() => rng() - 0.5);
    const drop = new Set(); let dropped = 0;
    for (const i of order) {
      const l = leaves[i], a = (l.x1 - l.x0) * (l.y1 - l.y0);
      if (leaves.length - drop.size > 2 && dropped + a <= waste * total) { drop.add(i); dropped += a; }
    }
    const kept = leaves.filter((_, i) => !drop.has(i));
    const keptCells = (total - dropped) * (STEP / CELL) * (STEP / CELL);

    let origs = null, usedScale = 0;
    outer: for (const scale of (wiggle > 0 ? [1, 0.8, 0.6, 0.4, 0.25, 0.12] : [0])) {
      for (let att = 0; att < (scale === 0 ? 1 : 3); att++) {
        const rngTry = mulberry32(seed * 7919 + Math.round(scale * 100) * 31 + att);
        const cand = buildPolygons(rngTry, kept, wiggle, scale, pockets);
        if (partitionOK(cand, keptCells, Wc * STEP / CELL, Lc * STEP / CELL)) { origs = cand; usedScale = scale; break outer; }
      }
    }
    if (!origs) {   // запасний варіант: прямі розрізи
      origs = buildPolygons(rng, kept, 0, 0); usedScale = 0;
      if (!partitionOK(origs, keptCells, Wc * STEP / CELL, Lc * STEP / CELL)) throw new Error('Розбиття некоректне (seed ' + seed + ')');
    }

    // виїмки: прямі краї → увігнуті дуги
    let scoopCount = 0;
    const scoopP = opts.scoop || 0;
    if (scoopP > 0) {
      const rngS = mulberry32(seed * 15485863 + 5);
      const sc = origs.map(o => scoopEdges(o, rngS, scoopP, opts.scoopMin || 0.03, opts.scoopMax || 0.1, 5 * STEP));
      const candS = sc.map(t => t.poly);
      const evS = N.evaluateLayout(candS, { width, height: length });
      if (evS.valid) { origs = candS; scoopCount = sc.reduce((a, t) => a + t.scooped, 0); }
    }

    // обрізка дуг: зазори між деталями (еталон перестає бути 100 %)
    let trimCount = 0;
    const trimP = opts.trim || 0;
    if (trimP > 0) {
      const rngT = mulberry32(seed * 104729 + 17);
      const tr = origs.map(o => trimArcs(o, rngT, trimP, opts.trimMin || 0.25, opts.trimMax || 0.75));
      const cand = tr.map(t => t.poly);
      const evT = N.evaluateLayout(cand, { width, height: length });
      if (evT.valid) { origs = cand; trimCount = tr.reduce((s, t) => s + t.trimmed, 0); }
    }

    // перемішування
    const allowed = pc => N.allowedFor(pc, rules);
    const pieces = [], solution = [];
    origs.forEach((orig, i) => {
      const a = allowed(orig);
      const rot = a.rotations[Math.floor(rng() * a.rotations.length)];
      const mirror = a.mirror && rng() < 0.5;
      let q;
      if (Math.abs(rot - Math.round(rot)) > 1e-9) {
        // довільний кут: обертаємо навколо вузла ґратки під кутком габариту БЕЗ подальшого зсуву — тоді зворотне обертання
        // у солвері відновлює деталь точно, і еталон лишається на ґратці позицій
        if (mirror) throw new Error('дзеркало з довільним кутом не підтримується в генераторі');
        const vb0 = N.vertexBBox(orig);
        const cx = Math.floor(vb0.minX / STEP + 1e-9) * STEP, cy = Math.floor(vb0.minY / STEP + 1e-9) * STEP;   // вузол ґратки
        q = N.transformPoly(N.translatePoly(orig, -cx, -cy), rot, false);
      } else {
        q = N.transformPoly(orig, rot, mirror);
        const vb = N.vertexBBox(q);
        // зсув лише кратний STEP: інакше змінюється положення відносно сітки вибірки
        q = N.translatePoly(q, -Math.floor(vb.minX / STEP + 1e-9) * STEP, -Math.floor(vb.minY / STEP + 1e-9) * STEP);
      }
      const truth = findTruth(q, orig, a);
      if (!truth) throw new Error('Не знайдено еталонний варіант для деталі ' + i + ' (seed ' + seed + ')');
      pieces.push(q); solution.push(truth);
    });

    const cells = origs.map(p => N.rasterize(p).area);
    const sumCells = cells.reduce((a, b) => a + b, 0);
    const ev = N.evaluateLayout(origs, { width, height: length });
    return {
      width, length, rules, seed,
      pieces,            // вхід для солвера
      solution,          // еталон: для кожної деталі {rot, mirror, px, py}
      originals: origs,  // розкладка-еталон в абсолютних координатах
      meta: {
        n: origs.length, wiggle, waste, spread, pockets, trim: trimP, trimmedArcs: trimCount, scooped: scoopCount, ampScale: usedScale, cells: sumCells, areaPx: sumCells * CELL * CELL,
        plantedLength: ev.extent.length,                         // довжина еталона, px
        plantedEfficiency: ev.areaPx / (width * ev.extent.length),
        sizeRatio: Math.max(...cells) / Math.max(1, Math.min(...cells)),
        areaBoundLength: Math.ceil(sumCells * CELL * CELL / width / CELL) * CELL,   // нижня межа по площі
      },
    };
  }

  // ---------- базова евристика ----------
  /**
   * Жадібний розкрій: для кожної деталі перебираємо ВСІ дозволені варіанти і ВСІ позиції (крок 10 px),
   * обираємо мінімальну довжину рулону, за рівності — найближче до лівого верхнього кута.
   * opts: {width, maxLength, order: 'area' | 'random', rng}
   */
  function solveGreedy(pieces, rules, opts = {}) {
    const width = opts.width, maxLength = opts.maxLength || width * 6;
    const grid = new N.Grid(width, maxLength);
    const vars = pieces.map(p => N.makeVariants(p, N.allowedFor(p, rules)));
    let order = pieces.map((_, i) => i);
    if (opts.order === 'random') {
      const rng = opts.rng || Math.random;
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    } else order.sort((a, b) => vars[b][0].area - vars[a][0].area);

    let len = 0;                       // довжина в клітинках
    const placements = new Array(pieces.length).fill(null);
    for (const idx of order) {
      let best = null;
      for (const v of vars[idx]) {
        const pxMin = Math.ceil(-v.x0 * CELL / STEP) * STEP, pxMax = Math.floor((grid.W - v.w - v.x0) * CELL / STEP) * STEP;
        const pyMin = Math.ceil(-v.y0 * CELL / STEP) * STEP;
        const pyMax = Math.min(Math.floor((grid.H - v.h - v.y0) * CELL / STEP) * STEP, Math.floor((len - v.y0) * CELL / STEP) * STEP);
        for (let py = pyMin; py <= pyMax; py += STEP) {
          const cy = v.y0 + py / CELL, newLen = Math.max(len, cy + v.h);
          if (best && newLen > best.newLen) continue;
          for (let px = pxMin; px <= pxMax; px += STEP) {
            if (!grid.fits(v, px, py)) continue;
            const cx = v.x0 + px / CELL;
            const dist = Math.hypot(cx + v.w / 2, cy + v.h / 2);
            if (!best || newLen < best.newLen || (newLen === best.newLen && dist < best.dist)) best = { v, px, py, newLen, dist };
          }
        }
      }
      if (!best) continue;                           // не влізла (ширша за рулон)
      grid.place(best.v, best.px, best.py);
      len = best.newLen;
      placements[idx] = { rot: best.v.rot, mirror: best.v.mirror, px: best.px, py: best.py, variant: best.v };
    }
    const cells = grid.filledCells();
    return {
      placements, lengthPx: len * CELL, placed: placements.filter(Boolean).length,
      efficiency: cells * CELL * CELL / (width * len * CELL),
    };
  }

  /** Розкладка в абсолютних координатах (для малювання, експорту в редактор, evaluateLayout). */
  function placementsToPolys(pieces, placements, rules) {
    return pieces.map((p, i) => {
      const pl = placements[i]; if (!pl) return null;
      const v = new N.Variant(p, pl.rot, pl.mirror);
      return v.placed(pl.px, pl.py);
    }).filter(Boolean);
  }

  return { generate, solveGreedy, placementsToPolys, mulberry32, findTruth };
});

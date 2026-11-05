/*
 * raster.js — швидка растеризація деталей у бітові маски для розкрою.
 * Працює і в браузері (window.Nest), і в Node/Worker (module.exports).
 * Без залежностей, без canvas.
 *
 * Формат деталі той самий, що в редакторі:
 *   { vertices:[{x,y}...], bezierControls:[null|{x,y}...] | null }
 * Крива між vertices[i] та vertices[i+1] — кубічний Без'є з ДВОМА однаковими
 * контрольними точками (як bezierCurveTo(c,c,p2) у редакторі):
 *   B(t) = (1-t)^3 P0 + 3t(1-t) C + t^3 P1
 *
 * Сітка вибірки: CELL px (5). Клітинка "зайнята", якщо її ЦЕНТР (зі зсувом EX,EY)
 * лежить всередині контуру (even-odd, напіввідкрите правило [x1,x2)).
 * Наслідок: дві деталі зі спільною кривою розбивають площу без щілин і без перетинів,
 * антиаліасингу немає.
 *
 * Розміщення кроком STEP px (10), кратним CELL.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Nest = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CELL = 5;
  const STEP = 10;
  // Зсув точок вибірки. Різні й "ірраціональні", щоб жодна діагональ/нахилена
  // лінія з вершинами на ґратці 10 px не проходила рівно через центр клітинки.
  const EX = 0.3711, EY = 0.1337;
  const SEG = 32;      // сегментів на криву

  // ---------- геометрія ----------

  /** Ламана (замкнена) як Float64Array [x0,y0,x1,y1,...] */
  function flatten(poly, seg = SEG) {
    const v = poly.vertices, bc = poly.bezierControls, n = v.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p1 = v[i], p2 = v[(i + 1) % n];
      out.push(p1.x, p1.y);
      const c = bc && bc[i];
      if (c) {
        for (let k = 1; k < seg; k++) {
          const t = k / seg, mt = 1 - t;
          const w0 = mt * mt * mt, w1 = 3 * t * mt, w2 = t * t * t;
          out.push(w0 * p1.x + w1 * c.x + w2 * p2.x, w0 * p1.y + w1 * c.y + w2 * p2.y);
        }
      }
    }
    return Float64Array.from(out);
  }

  /** Аналітична площа (формула шнурівки по ламаній), px² */
  function polygonArea(poly, seg = SEG) {
    const p = flatten(poly, seg), n = p.length / 2;
    let a = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
    }
    return Math.abs(a) / 2;
  }

  /** Точний габарит по кривих (не лише по вершинах), px */
  function curveBBox(poly, seg = SEG) {
    const p = flatten(poly, seg);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
    }
    return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
  }

  /** Габарит по вершинах (так рахує редактор), px */
  function vertexBBox(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly.vertices) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
  }

  function mapPoly(poly, f) {
    return {
      vertices: poly.vertices.map(p => f(p)),
      bezierControls: poly.bezierControls ? poly.bezierControls.map(c => (c ? f(c) : null)) : null,
    };
  }

  /** Точне перетворення: rot чвертей за год. стрілкою (як ↻ у редакторі), далі mirror = переворот по Y. */
  function transformPoly(poly, rot, mirror) {
    let q = mapPoly(poly, p => ({ x: p.x, y: p.y }));
    const rr = ((rot % 4) + 4) % 4;
    if (Math.abs(rr - Math.round(rr)) > 1e-9) {          // довільний кут (rot у чвертях обороту, 1 = 90°), за год. стрілкою
      const th = rr * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
      q = mapPoly(q, p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
    } else {
      for (let t = 0; t < Math.round(rr) % 4; t++) q = mapPoly(q, p => ({ x: 0 - p.y, y: p.x }));
    }
    if (mirror) q = mapPoly(q, p => ({ x: p.x, y: 0 - p.y }));
    return q;
  }

  function translatePoly(poly, dx, dy) {
    return mapPoly(poly, p => ({ x: p.x + dx, y: p.y + dy }));
  }

  // ---------- растеризація ----------

  function popcount32(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    x = (x + (x >>> 4)) & 0x0f0f0f0f;
    return Math.imul(x, 0x01010101) >>> 24;
  }

  /**
   * Растеризація у координатах самої деталі.
   * Повертає маску: x0,y0 (клітинки, можуть бути від'ємні), w,h (клітинки),
   * rows: Uint32Array(h*nw), біт k рядка = клітинка x0+k.
   */
  function rasterize(poly, seg = SEG) {
    const pts = flatten(poly, seg), n = pts.length / 2;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) {
      if (pts[i] < minY) minY = pts[i];
      if (pts[i] > maxY) maxY = pts[i];
    }
    const jA = Math.floor((minY - EY) / CELL) - 1, jB = Math.ceil((maxY - EY) / CELL) + 1;
    const spans = new Map(); // j -> [i0,i1, i0,i1 ...]
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    const xs = [];
    for (let j = jA; j <= jB; j++) {
      const yc = (j + 0.5) * CELL + EY;
      xs.length = 0;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const ay = pts[2 * k + 1], by = pts[2 * k2 + 1];
        if ((ay > yc) !== (by > yc)) {
          const ax = pts[2 * k], bx = pts[2 * k2];
          xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      const row = [];
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.ceil((xs[q] - EX) / CELL - 0.5);
        const i1 = Math.ceil((xs[q + 1] - EX) / CELL - 0.5) - 1;
        if (i1 >= i0) {
          row.push(i0, i1);
          if (i0 < xmin) xmin = i0; if (i1 > xmax) xmax = i1;
        }
      }
      if (row.length) {
        spans.set(j, row);
        if (j < ymin) ymin = j; if (j > ymax) ymax = j;
      }
    }
    if (xmin === Infinity) return { x0: 0, y0: 0, w: 0, h: 0, nw: 0, rows: new Uint32Array(0), area: 0 };
    const w = xmax - xmin + 1, h = ymax - ymin + 1, nw = (w + 31) >> 5;
    const rows = new Uint32Array(h * nw);
    let area = 0;
    for (const [j, row] of spans) {
      const base = (j - ymin) * nw;
      for (let q = 0; q < row.length; q += 2) {
        for (let i = row[q]; i <= row[q + 1]; i++) {
          const b = i - xmin;
          rows[base + (b >> 5)] |= (1 << (b & 31));
          area++;
        }
      }
    }
    return { x0: xmin, y0: ymin, w, h, nw, rows, area };
  }

  // ---------- варіанти деталі (повороти / дзеркала) ----------

  const ROT_PRESETS = {
    none: [0], fixed: [0],            // тканина з ворсом/односпрямованим малюнком
    half: [0, 2], twoway: [0, 2],     // допустимо лише на 180°
    any: [0, 1, 2, 3], free: [0, 1, 2, 3],
  };
  // довільні кути: 'deg<крок>' (напр. 'deg15' — кожні 15°, 'deg30'); 'tilt<макс>' — 0°/180° з відхиленням до ±макс градусів кроком 5°
  function angleSet(name) {
    let m = /^deg(\d+(?:\.\d+)?)$/.exec(name);
    if (m) { const st = +m[1], out = []; for (let a = 0; a < 360 - 1e-9; a += st) out.push(a / 90); return out; }
    m = /^tilt(\d+)$/.exec(name);
    if (m) { const mx = +m[1], out = [0, 2]; for (let a = 5; a <= mx; a += 5) out.push(a / 90, -a / 90, 2 + a / 90, 2 - a / 90); return out; }
    return null;
  }

  function resolveRotations(r) {
    if (r === undefined || r === null) return [0, 1, 2, 3];
    if (r === false) return [0];
    if (r === true) return [0, 1, 2, 3];
    if (typeof r === 'string') {
      const as = angleSet(r); if (as) return Array.from(new Set(as.map(x => +(((x % 4) + 4) % 4).toFixed(10)))).sort((a, b) => a - b);
      if (!ROT_PRESETS[r]) throw new Error('Невідомий режим обертання: ' + r);
      return ROT_PRESETS[r];
    }
    return Array.from(new Set(r.map(x => ((x % 4) + 4) % 4))).sort((a, b) => a - b);
  }

  /**
   * Правила для конкретної деталі: глобальні cfg {rotations, mirror}
   * перекриваються piece.constraints (напр. деталь з вишивкою: {rotations:'none', mirror:false}).
   */
  function allowedFor(piece, cfg) {
    const c = Object.assign({}, cfg || {}, (piece && piece.constraints) || {});
    return { rotations: resolveRotations(c.rotations), mirror: !!c.mirror };
  }

  function rowsKey(m) {
    return m.x0 + ',' + m.y0 + ',' + m.w + ',' + m.h + ':' + Array.prototype.join.call(m.rows, ',');
  }

  /** Один варіант деталі: перетворена, зсунута на ґратку, з маскою та кешем зсувів. */
  class Variant {
    constructor(poly, rot, mirror, seg) {
      let q = transformPoly(poly, rot, mirror);
      const vb = vertexBBox(q);
      const dx = -Math.floor(vb.minX / STEP + 1e-9) * STEP;
      const dy = -Math.floor(vb.minY / STEP + 1e-9) * STEP;
      q = translatePoly(q, dx, dy);
      this.rot = rot; this.mirror = mirror; this.poly = q;
      Object.assign(this, rasterize(q, seg));
      this._shifted = new Array(32).fill(null);
    }
    /** Рядки маски, зсунуті на b біт (0..31) — щоб AND ішов по словах без зсувів у циклі. */
    shifted(b) {
      let s = this._shifted[b];
      if (s) return s;
      const nw = (b + this.w + 31) >> 5, rows = new Uint32Array(this.h * nw);
      for (let r = 0; r < this.h; r++) {
        for (let k = 0; k < this.nw; k++) {
          const val = this.rows[r * this.nw + k];
          if (!val) continue;
          rows[r * nw + k] |= (val << b);
          if (b && k + 1 < nw) rows[r * nw + k + 1] |= (val >>> (32 - b));
        }
      }
      return (this._shifted[b] = { rows, nw });
    }
    /** Геометрія варіанту, поставленого в (px,py) — для малювання/експорту. */
    placed(px, py) { return translatePoly(this.poly, px, py); }
  }

  /** Усі різні (за маскою) варіанти деталі, дозволені правилами. */
  function makeVariants(poly, rules, seg = SEG) {
    const rotations = resolveRotations(rules && rules.rotations), mirror = !!(rules && rules.mirror);
    const out = [], seen = new Set();
    for (const m of (mirror ? [false, true] : [false])) {
      for (const r of rotations) {
        const v = new Variant(poly, r, m, seg);
        const key = rowsKey(v);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
      }
    }
    return out;
  }

  // ---------- сітка зайнятості (швидка перевірка) ----------

  /** Рулон: фіксована ширина widthPx, довжина до heightPx. */
  class Grid {
    constructor(widthPx, heightPx) {
      this.W = Math.floor(widthPx / CELL);
      this.H = Math.floor(heightPx / CELL);
      this.gw = (this.W + 31) >> 5;
      this.occ = new Uint32Array(this.H * this.gw);
    }
    _origin(v, px, py) { return [v.x0 + px / CELL, v.y0 + py / CELL]; }

    inBounds(v, px, py) {
      const [cx, cy] = this._origin(v, px, py);
      return cx >= 0 && cy >= 0 && cx + v.w <= this.W && cy + v.h <= this.H;
    }

    /** true, якщо варіант у (px,py) у межах рулону і не перетинає зайняте. */
    fits(v, px, py) {
      const cx = v.x0 + px / CELL, cy = v.y0 + py / CELL;
      if (cx < 0 || cy < 0 || cx + v.w > this.W || cy + v.h > this.H) return false;
      const wi = cx >> 5, s = v.shifted(cx & 31), nw = s.nw, rows = s.rows;
      const occ = this.occ, gw = this.gw;
      for (let r = 0; r < v.h; r++) {
        const o = (cy + r) * gw + wi, k = r * nw;
        for (let q = 0; q < nw; q++) if (occ[o + q] & rows[k + q]) return false;
      }
      return true;
    }

    /** Скільки клітинок перетинається (для діагностики; не перевіряє межі). */
    overlap(v, px, py) {
      const cx = v.x0 + px / CELL, cy = v.y0 + py / CELL;
      const wi = cx >> 5, s = v.shifted(cx & 31), nw = s.nw, rows = s.rows;
      let c = 0;
      for (let r = 0; r < v.h; r++) {
        const o = (cy + r) * this.gw + wi, k = r * nw;
        for (let q = 0; q < nw; q++) c += popcount32(this.occ[o + q] & rows[k + q]);
      }
      return c;
    }

    place(v, px, py) { this._apply(v, px, py, true); }
    remove(v, px, py) { this._apply(v, px, py, false); }
    _apply(v, px, py, add) {
      const cx = v.x0 + px / CELL, cy = v.y0 + py / CELL;
      const wi = cx >> 5, s = v.shifted(cx & 31), nw = s.nw, rows = s.rows;
      for (let r = 0; r < v.h; r++) {
        const o = (cy + r) * this.gw + wi, k = r * nw;
        for (let q = 0; q < nw; q++) {
          if (add) this.occ[o + q] |= rows[k + q]; else this.occ[o + q] &= ~rows[k + q];
        }
      }
    }

    /** Довжина використаного рулону, px (по нижньому зайнятому рядку). */
    usedLength() {
      for (let r = this.H - 1; r >= 0; r--) {
        for (let q = 0; q < this.gw; q++) if (this.occ[r * this.gw + q]) return (r + 1) * CELL;
      }
      return 0;
    }
    filledCells() { let c = 0; for (let i = 0; i < this.occ.length; i++) c += popcount32(this.occ[i]); return c; }
    clear() { this.occ.fill(0); }
  }

  // ---------- перевірка готової розкладки (абсолютні координати) ----------

  /**
   * Незалежна перевірка розкладки: кожну деталь растеризуємо в її абсолютних координатах,
   * шукаємо перетини (через карту власників, без бітових трюків) та вихід за рулон.
   * opts: {width, height} у px — рулон; за замовчуванням 500×500 (канва редактора).
   */
  function evaluateLayout(polys, opts = {}) {
    const widthPx = opts.width || 500, heightPx = opts.height || 500, seg = opts.seg || SEG;
    const W = Math.floor(widthPx / CELL), H = Math.floor(heightPx / CELL);
    const owner = new Int16Array(W * H).fill(-1);
    const overlapMap = new Map();
    const pieces = [];
    let totalCells = 0, gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    polys.forEach((poly, idx) => {
      const m = rasterize(poly, seg);
      let oob = 0;
      for (let r = 0; r < m.h; r++) {
        for (let c = 0; c < m.w; c++) {
          if (!((m.rows[r * m.nw + (c >> 5)] >>> (c & 31)) & 1)) continue;
          const cx = m.x0 + c, cy = m.y0 + r;
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) { oob++; continue; }
          const o = owner[cy * W + cx];
          if (o >= 0) {
            const key = o + ',' + idx;
            overlapMap.set(key, (overlapMap.get(key) || 0) + 1);
          } else owner[cy * W + cx] = idx;
        }
      }
      totalCells += m.area;
      if (m.w) {
        gx0 = Math.min(gx0, m.x0); gy0 = Math.min(gy0, m.y0);
        gx1 = Math.max(gx1, m.x0 + m.w); gy1 = Math.max(gy1, m.y0 + m.h);
      }
      pieces.push({
        index: idx, cells: m.area, areaPx: m.area * CELL * CELL,
        areaExact: polygonArea(poly, seg),
        vertexBBox: vertexBBox(poly), curveBBox: curveBBox(poly, seg), outOfBoundsCells: oob,
      });
    });
    const overlaps = [...overlapMap].map(([k, cells]) => {
      const [i, j] = k.split(',').map(Number); return { i, j, cells, areaPx: cells * CELL * CELL };
    });
    const areaPx = totalCells * CELL * CELL;
    const extentW = (gx1 - gx0) * CELL, extentL = (gy1 - gy0) * CELL;
    const rollW = opts.rollWidth || extentW;
    return {
      pieces, overlaps, areaPx,
      extent: { x0: gx0 * CELL, y0: gy0 * CELL, width: extentW, length: extentL },
      rollWidth: rollW,
      // ефективність: площа деталей / (ширина рулону × використана довжина)
      efficiency: areaPx / (rollW * extentL),
      valid: overlaps.length === 0 && pieces.every(p => p.outOfBoundsCells === 0),
    };
  }

  /** Розібрати JSON редактора ({polygons:[...]}) у масив деталей. */
  function loadLayout(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    return (d.polygons || d).map(p => ({ vertices: p.vertices, bezierControls: p.bezierControls || null }));
  }

  return {
    CELL, STEP, EX, EY, SEG,
    flatten, polygonArea, curveBBox, vertexBBox, transformPoly, translatePoly,
    rasterize, popcount32, Variant, makeVariants, allowedFor, resolveRotations, ROT_PRESETS,
    Grid, evaluateLayout, loadLayout,
  };
});

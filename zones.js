/* zones.js — заборонені зони рулона: дефекти тканини (плями довільної форми) та «обрізки» (зрізані кути/краї фронту рулона).
 * Зони — багатокутники з кривими Безьє в координатах рулона (px), не перетинаються між собою. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'), require('./puzzle.js'));
  else root.NestZones = factory(root.Nest, root.NestPuzzle);
})(typeof self !== 'undefined' ? self : this, function (N, P) {
  'use strict';
  const R = (rng, a, b) => a + (b - a) * rng();
  function shape(pts, bulges) {
    const n = pts.length, vs = pts.map(p => ({ x: Math.round(p[0]), y: Math.round(p[1]) })), bc = [];
    for (let i = 0; i < n; i++) {
      const b = bulges[i] || 0; if (!b) { bc.push(null); continue; }
      const p = vs[i], q = vs[(i + 1) % n], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
      bc.push({ x: Math.round((p.x + q.x) / 2 + (dy / len) * b * len), y: Math.round((p.y + q.y) / 2 - (dx / len) * b * len) });
    }
    return { vertices: vs, bezierControls: bc };
  }
  /** Довільна пляма: неправильний багатокутник навколо центру з випинаннями. */
  function blob(rng, cx, cy, r) {
    const n = 5 + Math.floor(rng() * 3), pts = [], bul = [];
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n + R(rng, -0.25, 0.25), rr = r * R(rng, 0.55, 1.15); pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); bul.push(R(rng, 0.05, 0.25)); }
    return shape(pts, bul);
  }
  const bboxOf = p => N.vertexBBox({ vertices: p.vertices.concat(p.bezierControls.filter(Boolean)) });
  /** estLen — оцінка довжини розкрою (px). Повертає масив зон. */
  function makeZones(seed, W, estLen, opts = {}) {
    const rng = P.mulberry32(seed * 7919 + 3), zones = [], boxes = [];
    const ok = p => { const b = bboxOf(p); if (b.minX < 0 || b.maxX > W || b.minY < 0) return false; return boxes.every(o => b.maxX + 8 < o.minX || o.maxX + 8 < b.minX || b.maxY + 8 < o.minY || o.maxY + 8 < b.minY); };
    const add = p => { if (ok(p)) { zones.push(p); boxes.push(bboxOf(p)); return true; } return false; };
    // обрізки: до двох кутів на початку рулона
    const nCut = opts.cuts === undefined ? 1 + Math.floor(rng() * 2) : opts.cuts;
    for (let k = 0; k < nCut; k++) {
      const a = R(rng, 0.12, 0.3) * W, b = R(rng, 0.15, 0.35) * estLen, left = k === 0 ? rng() < 0.5 : zones.length && boxes[0].minX < 5;
      const pts = left ? [[0, 0], [a, 0], [0, b]] : [[W, 0], [W - a, 0], [W, b]];
      add(shape(pts, left ? [0, R(rng, -0.12, 0.12), 0] : [0, 0, R(rng, -0.12, 0.12)]));
    }
    // дефекти: плями по всій довжині
    const nDef = opts.defects === undefined ? 3 + Math.floor(rng() * 4) : opts.defects;
    for (let tries = 0, d = 0; d < nDef && tries < 60; tries++) {
      const r = R(rng, 0.06, 0.13) * W, cx = R(rng, r, W - r), cy = R(rng, 0.1, 0.95) * estLen;
      if (add(blob(rng, cx, cy, r))) d++;
    }
    return zones;
  }
  /** Незалежна перевірка: розкладка валідна, нічого не лягло на заборонені зони. Ефективність = площа деталей / (W·довжина). */
  function evaluateWithZones(pcs, placements, zones, W) {
    const polys = P.placementsToPolys(pcs, placements);
    const ev = N.evaluateLayout(polys, { width: W, height: 8000, rollWidth: W });
    const ev2 = N.evaluateLayout(polys.concat(zones), { width: W, height: 8000, rollWidth: W });
    const n = pcs.length, hit = (ev2.overlaps || []).filter(o => { const a = o.i, b = o.j; return (a >= n) !== (b >= n); });
    return { valid: ev.valid && hit.length === 0, efficiency: ev.efficiency, len: ev.extent.length, zoneHits: hit.length };
  }
  return { makeZones, evaluateWithZones, blob, shape };
});

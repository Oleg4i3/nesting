/*
 * garment.js — «реалістичні» задачі без відомого оптимуму: набір викрійок, схожих на деталі одягу
 * (корпус з проймою й горловиною, рукав зі скругленою окатом, штанина, коміри/манжети/пояси-смуги, кишені),
 * НЕ отриманий розрізанням прямокутника. Еталона немає; порівнюємо лише з найкращим відомим розв'язком.
 * Формат деталі: {vertices:[{x,y}], bezierControls:[null|{x,y}]} — як у редакторі (подвоєна контрольна точка).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./puzzle.js'));
  else root.NestGarment = factory(root.NestPuzzle);
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';
  const R = (rng, a, b) => a + (b - a) * rng();

  /** Багатокутник за вершинами (за год. стрілкою) і «випинанням» кожного ребра: частка довжини ребра, + назовні. */
  function shape(pts, bulges) {
    const n = pts.length, vs = pts.map(p => ({ x: Math.round(p[0]), y: Math.round(p[1]) })), bc = [];
    for (let i = 0; i < n; i++) {
      const b = bulges[i] || 0;
      if (!b) { bc.push(null); continue; }
      const p = vs[i], q = vs[(i + 1) % n], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
      // для обходу за год. стрілкою (у екранних координатах) зовнішня нормаль = (dy, -dx)/len
      bc.push({ x: Math.round((p.x + q.x) / 2 + (dy / len) * b * len), y: Math.round((p.y + q.y) / 2 - (dx / len) * b * len) });
    }
    return { vertices: vs, bezierControls: bc };
  }

  const MAKERS = {
    bodice(rng, s) {   // корпус: плечова лінія, горловина (увігнута), пройма (увігнута), бічний шов, низ
      const w = R(rng, 110, 170) * s, h = R(rng, 190, 260) * s, neck = R(rng, 0.2, 0.32) * w, sh = R(rng, 0.12, 0.2) * h, arm = R(rng, 0.3, 0.42) * h;
      return shape([[neck, 0], [w, sh * 0.5], [w - R(rng, 5, 25) * s, arm], [w, h], [0, h], [0, sh * 0.3]],
        [-R(rng, 0.2, 0.45), 0, -R(rng, 0.12, 0.3), 0, 0, -R(rng, 0.05, 0.2)]);
    },
    sleeve(rng, s) {   // рукав: окат зверху (опуклий), звужується до манжети
      const wT = R(rng, 110, 160) * s, wB = wT * R(rng, 0.5, 0.75), h = R(rng, 150, 230) * s, off = (wT - wB) / 2;
      return shape([[0, R(rng, 20, 45) * s], [wT, R(rng, 20, 45) * s], [wT - off, h], [off, h]], [R(rng, 0.2, 0.4), 0, 0, 0]);
    },
    trouser(rng, s) {  // штанина: довга, звужується, увігнута лінія кроку
      const wT = R(rng, 90, 130) * s, wB = wT * R(rng, 0.6, 0.85), h = R(rng, 240, 330) * s, off = (wT - wB) / 2;
      return shape([[0, 0], [wT, 0], [wT - off * 0.4, h * 0.45], [wT - off, h], [off, h], [0, h * 0.35]], [0, -R(rng, 0.05, 0.12), 0, 0, 0, R(rng, 0.02, 0.06)]);
    },
    strip(rng, s) {    // пояс / планка / манжета: довга тонка смужка, інколи злегка вигнута
      const l = R(rng, 150, 300) * s, t = R(rng, 18, 38) * s, c = rng() < 0.4 ? R(rng, -0.04, 0.04) : 0;
      return shape([[0, 0], [l, 0], [l, t], [0, t]], [c, 0, -c, 0]);
    },
    collar(rng, s) {   // комір: «банан» із двома скругленими краями
      const l = R(rng, 100, 150) * s, t = R(rng, 30, 50) * s;
      return shape([[0, 0], [l, R(rng, 0, 8)], [l - R(rng, 10, 25), t], [R(rng, 10, 25), t * 0.9]], [R(rng, 0.1, 0.25), 0, -R(rng, 0.1, 0.25), 0]);
    },
    pocket(rng, s) {   // кишеня: невеликий прямокутник зі скошеним/округлим низом
      const w = R(rng, 40, 70) * s, h = R(rng, 45, 80) * s;
      return shape([[0, 0], [w, 0], [w, h * 0.8], [w / 2, h], [0, h * 0.8]], [0, 0, R(rng, 0, 0.1), R(rng, 0, 0.1), 0]);
    },
    patch(rng, s) {    // дрібна деталь: підкладка, хлястик
      const w = R(rng, 30, 55) * s, h = R(rng, 30, 55) * s;
      return shape([[0, 0], [w, h * 0.1], [w * 0.9, h], [0, h * 0.85]], [R(rng, -0.1, 0.1), 0, 0, 0]);
    },
  };

  /** Кількість деталей n; склад випадковий; ширина рулону підбирається під найбільшу деталь. */
  function generate(seed, opts = {}) {
    const rng = P.mulberry32(seed * 9973 + 11), n = opts.pieces || (14 + Math.floor(rng() * 13));
    const s = opts.scale || R(rng, 0.8, 1.1);
    const mix = [['bodice', 3], ['sleeve', 3], ['trouser', 2], ['strip', 3], ['collar', 1.5], ['pocket', 3], ['patch', 2]];
    const tot = mix.reduce((a, m) => a + m[1], 0), pieces = [], kinds = [];
    for (let i = 0; i < n; i++) {
      let r = rng() * tot, k = mix[0][0];
      for (const [nm, w] of mix) { if ((r -= w) <= 0) { k = nm; break; } }
      pieces.push(MAKERS[k](rng, s)); kinds.push(k);
    }
    // зсув у додатні координати, кратні 10
    const out = pieces.map(p => {
      const mnx = Math.min(...p.vertices.map(v => v.x)), mny = Math.min(...p.vertices.map(v => v.y));
      const dx = -Math.floor(mnx / 10) * 10, dy = -Math.floor(mny / 10) * 10;
      return { vertices: p.vertices.map(v => ({ x: v.x + dx, y: v.y + dy })), bezierControls: p.bezierControls.map(c => c && { x: c.x + dx, y: c.y + dy }) };
    });
    // габарити по вершинах+контрольних точках (грубо), ширина рулону — кратна 10, не вужча за найбільший менший розмір деталі
    const dim = out.map(p => { const xs = p.vertices.map(v => v.x).concat(p.bezierControls.filter(Boolean).map(c => c.x)), ys = p.vertices.map(v => v.y).concat(p.bezierControls.filter(Boolean).map(c => c.y)); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; });
    const rl = opts.rules || { rotations: 'any', mirror: false };
    const minLong = rl.rotations === 'any' ? Math.max(...dim.map(d => Math.min(d[0], d[1]))) : Math.max(...dim.map(d => d[0]));       // кожна деталь має вміститися хоча б однією стороною
    const area = out.reduce((a, p) => a + Math.abs(P.polygonAreaApprox ? P.polygonAreaApprox(p) : 0), 0);
    const width = opts.width || Math.ceil(Math.max(minLong * R(rng, 1.15, 1.6), 300) / 10) * 10;
    return { seed, pieces: out, kinds, width, rules: opts.rules || { rotations: 'any', mirror: false } };
  }

  return { generate, MAKERS };
});

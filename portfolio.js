/* portfolio.js — комбінований відбір: та сама мережа (оцінювач кандидатів) запускається з кількома способами
 * ранжування в променевому пошуку й у жадібному режимі поверх BL-позицій; повертається розкладка з найменшою довжиною.
 * Причина: ранжування променя за сумарною ймовірністю (logp) ідеальне на пазлах, але на реальних контурах руйнує
 * результат (66 % проти 85 % за ранжування відходами на marques); жоден критерій не найкращий усюди. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./raster.js'), require('./beam.js'), require('./guided.js'));
  else root.NestPortfolio = factory(root.Nest, root.NestBeam, root.NestGuided);
})(typeof self !== 'undefined' ? self : this, function (N, Bm, Gd) {
  'use strict';
  function solvePortfolio(pieces, rules, net, opts) {
    const t0 = Date.now(), maxMs = opts.maxMs || 20000, W = opts.width, trace = [];
    let best = null;
    const take = (name, r, ms) => {
      if (!r || !r.placements) return;
      const placed = r.placements.filter(Boolean).length, len = r.lengthPx;
      trace.push({ name, placed, len, ms });
      if (!best || placed > best.placed || (placed === best.placed && len < best.len)) best = { name, placed, len, r };
    };
    // 1) жадібний режим: мережа вибирає (деталь, варіант), позиція — перше нижнє-ліве місце
    let t = Date.now();
    try { take('guided', Gd.solveGuided(pieces, rules, net, { width: W, maxLength: opts.maxLength, temp: 0, budgetMs: 1, maxIters: 1, blocked: opts.blocked }), Date.now() - t); } catch (e) { /* дії можуть не існувати */ }
    // 2) промінь із трьома критеріями відбору
    const variants = [['beam-logp', { rank: 'logp' }], ['beam-waste', { rank: 'waste' }], ['beam-mix', { rank: 'mix', mixBeta: 1 }]];
    let last = 0;
    for (const [name, o] of variants) {
      if (best && Date.now() - t0 + last > maxMs && name !== 'beam-logp') break;
      t = Date.now();
      const r = Bm.solveBeam(pieces, rules, net, Object.assign({ beam: 16, K: 1000, noSlit: true }, opts, o));
      last = Date.now() - t; take(name, r, last);
    }
    const r = best.r, seq = (r.seq && r.seq.length && r.seq.every(q => q.A !== undefined)) ? r.seq : r.placements.map((p, i) => p && { pi: i, vi: p.vi, A: p.A, cy: p.cy }).filter(Boolean);   // у beam seq містить координати, у guided їх беремо з розміщень
    return { placements: r.placements, lengthPx: best.len, placed: best.placed, seq, how: best.name, trace, ms: Date.now() - t0 };
  }
  return { solvePortfolio };
});

/*
 * nn.js — маленька нейромережа-скорер на чистому JS (без залежностей).
 *   score(x) = w3·tanh(W2ᵀ tanh(W1ᵀ x + b1) + b2) + b3  +  ws·x      (skip: пряма лінійна частина)
 * За замовчуванням F=18, H1=16, H2=8 → 467 параметрів.
 * Навчання: (1) ранжування за еталоном (softmax, кілька позитивів), Adam; (2) ES за реальною метрикою.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NestNN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng()); }

  class MLP {
    constructor(F = 18, H1 = 16, H2 = 8) {
      this.F = F; this.H1 = H1; this.H2 = H2;
      this.oW1 = 0; this.ob1 = F * H1; this.oW2 = this.ob1 + H1; this.ob2 = this.oW2 + H1 * H2;
      this.ow3 = this.ob2 + H2; this.ob3 = this.ow3 + H2; this.ows = this.ob3 + 1; this.n = this.ows + F;
      this.p = new Float64Array(this.n);
      this._h1 = new Float64Array(H1); this._h2 = new Float64Array(H2);
    }
    /** Малі випадкові ваги в прихованих шарах; skip-частина — груба евристика (менше довжини, більше контакту). */
    init(seed = 1, skip = { 0: -4, 1: -1, 3: 1.5, 6: -0.5, 7: -0.5 }) {
      const rng = mulberry32(seed), p = this.p, { F, H1, H2 } = this;
      for (let i = 0; i < F * H1; i++) p[this.oW1 + i] = gauss(rng) * 0.4 / Math.sqrt(F);
      for (let i = 0; i < H1 * H2; i++) p[this.oW2 + i] = gauss(rng) * 0.4 / Math.sqrt(H1);
      for (let i = 0; i < H2; i++) p[this.ow3 + i] = gauss(rng) * 0.1;
      for (const k in skip) p[this.ows + (+k)] = skip[k];
      return this;
    }
    _fwd(x, xo, h1, h2) {
      const p = this.p, { F, H1, H2 } = this;
      for (let j = 0; j < H1; j++) {
        let s = p[this.ob1 + j];
        for (let i = 0; i < F; i++) s += x[xo + i] * p[this.oW1 + i * H1 + j];
        h1[j] = Math.tanh(s);
      }
      for (let j = 0; j < H2; j++) {
        let s = p[this.ob2 + j];
        for (let i = 0; i < H1; i++) s += h1[i] * p[this.oW2 + i * H2 + j];
        h2[j] = Math.tanh(s);
      }
      let o = p[this.ob3];
      for (let j = 0; j < H2; j++) o += h2[j] * p[this.ow3 + j];
      for (let i = 0; i < F; i++) o += x[xo + i] * p[this.ows + i];
      return o;
    }
    /** Скорер-інтерфейс для solveNN */
    score(Fb, count, out) {
      for (let k = 0; k < count; k++) out[k] = this._fwd(Fb, k * this.F, this._h1, this._h2);
    }
    /** Multi-positive softmax: loss = logsumexp(all) − logsumexp(positives). Додає градієнт у g, повертає loss. */
    lossGrad(sample, g) {
      const { F, H1, H2 } = this, p = this.p, K = sample.count, x = sample.F, pos = sample.pos;
      const s = new Float64Array(K), H1s = new Float64Array(K * H1), H2s = new Float64Array(K * H2);
      const h1 = new Float64Array(H1), h2 = new Float64Array(H2);
      let mx = -Infinity;
      for (let k = 0; k < K; k++) {
        s[k] = this._fwd(x, k * F, h1, h2); H1s.set(h1, k * H1); H2s.set(h2, k * H2);
        if (s[k] > mx) mx = s[k];
      }
      let za = 0, zp = 0;
      for (let k = 0; k < K; k++) { const e = Math.exp(s[k] - mx); za += e; if (pos[k]) zp += e; }
      const loss = Math.log(za) - Math.log(zp);
      for (let k = 0; k < K; k++) {
        const e = Math.exp(s[k] - mx);
        const d = e / za - (pos[k] ? e / zp : 0);
        if (Math.abs(d) < 1e-9) continue;
        const o = k * F, a1 = k * H1, a2 = k * H2;
        g[this.ob3] += d;
        for (let i = 0; i < F; i++) g[this.ows + i] += d * x[o + i];
        for (let j = 0; j < H2; j++) g[this.ow3 + j] += d * H2s[a2 + j];
        const dz2 = new Float64Array(H2);
        for (let j = 0; j < H2; j++) dz2[j] = d * p[this.ow3 + j] * (1 - H2s[a2 + j] * H2s[a2 + j]);
        for (let j = 0; j < H2; j++) g[this.ob2 + j] += dz2[j];
        const dz1 = new Float64Array(H1);
        for (let i = 0; i < H1; i++) {
          let dh = 0;
          for (let j = 0; j < H2; j++) { g[this.oW2 + i * H2 + j] += H1s[a1 + i] * dz2[j]; dh += p[this.oW2 + i * H2 + j] * dz2[j]; }
          dz1[i] = dh * (1 - H1s[a1 + i] * H1s[a1 + i]);
        }
        for (let j = 0; j < H1; j++) {
          g[this.ob1 + j] += dz1[j];
          for (let i = 0; i < F; i++) g[this.oW1 + i * H1 + j] += x[o + i] * dz1[j];
        }
      }
      return loss;
    }
    /** Топ-1 збігається з одним із позитивів? */
    hit(sample) {
      const S = new Float64Array(sample.count); this.score(sample.F, sample.count, S);
      let b = 0; for (let k = 1; k < sample.count; k++) if (S[k] > S[b]) b = k;
      return sample.pos[b] ? 1 : 0;
    }
    toJSON() { return { F: this.F, H1: this.H1, H2: this.H2, activation: 'tanh', params: Array.from(this.p) }; }
    static fromJSON(j) { const m = new MLP(j.F, j.H1, j.H2); m.p.set(j.params); return m; }
    clone() { const m = new MLP(this.F, this.H1, this.H2); m.p.set(this.p); return m; }
  }

  class Adam {
    constructor(n, lr = 3e-3, b1 = 0.9, b2 = 0.999) { this.m = new Float64Array(n); this.v = new Float64Array(n); this.t = 0; this.lr = lr; this.b1 = b1; this.b2 = b2; }
    step(p, g, wd = 0) {
      this.t++;
      const c1 = 1 - Math.pow(this.b1, this.t), c2 = 1 - Math.pow(this.b2, this.t);
      for (let i = 0; i < p.length; i++) {
        this.m[i] = this.b1 * this.m[i] + (1 - this.b1) * g[i];
        this.v[i] = this.b2 * this.v[i] + (1 - this.b2) * g[i] * g[i];
        p[i] -= this.lr * ((this.m[i] / c1) / (Math.sqrt(this.v[i] / c2) + 1e-8) + wd * p[i]);
      }
    }
  }

  /** Навчання ранжуванню за еталоном. */
  function trainImitation(net, train, val, opts = {}) {
    const epochs = opts.epochs || 40, batch = opts.batch || 16, rng = mulberry32(opts.seed || 7);
    const opt = new Adam(net.n, opts.lr || 3e-3), g = new Float64Array(net.n), idx = train.map((_, i) => i);
    const log = [];
    for (let ep = 1; ep <= epochs; ep++) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      let loss = 0;
      for (let b = 0; b < idx.length; b += batch) {
        g.fill(0); const n = Math.min(batch, idx.length - b);
        for (let k = 0; k < n; k++) loss += net.lossGrad(train[idx[b + k]], g);
        for (let i = 0; i < g.length; i++) g[i] /= n;
        opt.step(net.p, g, 1e-4);
      }
      if (ep % 5 === 0 || ep === 1 || ep === epochs) {
        let ht = 0, hv = 0; for (const s of train) ht += net.hit(s); for (const s of val) hv += net.hit(s);
        const row = { ep, loss: loss / train.length, trainHit: ht / train.length, valHit: val.length ? hv / val.length : NaN };
        log.push(row); if (opts.onLog) opts.onLog(row);
      }
    }
    return log;
  }

  return { MLP, Adam, trainImitation, mulberry32, gauss };
});

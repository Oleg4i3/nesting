/*
 * nnx.js — узагальнений MLP-скорер: довільні приховані шари, активація, skip-зв'язок. Чистий JS.
 *   score(x) = bo + wo·h_L + ws·x,   h_l = act(W_l h_{l-1} + b_l),  h_0 = x
 * hidden=[] дає чисто лінійний скорер (лише skip). Для ES градієнти не потрібні.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NestNNX = factory();
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
  const gauss = rng => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());

  const ACT = {
    tanh: Math.tanh,
    relu: x => (x > 0 ? x : 0),
    leaky: x => (x > 0 ? x : 0.1 * x),
    elu: x => (x > 0 ? x : Math.exp(x) - 1),
    silu: x => x / (1 + Math.exp(-x)),
    softsign: x => x / (1 + Math.abs(x)),
    gelu: x => 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x))),
  };

  class MLPX {
    constructor(F = 18, hidden = [16, 8], act = 'tanh', skip = true) {
      if (!ACT[act]) throw new Error('Невідома активація: ' + act);
      this.F = F; this.hidden = hidden.slice(); this.act = act; this.skip = skip; this.f = ACT[act];
      const sizes = [F, ...hidden]; this.off = []; let o = 0;
      for (let l = 0; l < hidden.length; l++) { this.off.push({ W: o, b: o + sizes[l] * sizes[l + 1] }); o += sizes[l] * sizes[l + 1] + sizes[l + 1]; }
      this.sizes = sizes; this.owo = o; o += hidden.length ? hidden[hidden.length - 1] : 0;
      this.obo = o; o += 1; this.ows = o; if (skip) o += F;
      this.n = o; this.p = new Float64Array(o);
      this._h = sizes.map(s => new Float64Array(s));
    }
    /** Ваги прихованих шарів — малі випадкові; skip-частина — груба евристика (менше довжини, більше контакту). */
    init(seed = 1, heur = { 0: -4, 1: -1, 3: 1.5, 6: -0.5, 7: -0.5 }) {
      const rng = mulberry32(seed), p = this.p;
      for (let l = 0; l < this.hidden.length; l++) {
        const nin = this.sizes[l], nout = this.sizes[l + 1], s = (this.act === 'relu' || this.act === 'leaky' ? 0.8 : 0.4) / Math.sqrt(nin);
        for (let i = 0; i < nin * nout; i++) p[this.off[l].W + i] = gauss(rng) * s;
      }
      if (this.hidden.length) for (let i = 0; i < this.hidden[this.hidden.length - 1]; i++) p[this.owo + i] = gauss(rng) * 0.1;
      if (this.skip) for (const k in heur) p[this.ows + (+k)] = heur[k];
      else if (!this.hidden.length) for (const k in heur) p[this.ows + (+k)] = heur[k];
      return this;
    }
    _fwd(x, xo) {
      const p = this.p, H = this._h, f = this.f, L = this.hidden.length;
      let prev = null, o = p[this.obo];
      for (let l = 0; l < L; l++) {
        const nin = this.sizes[l], nout = this.sizes[l + 1], out = H[l + 1], W = this.off[l].W, b = this.off[l].b;
        for (let j = 0; j < nout; j++) {
          let s = p[b + j];
          if (l === 0) for (let i = 0; i < nin; i++) s += x[xo + i] * p[W + i * nout + j];
          else for (let i = 0; i < nin; i++) s += prev[i] * p[W + i * nout + j];
          out[j] = f(s);
        }
        prev = out;
      }
      if (L) for (let j = 0; j < this.hidden[L - 1]; j++) o += prev[j] * p[this.owo + j];
      if (this.skip) for (let i = 0; i < this.F; i++) o += x[xo + i] * p[this.ows + i];
      return o;
    }
    score(Fb, count, out) { for (let k = 0; k < count; k++) out[k] = this._fwd(Fb, k * this.F); }
    /** Похідна активації за передактивацією z та виходом h. */
    _d(z, h) {
      switch (this.act) {
        case 'tanh': return 1 - h * h;
        case 'relu': return z > 0 ? 1 : 0;
        case 'leaky': return z > 0 ? 1 : 0.1;
        case 'elu': return z > 0 ? 1 : h + 1;
        case 'silu': { const s = 1 / (1 + Math.exp(-z)); return s * (1 + z * (1 - s)); }
        case 'softsign': { const d = 1 + Math.abs(z); return 1 / (d * d); }
        default: throw new Error('Немає похідної для ' + this.act);
      }
    }
    /**
     * Multi-positive softmax: loss = logsumexp(усі) − logsumexp(позитиви). Додає градієнт у g, повертає loss.
     * sample: {F: Float32Array(count*F), count, pos: Uint8Array(count)}.
     */
    lossGrad(sample, g) {
      const { F, hidden } = this, L = hidden.length, p = this.p, K = sample.count, x = sample.F, pos = sample.pos, sizes = this.sizes;
      const Z = [null], H = [null];
      for (let l = 1; l <= L; l++) { Z.push(new Float64Array(K * sizes[l])); H.push(new Float64Array(K * sizes[l])); }
      const s = new Float64Array(K), f = this.f;
      for (let k = 0; k < K; k++) {
        let o = p[this.obo];
        for (let l = 0; l < L; l++) {
          const nin = sizes[l], nout = sizes[l + 1], W = this.off[l].W, b = this.off[l].b, zo = k * nout;
          for (let j = 0; j < nout; j++) {
            let a = p[b + j];
            if (l === 0) for (let i = 0; i < nin; i++) a += x[k * F + i] * p[W + i * nout + j];
            else { const ho = k * nin, Hp = H[l]; for (let i = 0; i < nin; i++) a += Hp[ho + i] * p[W + i * nout + j]; }
            Z[l + 1][zo + j] = a; H[l + 1][zo + j] = f(a);
          }
        }
        if (L) { const hl = sizes[L]; for (let j = 0; j < hl; j++) o += H[L][k * hl + j] * p[this.owo + j]; }
        if (this.skip) for (let i = 0; i < F; i++) o += x[k * F + i] * p[this.ows + i];
        s[k] = o;
      }
      let mx = -Infinity; for (let k = 0; k < K; k++) if (s[k] > mx) mx = s[k];
      let za = 0, zp = 0;
      for (let k = 0; k < K; k++) { const e = Math.exp(s[k] - mx); za += e; if (pos[k]) zp += e; }
      const loss = Math.log(za) - Math.log(zp);
      for (let k = 0; k < K; k++) {
        const e = Math.exp(s[k] - mx), d = e / za - (pos[k] ? e / zp : 0);
        if (Math.abs(d) < 1e-9) continue;
        g[this.obo] += d;
        if (this.skip) for (let i = 0; i < F; i++) g[this.ows + i] += d * x[k * F + i];
        if (!L) continue;
        let delta = new Float64Array(sizes[L]);
        for (let j = 0; j < sizes[L]; j++) {
          const idx = k * sizes[L] + j;
          g[this.owo + j] += d * H[L][idx];
          delta[j] = d * p[this.owo + j] * this._d(Z[L][idx], H[L][idx]);
        }
        for (let l = L - 1; l >= 0; l--) {
          const nin = sizes[l], nout = sizes[l + 1], W = this.off[l].W, b = this.off[l].b;
          const prevDelta = l > 0 ? new Float64Array(nin) : null;
          for (let j = 0; j < nout; j++) {
            const dj = delta[j]; g[b + j] += dj;
            for (let i = 0; i < nin; i++) {
              const hv = l === 0 ? x[k * F + i] : H[l][k * nin + i];
              g[W + i * nout + j] += hv * dj;
              if (l > 0) prevDelta[i] += p[W + i * nout + j] * dj;
            }
          }
          if (l > 0) { for (let i = 0; i < nin; i++) prevDelta[i] *= this._d(Z[l][k * nin + i], H[l][k * nin + i]); delta = prevDelta; }
        }
      }
      return loss;
    }
    /** loss і попадання в топ-1 без градієнта */
    evalSample(sample) {
      const S = new Float64Array(sample.count); this.score(sample.F, sample.count, S);
      let mx = -Infinity, b = 0; for (let k = 0; k < sample.count; k++) { if (S[k] > mx) { mx = S[k]; b = k; } }
      let za = 0, zp = 0; for (let k = 0; k < sample.count; k++) { const e = Math.exp(S[k] - mx); za += e; if (sample.pos[k]) zp += e; }
      return { loss: Math.log(za) - Math.log(Math.max(zp, 1e-300)), hit: sample.pos[b] ? 1 : 0 };
    }
    toJSON() { return { F: this.F, hidden: this.hidden, act: this.act, skip: this.skip, params: Array.from(this.p) }; }
    static fromJSON(j) { const m = new MLPX(j.F, j.hidden, j.act, j.skip); m.p.set(j.params); return m; }
  }
  return { MLPX, ACT, mulberry32, gauss };
});

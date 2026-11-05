// Спільне для навчання/оцінки: специфікації пазлів та фабрика.
const P = require('./puzzle.js');
const NN = require('./nn.js');

/** Детермінована випадкова специфікація пазла за seed. */
function randomSpec(seed) {
  const r = NN.mulberry32(seed * 2654435761 >>> 0);
  const pick = a => a[Math.floor(r() * a.length)];
  const rules = pick([
    { rotations: 'any', mirror: true }, { rotations: 'any', mirror: true },
    { rotations: 'any', mirror: false }, { rotations: 'half', mirror: false }, { rotations: 'none', mirror: false },
  ]);
  return {
    seed,
    width: 10 * (25 + Math.floor(r() * 11)),       // 250..350
    length: 10 * (40 + Math.floor(r() * 21)),      // 400..600
    pieces: 6 + Math.floor(r() * 15),              // 6..20
    wiggle: 0.2 + r() * 0.6,
    waste: r() < 0.25 ? 0.08 : 0,
    trim: r() < 0.8 ? 0.4 + r() * 0.5 : 0,
    trimMin: 0.3, trimMax: 0.9,
    rules,
  };
}

/** "Важка" специфікація: більший розкид розмірів, кармани, глибші криві. */
function randomSpecHard(seed) {
  const r = NN.mulberry32((seed * 2654435761 >>> 0) ^ 0x9e3779b9);
  const pick = a => a[Math.floor(r() * a.length)];
  const rules = pick([
    { rotations: 'any', mirror: true }, { rotations: 'any', mirror: true },
    { rotations: 'any', mirror: false }, { rotations: 'half', mirror: false }, { rotations: 'none', mirror: false },
  ]);
  return {
    seed, hard: true,
    width: 10 * (25 + Math.floor(r() * 11)),
    length: 10 * (40 + Math.floor(r() * 21)),
    pieces: 8 + Math.floor(r() * 15),               // 8..22
    wiggle: 0.5 + r() * 0.5,
    spread: 0.5 + r() * 0.5,                        // розкид розмірів
    pockets: 0.5 + r() * 0.5,                       // кармани для дрібних деталей
    waste: r() < 0.25 ? 0.08 : 0,
    trim: r() < 0.8 ? 0.4 + r() * 0.5 : 0,
    trimMin: 0.3, trimMax: 0.9,
    rules,
  };
}

/**
 * Набір "hard20": 20–28 деталей, рулон пропорційний кількості деталей (площа на деталь ~ const),
 * деталі порівнянного розміру, глибокі криві й кармани. Саме тут жадібна евристика втрачає ~20–25 п.п.
 */
function randomSpecHard20(seed) {
  const r = NN.mulberry32((seed * 2654435761 >>> 0) ^ 0x85ebca6b);
  const pick = a => a[Math.floor(r() * a.length)];
  const rules = pick([
    { rotations: 'any', mirror: true }, { rotations: 'any', mirror: true },
    { rotations: 'any', mirror: false }, { rotations: 'half', mirror: false },
    { rotations: 'none', mirror: false }, { rotations: 'none', mirror: false },
  ]);
  const pieces = 20 + Math.floor(r() * 9), width = 10 * (36 + Math.floor(r() * 9));
  return {
    seed, hard: 20, width, pieces,
    length: Math.round(pieces * 12500 * (0.9 + 0.2 * r()) / width / 10) * 10,
    wiggle: 0.7 + r() * 0.3, spread: r() * 0.3, pockets: 0.6 + r() * 0.4,
    waste: r() < 0.2 ? 0.05 : 0, trim: 0.4 + r() * 0.5, trimMin: 0.3, trimMax: 0.9, rules,
  };
}

/** Менші пазли того ж стилю, що hard20 (10–14 деталей) — для швидкого навчання; тестуємо потім на hard20. */
function randomSpecMid(seed) {
  const sp = randomSpecHard20(seed + 700000);
  const r = NN.mulberry32((seed * 40503 >>> 0) ^ 0xc2b2ae35);
  const pieces = 10 + Math.floor(r() * 5), width = 10 * (30 + Math.floor(r() * 9));
  return Object.assign(sp, { seed, hard: 10, pieces, width, length: Math.round(pieces * 12500 * (0.9 + 0.2 * r()) / width / 10) * 10 });
}

/** Пазли з неминучими відходами: еталон лише верхня межа (ефективність еталона ≈ 75–92 %). */
function randomSpecWaste(seed, big) {
  const r = NN.mulberry32((seed * 2246822519 >>> 0) ^ 0x27d4eb2f);
  const pick = a => a[Math.floor(r() * a.length)];
  const rules = pick([{ rotations: 'any', mirror: true }, { rotations: 'any', mirror: false }, { rotations: 'half', mirror: false }, { rotations: 'none', mirror: false }]);
  const pieces = big ? 18 + Math.floor(r() * 11) : 10 + Math.floor(r() * 8);
  const width = 10 * (24 + Math.floor(r() * 29));
  return {
    seed, hard: 'w', width, pieces,
    length: Math.round(pieces * 12500 * (0.9 + 0.2 * r()) / width / 10) * 10,
    wiggle: 0.4 + r() * 0.6, spread: r() * 0.6, pockets: r(),
    waste: 0.04 + r() * 0.14, trim: 0.8 + r() * 0.2, trimMin: 0.1, trimMax: 0.5 + r() * 0.5, rules,
  };
}

/** Пазли з довільними кутами (кратні 15°). stage 1 — щільні, без обрізки; stage 2 — з обрізками й відходами. big — більше деталей. */
function randomSpecAng(seed, stage, big) {
  const r = NN.mulberry32((seed * 2654435761 >>> 0) ^ 0x1b873593 ^ (stage * 977));
  const pieces = (big ? 18 : 8) + Math.floor(r() * (big ? 9 : 7)), width = 10 * (24 + Math.floor(r() * 13));
  const base = { seed, hard: 'a' + stage, width, pieces, length: Math.round(pieces * 12500 * (0.9 + 0.2 * r()) / width / 10) * 10,
    wiggle: 0.5 + r() * 0.5, spread: r() * 0.3, pockets: 0.5 + r() * 0.5, rules: { rotations: 'deg15', mirror: false } };
  if (stage === 1) return Object.assign(base, { waste: 0, trim: 0 });
  return Object.assign(base, { waste: 0.04 + r() * 0.11, trim: 0.6 + r() * 0.4, trimMin: 0.1, trimMax: 0.5 + r() * 0.4 });
}
const cache = new Map();
function makePuzzle(spec) {
  const k = JSON.stringify(spec);
  if (!cache.has(k)) { if (cache.size > 200) cache.clear(); cache.set(k, P.generate(spec)); }
  return cache.get(k);
}
module.exports = { randomSpec, randomSpecHard, randomSpecHard20, randomSpecMid, randomSpecWaste, randomSpecAng, makePuzzle };

/** Етап 3: великі пазли (18–26), довільні кути deg15, обрізки (trim), виїмки (scoop, прямі → увігнуті дуги) і відходи.
 *  kind: 'scoop' | 'hole' | 'remnant' | 'both' — тип пазла; для hole/remnant/both використовуй makeHole(). */
function randomSpecAng3(seed, kind, big) {
  const sp = randomSpecAng(seed, 2, big), r = NN.mulberry32((seed * 69069 >>> 0) ^ 0x9e3779b9);
  return Object.assign(sp, { hard: 'a3' + kind, scoop: 0.35 + r() * 0.5, scoopMin: 0.03, scoopMax: 0.07 + r() * 0.08, waste: kind === 'scoop' ? sp.waste : 0.02 + r() * 0.06 });
}
const HP = require('./holes.js');
const hcache = new Map();
function makeHole(seed, kind, big) {
  const k = seed + '|' + kind + '|' + big;
  if (!hcache.has(k)) { if (hcache.size > 100) hcache.clear(); const pz = makePuzzle(randomSpecAng3(seed, kind, big)); hcache.set(k, kind === 'scoop' ? Object.assign({ blocked: [] }, pz) : HP.makeHolePuzzle(pz, kind, seed)); }
  return hcache.get(k);
}
module.exports.randomSpecAng3 = randomSpecAng3; module.exports.makeHole = makeHole;

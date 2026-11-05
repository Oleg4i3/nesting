/* rl_tasks.js — задачі з реальних деталей для донавчання і перевірки: підвибірки наборів ESICUP і викрійок костюма,
 * рулон прямокутний / з дефектами та обрізками / з нерівними краями / обидва. Усе детерміновано за (набір, сценарій, зерно).
 *   spec = {set, kind: 'plain'|'defects'|'ragged'|'both', seed, n, rot: 'dataset'|'deg5'|'deg15'}
 *   build(spec) -> {pcs, W, rules, blocked, area, name}
 */
const fs = require('fs'), path = require('path');
const N = require('./raster.js'), P = require('./puzzle.js'), Z = require('./zones.js');
const R = require('./ext_real.js');

const toP = p => ({ vertices: p.v.map(a => ({ x: a[0], y: a[1] })), bezierControls: p.c.map(c => c ? { x: c[0], y: c[1] } : null) });
const cache = {};
function rawSet(id) {
  if (cache[id]) return cache[id];
  let r;
  if (id === 'suit') {
    const sc = JSON.parse(fs.readFileSync(path.join(__dirname, 'examples/private/suit_1.json'), 'utf8'));
    r = { pcs: sc.pieces.map(p => Object.assign(toP(p), { _rot: [0, 2] })), W: sc.width };
  } else { const l = R.load(id); r = { pcs: l.pcs, W: l.W }; }
  return (cache[id] = r);
}
const clone = p => ({ vertices: p.vertices.map(v => ({ x: v.x, y: v.y })), bezierControls: p.bezierControls ? p.bezierControls.map(c => c ? { x: c.x, y: c.y } : null) : null, _rot: p._rot });

/** Нерівні краї рулона: з одного чи обох боків смуга змінної ширини вздовж усієї довжини. */
function edgeZones(seed, W, estLen) {
  const rng = P.mulberry32(seed * 104729 + 11), R_ = (a, b) => a + (b - a) * rng();
  const len = Math.min(3500, Math.ceil(estLen * 1.8)), mode = rng() < 0.4 ? 'both' : (rng() < 0.5 ? 'left' : 'right'), out = [];
  for (const side of (mode === 'both' ? ['left', 'right'] : [mode])) {
    const base = R_(0.03, 0.09) * W, taper = rng() < 0.35 ? R_(-0.05, 0.05) * W / Math.max(1, len / 300) : 0;   // інколи клин: край косий
    let w = base, y = 0; const pts = [];
    while (y < len) { pts.push([w, y]); y += R_(30, 70); w = Math.min(0.2 * W, Math.max(0, w + R_(-0.05, 0.05) * W + taper * 40 / 40)); }
    pts.push([w, len]);
    const poly = side === 'left' ? [[0, 0], ...pts, [0, len]] : [[W, 0], ...pts.map(([x, yy]) => [W - x, yy]), [W, len]];
    out.push(Z.shape(poly, []));
  }
  return out;
}

function build(spec) {
  const raw = rawSet(spec.set), rng = P.mulberry32(spec.seed * 7 + 5), W = raw.W;
  let idx = raw.pcs.map((_, i) => i);
  const n = spec.set === 'suit' ? raw.pcs.length : Math.min(spec.n || 18, idx.length);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  idx = idx.slice(0, n).sort((a, b) => a - b);
  const rot = spec.rot || 'dataset', pcs = idx.map(i => clone(raw.pcs[i]));
  for (const p of pcs) p.constraints = rot === 'dataset' ? { rotations: p._rot, mirror: false } : { rotations: rot, mirror: false };
  const area = pcs.reduce((s, p) => s + N.polygonArea(p), 0), estLen = area / (W * 0.72);
  let blocked = [];
  const kind = spec.kind || 'plain';
  if (kind === 'defects' || kind === 'both') blocked = blocked.concat(Z.makeZones(spec.seed, W, estLen, kind === 'both' ? { cuts: 0, defects: 2 + (spec.seed % 3) } : {}));
  if (kind === 'ragged' || kind === 'both') blocked = blocked.concat(edgeZones(spec.seed, W, estLen));
  const rules = { rotations: rot === 'dataset' ? raw.pcs[0]._rot : rot, mirror: false };
  return { pcs, W, rules, blocked, area, name: `${spec.set}/${kind}/${spec.seed}` };
}

/** Перевірка розкладки (нічого не лягло на зони, перетинів немає) і щільність. */
function evaluate(task, placements) {
  if (!placements || placements.filter(Boolean).length !== task.pcs.length) return null;
  const e = Z.evaluateWithZones(task.pcs, placements, task.blocked, task.W);
  return e.valid ? { dens: task.area / (task.W * e.len), len: e.len } : null;
}

module.exports = { build, evaluate, edgeZones, rawSet };

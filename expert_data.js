// Дистиляція beam search: експерт = beam (ширина B, ранжування logp) зі скорером-вчителем.
// Для кожного пазла перегравання найкращої послідовності дає зразки "стан → вибраний кандидат".
// node expert_data.js <частина> <частин> <тег> [ширина=24] [mid_train=220] [h20_train=40] [teacher.json (nnx) або порожньо = стара мережа]
const fs = require('fs');
const NN = require('./nn.js'), X = require('./nnx.js'), Fe = require('./features.js'), Bm = require('./beam.js'), N = require('./raster.js');
const C = require('./common.js');
const part = +process.argv[2] || 0, parts = +process.argv[3] || 1, tag = process.argv[4] || 'v1';
const BW = +process.argv[5] || 24, NMID = +process.argv[6] || 220, NH20 = +process.argv[7] || 40, teacherFile = process.argv[8];
const teacher = teacherFile ? X.MLPX.fromJSON(JSON.parse(fs.readFileSync(teacherFile, 'utf8'))) : NN.MLP.fromJSON(JSON.parse(fs.readFileSync('weights/net_es.json', 'utf8')));
const NF = Fe.NF, CELL = N.CELL;

function replay(pz, seq, K = 56) {
  const board = new Fe.Board(pz.width, 4000);
  const vars = pz.pieces.map(p => N.makeVariants(p, N.allowedFor(p, pz.rules)));
  let rem = []; pz.pieces.forEach((_, i) => { if (vars[i].some(v => v.w <= board.W)) rem.push(i); });
  const ctx = Fe.makeCtx(vars, board.W, rem, board), out = [];
  for (const st of seq) {
    const M = Math.max(5, Math.ceil(K / rem.length));
    const cands = Fe.genCandidates(board, vars, rem, M);
    let idx = cands.findIndex(c => c.pi === st.pi && c.vi === st.vi && c.A === st.A && c.cy === st.cy);
    if (idx < 0) { cands.push({ pi: st.pi, vi: st.vi, A: st.A, cy: st.cy, ct: board.contact(vars[st.pi][st.vi], st.A, st.cy), cheap: 0 }); idx = cands.length - 1; }
    const T = Fe.minDim(vars, rem), F = new Float32Array(cands.length * NF);
    for (let i = 0; i < cands.length; i++) Fe.fillFeatures(board, ctx, cands[i], rem.length, T, F, i * NF);
    out.push({ F, count: cands.length, pos: [idx] });
    board.place(vars[st.pi][st.vi], st.A, st.cy);
    rem = rem.filter(x => x !== st.pi);
  }
  return out;
}

const jobs = [];
for (let i = 1; i <= NMID; i++) jobs.push({ split: 'train', kind: 'mid', seed: i });
for (let i = 1; i <= NH20; i++) jobs.push({ split: 'train', kind: 'hard20', seed: 100000 + i });
for (let i = 1; i <= 30; i++) jobs.push({ split: 'val', kind: 'mid', seed: 6000 + i });
for (let i = 1; i <= 10; i++) jobs.push({ split: 'val', kind: 'hard20', seed: 97000 + i });
const specFn = { mid: C.randomSpecMid, hard20: C.randomSpecHard20 };
fs.mkdirSync('data', { recursive: true });
const meta = [], chunks = []; let offset = 0, effSum = 0, grSum = 0, n = 0;
const t0 = Date.now();
jobs.forEach((j, ji) => {
  if (ji % parts !== part) return;
  const pz = C.makePuzzle(specFn[j.kind](j.seed));
  const r = Bm.solveBeam(pz.pieces, pz.rules, teacher, { width: pz.width, maxLength: 4000, beam: BW, rank: 'logp' });
  if (r.placed !== pz.pieces.length) return;
  effSum += r.efficiency; n++;
  for (const s of replay(pz, r.seq)) {
    meta.push({ split: j.split, kind: j.kind, seed: j.seed, count: s.count, pos: s.pos, offset }); chunks.push(Buffer.from(s.F.buffer)); offset += s.count * NF;
  }
  if (n % 10 === 0) console.log(`[${part}] ${n} пазлів, зразків ${meta.length}, середня ефективність експерта ${(effSum / n * 100).toFixed(1)}%, ${((Date.now() - t0) / 1000).toFixed(0)}с`);
});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`, Buffer.concat(chunks));
fs.writeFileSync(`data/expert_${tag}_p${part}.json`, JSON.stringify({ NF, meta, puzzles: n, expertEff: effSum / n, beam: BW }));
console.log(`[${part}] готово: ${n} пазлів, ${meta.length} зразків, ефективність експерта ${(effSum / n * 100).toFixed(1)}%, ${((Date.now() - t0) / 1000).toFixed(0)}с`);

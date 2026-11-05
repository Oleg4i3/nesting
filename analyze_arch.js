const fs = require('fs');
const f = process.argv[2] || 'results/sup_v1.jsonl';
const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse);
const by = {}; rows.forEach(r => (by[r.name] = by[r.name] || []).push(r));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const pc = x => (x * 100).toFixed(1);
console.log('конфігурація           парам. | val loss  top-1 | ефект. mid B=1 | hard20 B=1 | hard20 B=8 | зерен');
const out = Object.entries(by).map(([name, rs]) => ({
  name, p: rs[0].params, n: rs.length, loss: mean(rs.map(r => r.valLoss)), top1: mean(rs.map(r => r.valTop1)),
  mid: mean(rs.map(r => r.effMid1)), h1: mean(rs.map(r => r.effH20_1)), h8: mean(rs.map(r => r.effH20_8)),
  lossSpread: Math.max(...rs.map(r => r.valLoss)) - Math.min(...rs.map(r => r.valLoss)),
  h8spread: Math.max(...rs.map(r => r.effH20_8)) - Math.min(...rs.map(r => r.effH20_8)),
}));
out.sort((a, b) => a.loss - b.loss);
for (const r of out) console.log(r.name.padEnd(22), String(r.p).padStart(5), '|', r.loss.toFixed(3).padStart(7), pc(r.top1).padStart(6) + '% |', pc(r.mid).padStart(10) + '% |', pc(r.h1).padStart(8) + '% |', (pc(r.h8) + '%').padStart(8), ' |', r.n, `  (розкид зерен: loss ${r.lossSpread.toFixed(3)}, B8 ${(r.h8spread * 100).toFixed(1)} п.п.)`);

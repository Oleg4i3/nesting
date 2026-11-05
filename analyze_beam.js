const fs = require('fs');
const rows = [];
for (const f of ['results/beam_part0.jsonl', 'results/beam_part1.jsonl']) for (const l of fs.readFileSync(f, 'utf8').trim().split('\n')) rows.push(JSON.parse(l));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length, sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const se = a => sd(a) / Math.sqrt(a.length);
const pc = x => (x * 100).toFixed(1).padStart(5);
console.log(`Пазлів: ${rows.length}, деталей ${Math.min(...rows.map(r => r.pieces))}–${Math.max(...rows.map(r => r.pieces))}`);
console.log(`еталон ${pc(mean(rows.map(r => r.planted)))}% | жадібна (старий солвер, 1 прохід) ${pc(mean(rows.map(r => r.greedy)))}% ±${(se(rows.map(r => r.greedy)) * 100).toFixed(1)} (${mean(rows.map(r => r.greedyMs)).toFixed(0)} мс) | best-of-20 ${pc(mean(rows.map(r => r.greedy20)))}% (${mean(rows.map(r => r.greedy20Ms)).toFixed(0)} мс)\n`);
const keys = Object.keys(rows[0].res), WIDTHS = [1, 2, 4, 8, 16, 32];
console.log('скорер | ранжування        |' + WIDTHS.map(b => ('B=' + b).padStart(14)).join(' |'));
for (const sn of ['лінійний', 'мережа(стара)']) for (const rank of ['waste', 'logp']) {
  const cells = WIDTHS.map(B => { const e = rows.map(r => r.res[`${sn}|${rank}|${B}`].eff), t = mean(rows.map(r => r.res[`${sn}|${rank}|${B}`].ms)); return `${pc(mean(e))}±${(se(e) * 100).toFixed(1)} ${(t / 1000).toFixed(1)}с`.padStart(14); });
  console.log(sn.padEnd(13), rank.padEnd(7), '|', cells.join(' |'));
}
// парні різниці відносно B=1 і відносно best-of-20 / жадібної
console.log('\nПарна різниця (п.п.) відносно B=1 того ж скорера і ранжування, середнє ± SE, частка пазлів із виграшем:');
for (const sn of ['лінійний', 'мережа(стара)']) for (const rank of ['waste', 'logp']) {
  const line = WIDTHS.slice(1).map(B => { const d = rows.map(r => r.res[`${sn}|${rank}|${B}`].eff - r.res[`${sn}|${rank}|1`].eff); const w = d.filter(x => x > 1e-9).length; return `B=${B}: ${(mean(d) * 100).toFixed(1)}±${(se(d) * 100).toFixed(1)} (${w}/${d.length})`; });
  console.log(sn.padEnd(13), rank.padEnd(6), line.join(' | '));
}
console.log('\nПарна різниця до жадібного старого солвера (1 прохід), п.п.:');
for (const sn of ['лінійний', 'мережа(стара)']) for (const rank of ['waste', 'logp']) {
  const line = [1, 4, 16, 32].map(B => { const d = rows.map(r => r.res[`${sn}|${rank}|${B}`].eff - r.greedy); return `B=${B}: ${(mean(d) * 100).toFixed(1)}±${(se(d) * 100).toFixed(1)}`; });
  console.log(sn.padEnd(13), rank.padEnd(6), line.join(' | '));
}
// найкраще з усіх у кожному пазлі (оракул) - верхня межа "чого можна домогтися" з цих скорерів
const bestAny = rows.map(r => Math.max(...keys.map(k => r.res[k].eff)));
console.log('\nОракул (найкраща з усіх 48 конфігурацій на кожному пазлі):', pc(mean(bestAny)) + '%');
// за правилами
console.log('\nЗа правилами (B=1 → B=16, мережа logp / лінійний waste):');
for (const [nm, f] of [['none', r => r.rules.rotations === 'none'], ['half', r => r.rules.rotations === 'half'], ['any', r => r.rules.rotations === 'any']]) {
  const rs = rows.filter(f); if (!rs.length) continue;
  const g = (sn, rk, B) => mean(rs.map(r => r.res[`${sn}|${rk}|${B}`].eff));
  console.log(nm.padEnd(5), `n=${rs.length}`, '| жадібна', pc(mean(rs.map(r => r.greedy))), '| лінійний waste', pc(g('лінійний', 'waste', 1)), '→', pc(g('лінійний', 'waste', 16)), '| мережа logp', pc(g('мережа(стара)', 'logp', 1)), '→', pc(g('мережа(стара)', 'logp', 16)));
}

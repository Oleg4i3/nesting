const fs = require('fs');
const rows = []; for (const f of fs.readdirSync('results').filter(f => /^final_part\d+\.jsonl$/.test(f))) for (const l of fs.readFileSync('results/' + f, 'utf8').trim().split('\n').filter(Boolean)) rows.push(JSON.parse(l));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length, se = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length); };
const pc = x => (x * 100).toFixed(1);
console.log(`Пазлів: ${rows.length}. еталон ${pc(mean(rows.map(r => r.planted)))}%, жадібна (старий солвер, 1 прохід) ${pc(mean(rows.map(r => r.greedy)))}% ±${pc(se(rows.map(r => r.greedy)))}\n`);
const names = [...new Set(Object.keys(rows[0].res).map(k => k.split('|')[0]))], W = [1, 4, 16, 64];
console.log('скорер'.padEnd(34) + W.map(b => ('B=' + b).padStart(16)).join(''));
for (const n of names) console.log(n.padEnd(34) + W.map(B => { const e = rows.map(r => r.res[`${n}|${B}`].eff), t = mean(rows.map(r => r.res[`${n}|${B}`].ms)); return `${pc(mean(e))}±${pc(se(e))} ${(t / 1000).toFixed(1)}с`.padStart(16); }).join(''));
console.log('\nПарна різниця проти жадібного старого солвера (п.п., середнє ± SE, виграшів із N):');
for (const n of names) console.log(n.padEnd(34) + W.map(B => { const d = rows.map(r => r.res[`${n}|${B}`].eff - r.greedy); return `${(mean(d) * 100).toFixed(1)}±${pc(se(d))} (${d.filter(x => x > 0).length}/${d.length})`.padStart(20); }).join(''));
const ref = names.find(n => n.startsWith('евристика'));
console.log('\nПарна різниця проти евристики з тим самим променем (п.п.):');
for (const n of names) if (n !== ref) console.log(n.padEnd(34) + W.map(B => { const d = rows.map(r => r.res[`${n}|${B}`].eff - r.res[`${ref}|${B}`].eff); return `${(mean(d) * 100).toFixed(1)}±${pc(se(d))}`.padStart(16); }).join(''));
// незалежна перевірка ефективності
let maxDiff = 0; rows.forEach(r => Object.entries(r.res).forEach(([k, v]) => { if (v.effIndep !== undefined) maxDiff = Math.max(maxDiff, Math.abs(v.effIndep - v.eff)); }));
console.log('\nМакс. розбіжність ефективності солвера та незалежної перевірки evaluateLayout:', (maxDiff * 100).toFixed(2), 'п.п. (усі розкладки валідні, інакше скрипт би зупинився)');
const rules = k => rows.filter(r => r.rules.rotations === k);
console.log('\nЗа правилами (B=1 → B=64) для [16,16] tanh, евристика, жадібна:');
for (const k of ['none', 'half', 'any']) { const rs = rules(k); if (!rs.length) continue; console.log(k.padEnd(5), 'n=' + rs.length, '| жадібна', pc(mean(rs.map(r => r.greedy))), '| евристика B64', pc(mean(rs.map(r => r.res['евристика (порядок за площею)|64'].eff))), '| [16,16] B1', pc(mean(rs.map(r => r.res['[16,16] tanh|1'].eff))), 'B64', pc(mean(rs.map(r => r.res['[16,16] tanh|64'].eff)))); }

const fs=require('fs');const rows=[];const tag=process.argv[2]||'ew';
for(const f of fs.readdirSync('results').filter(f=>f.startsWith(tag+'_part')))for(const l of fs.readFileSync('results/'+f,'utf8').trim().split('\n').filter(Boolean))rows.push(JSON.parse(l));
const m=a=>a.reduce((s,x)=>s+x,0)/a.length,se=a=>Math.sqrt(a.reduce((s,x)=>s+(x-m(a))**2,0)/(a.length-1)/a.length);
const keys=Object.keys(rows[0].res);
console.log('n =',rows.length,'  еталон',(m(rows.map(r=>r.planted))*100).toFixed(1),' жадібний',(m(rows.map(r=>r.greedy))*100).toFixed(1));
const bl=r=>Math.max(r.res['BL перебір'].eff,r.res['BL відпал'].eff);
console.log('BL*'.padEnd(26),(m(rows.map(bl))*100).toFixed(1));
for(const k of keys){const a=rows.map(r=>r.res[k].eff),d=rows.map(r=>r.res[k].eff-bl(r));console.log(k.padEnd(26),(m(a)*100).toFixed(1),'±',(se(a)*100).toFixed(1),'  мін. час',(m(rows.map(r=>r.res[k].ms))/1000).toFixed(1)+'с','  відн. BL*',(m(d)*100).toFixed(1),'±',(se(d)*100).toFixed(1),' перемог',d.filter(x=>x>0).length+'/'+rows.length)}

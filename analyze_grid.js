const fs=require('fs');const rows=[];
for(const f of fs.readdirSync('results').filter(f=>/^grid_part/.test(f)))for(const l of fs.readFileSync('results/'+f,'utf8').trim().split('\n').filter(Boolean))rows.push(JSON.parse(l));
const m=a=>a.reduce((s,x)=>s+x,0)/a.length, se=a=>a.length<2?0:Math.sqrt(a.reduce((s,x)=>s+(x-m(a))**2,0)/(a.length-1)/a.length);
const bl=r=>Math.max(r.res['BL перебір'].eff,r.res['BL відпал'].eff);
const net=r=>r.res['мережа B=64'].eff;
const f=(a)=>(m(a)*100).toFixed(1).padStart(5);
const groups={};
for(const r of rows){for(const k of [r.width+' | '+r.profile,'W='+r.width,r.profile,'rules='+r.rules.rotations+(r.rules.mirror?'+m':''),'ALL'])(groups[k]??=[]).push(r)}
console.log('група'.padEnd(42),'n  планта  жад  BL*   мережа16 мережа64  різниця(64−BL*) ±SE  перемог');
for(const k of Object.keys(groups).sort()){const g=groups[k],d=g.map(r=>net(r)-bl(r));
 console.log(k.padEnd(42),String(g.length).padStart(2),f(g.map(r=>r.planted)),f(g.map(r=>r.greedy)),f(g.map(bl)),'  ',f(g.map(r=>r.res['мережа B=16'].eff)),'  ',f(g.map(net)),'     ',(m(d)*100).toFixed(1).padStart(5),'±',(se(d)*100).toFixed(1),' ',d.filter(x=>x>0).length+'/'+g.length)}

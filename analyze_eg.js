const fs=require('fs');const rows=[];
for(const f of fs.readdirSync('results').filter(f=>f.startsWith(''+(process.argv[2]||'eg')+'_part')))for(const l of fs.readFileSync('results/'+f,'utf8').trim().split('\n').filter(Boolean))rows.push(JSON.parse(l));
const m=a=>a.reduce((s,x)=>s+x,0)/a.length,se=a=>a.length<2?0:Math.sqrt(a.reduce((s,x)=>s+(x-m(a))**2,0)/(a.length-1)/a.length);
const ref=r=>Math.max(...Object.entries(r.res).filter(([k,v])=>v.eff!=null).map(([k,v])=>v.eff));
const bl=r=>Math.max(r.res['BL перебір'].eff??0,r.res['BL відпал'].eff??0);
console.log('n =',rows.length,' найкраще відоме (ref):',(m(rows.map(ref))*100).toFixed(1));
for(const k of Object.keys(rows[0].res)){const ok=rows.filter(r=>r.res[k].eff!=null);const a=ok.map(r=>r.res[k].eff),d=ok.map(r=>r.res[k].eff-ref(r)),db=ok.map(r=>r.res[k].eff-bl(r));
 console.log(k.padEnd(26),'розміщено повністю',ok.length+'/'+rows.length,' ефект.',(m(a)*100).toFixed(1),'±',(se(a)*100).toFixed(1),' до ref',(m(d)*100).toFixed(1),' vs BL*',(m(db)*100).toFixed(1),'±',(se(db)*100).toFixed(1),' перемог',db.filter(x=>x>0).length+'/'+ok.length,' час',(m(ok.map(r=>r.res[k].ms))/1000).toFixed(1)+'с')}

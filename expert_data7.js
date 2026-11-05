// Дані для довільних кутів. Вчитель = найкраща з {BL-відпал, LNS+BL} (ті самі правила з кутами); LNS-розкладка
// відновлюється в послідовність дій BL (кожен крок = перше нижнє-ліве місце вибраного варіанта).
// node expert_data7.js <ч> <частин> <тег> [N_train=300] [msSA=8000] [msLNS=20000] [rot=deg15]
const fs=require('fs'),Fe=require('./features.js'),N=require('./raster.js'),B=require('./baselines.js'),G=require('./garment.js'),Gd=require('./guided.js'),L=require('./lns2.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'a1',NT=+process.argv[5]||300,MSA=+process.argv[6]||8000,MLN=+process.argv[7]||20000,ROT=process.argv[8]||'deg15';
const NF=Fe.NF,rules={rotations:ROT,mirror:false};
const jobs=[];for(let i=1;i<=NT;i++)jobs.push({split:'train',seed:400000+i});for(let i=1;i<=24;i++)jobs.push({split:'val',seed:410000+i});
const meta=[],chunks=[];let offset=0,n=0,full=0,partial=0,steps=0;const wins={};const t0=Date.now();
jobs.forEach((j,ji)=>{
  if(ji%parts!==part)return;const g=G.generate(j.seed,{rules:{rotations:'any',mirror:false}}),pcs=g.pieces,width=g.width;
  const cand=[];
  {const q=B.solveBLSA(pcs,rules,{width,budgetMs:MSA,seed:j.seed});if(q.placed===pcs.length){const gd=new Gd.Guided(pcs,rules,width),vs=gd.vars;
    const lay=q.placements.map((p,i)=>{const vi=vs[i].findIndex(v=>v.rot===p.rot&&v.mirror===p.mirror),v=vs[i][vi];return{vi,A:v.x0+p.px/N.CELL,cy:v.y0+p.py/N.CELL}});cand.push({src:'S',eff:q.efficiency,lay})}}
  {const q=L.solveLNS(pcs,rules,{width,budgetMs:MLN,seed:j.seed,recreate:'BL',kMin:6,kMax:14,T0:0.6});cand.push({src:'L',eff:q.efficiency,lay:q.layout})}
  cand.sort((a,b)=>b.eff-a.eff);const best=cand[0];wins[best.src]=(wins[best.src]||0)+1;
  const gd=new Gd.Guided(pcs,rules,width),st=gd.start();let ok=true;
  while(st.rem.length){
    const acts=gd.actions(st);let pick=-1;
    for(let k=0;k<acts.length;k++){const a=acts[k],t=best.lay[a.pi];if(t&&a.vi===t.vi&&a.A===t.A&&a.cy===t.cy&&(pick<0||a.cy<acts[pick].cy||(a.cy===acts[pick].cy&&a.A<acts[pick].A)))pick=k}
    steps++;if(pick<0){ok=false;break}
    const F=new Float32Array(acts.length*NF);gd.features(st,acts,F);
    meta.push({split:j.split,kind:'a',seed:j.seed,count:acts.length,pos:[pick],offset});chunks.push(Buffer.from(F.buffer));offset+=acts.length*NF;gd.place(st,acts[pick])}
  ok?full++:partial++;n++;
  if(n%10===0)console.log(`[${part}] ${n} задач, зразків ${meta.length}, повних ${full}/неповних ${partial}; перемоги ${JSON.stringify(wins)}; ${((Date.now()-t0)/1000).toFixed(0)}с`)});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`,Buffer.concat(chunks));fs.writeFileSync(`data/expert_${tag}_p${part}.json`,JSON.stringify({NF,meta,n,full,partial,wins}));
console.log(`[${part}] готово ${n} задач, ${meta.length} зразків, повних ${full}, неповних ${partial}`);

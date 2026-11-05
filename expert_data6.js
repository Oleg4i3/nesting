// Ітерація експерта. Вчитель = краща розкладка з {BL-відпал, BL-перебір, guided-мережа (стара, з ознаками щілин)}.
// Задачі: викрійки, пазли з відходами, щільні пазли (hard20). Ознаки швидкі (без щілин).
// node expert_data6.js <ч> <частин> <тег> [N_garm=400] [N_waste=200] [N_dense=100] [msSA=6000] [msG=8000]
const fs=require('fs'),Fe=require('./features.js'),N=require('./raster.js'),C=require('./common.js'),B=require('./baselines.js'),G=require('./garment.js'),Gd=require('./guided.js'),X=require('./nnx.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'e1',NG=+process.argv[5]||400,NW=+process.argv[6]||200,ND=+process.argv[7]||100,MSA=+process.argv[8]||6000,MSG=+process.argv[9]||8000;
const NF=Fe.NF,RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const old=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/o1big.json','utf8')));
const jobs=[];
for(let i=1;i<=NG;i++)jobs.push({split:'train',kind:'g',seed:400000+i,k:i});
for(let i=1;i<=NW;i++)jobs.push({split:'train',kind:'w',seed:200000+i,big:i%2});
for(let i=1;i<=ND;i++)jobs.push({split:'train',kind:'d',seed:100000+i});
for(let i=1;i<=24;i++)jobs.push({split:'val',kind:'g',seed:410000+i,k:i});
for(let i=1;i<=24;i++)jobs.push({split:'val',kind:'w',seed:210000+i,big:i%2});
for(let i=1;i<=12;i++)jobs.push({split:'val',kind:'d',seed:97000+i});
// перемішати порядок завдань, щоб частини були рівними за вагою
const meta=[],chunks=[];let offset=0,n=0,miss=0,steps=0;const wins={},sum={},cnt={};const t0=Date.now();
jobs.forEach((j,ji)=>{
  if(ji%parts!==part)return;let pcs,rules,width;
  try{if(j.kind==='w'){const pz=C.makePuzzle(C.randomSpecWaste(j.seed,j.big));pcs=pz.pieces;rules=pz.rules;width=pz.width}
      else if(j.kind==='d'){const pz=C.makePuzzle(C.randomSpecHard20(j.seed));pcs=pz.pieces;rules=pz.rules;width=pz.width}
      else{const g=G.generate(j.seed,{rules:RULES[j.k%3]});pcs=g.pieces;rules=g.rules;width=g.width}}catch(e){return}
  const cand=[];
  {const q=B.solveBLSA(pcs,rules,{width,budgetMs:MSA,seed:j.seed});if(q.placed===pcs.length)cand.push({src:'S',eff:q.efficiency,order:q.order,vsel:q.vsel})}
  {const q=B.solveBLMulti(pcs,rules,{width,budgetMs:2000,seed:j.seed});if(q.placed===pcs.length)cand.push({src:'L',eff:q.efficiency,order:q.order,vsel:q.vsel})}
  {const q=Gd.solveGuided(pcs,rules,old,{width,budgetMs:MSG,temp:0.3,seed:j.seed,slit:true});if(q.placed===pcs.length){const vsel=new Array(pcs.length).fill(0);q.seq.forEach(s=>{vsel[s.pi]=s.vi});cand.push({src:'N',eff:q.efficiency,order:q.seq.map(s=>s.pi),vsel})}}
  if(!cand.length)return;
  cand.sort((a,b)=>b.eff-a.eff);const best=cand[0];wins[j.kind+best.src]=(wins[j.kind+best.src]||0)+1;
  for(const c of cand){sum[j.kind+c.src]=(sum[j.kind+c.src]||0)+c.eff;cnt[j.kind+c.src]=(cnt[j.kind+c.src]||0)+1}
  const gd=new Gd.Guided(pcs,rules,width),st=gd.start();
  for(const pi of best.order){
    if(!st.rem.includes(pi))continue;const cands=gd.actions(st),k=cands.findIndex(c=>c.pi===pi&&c.vi===best.vsel[pi]);steps++;
    if(k<0){miss++;break}
    const F=new Float32Array(cands.length*NF);gd.features(st,cands,F);
    meta.push({split:j.split,kind:j.kind,seed:j.seed,count:cands.length,pos:[k],offset});chunks.push(Buffer.from(F.buffer));offset+=cands.length*NF;gd.place(st,cands[k])}
  n++;if(n%20===0)console.log(`[${part}] ${n} задач, зразків ${meta.length}, пропусків ${miss}/${steps}; перемоги ${JSON.stringify(wins)}; ${((Date.now()-t0)/1000).toFixed(0)}с`)});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`,Buffer.concat(chunks));
fs.writeFileSync(`data/expert_${tag}_p${part}.json`,JSON.stringify({NF,meta,n,miss,wins,eff:Object.fromEntries(Object.keys(sum).map(k=>[k,sum[k]/cnt[k]]))}));
console.log(`[${part}] готово ${n} задач, ${meta.length} зразків, пропусків ${miss}/${steps}; сер. ефект. ${JSON.stringify(Object.fromEntries(Object.keys(sum).map(k=>[k,+(sum[k]/cnt[k]*100).toFixed(1)])))}`);

// Дані для політики «порядок+варіант» поверх BL. Вчитель = краща з BL-перебору та BL-відпалу (їх order/vsel).
// Кожен крок: усі пари (деталь,варіант) з BL-позиціями; позитив = пара вчителя. node expert_data5.js <ч> <частин> <тег> [N_waste=240] [N_garm=240] [BLms=3000]
const fs=require('fs'),Fe=require('./features.js'),N=require('./raster.js'),C=require('./common.js'),B=require('./baselines.js'),G=require('./garment.js'),Gd=require('./guided.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'o1',NW=+process.argv[5]||240,NG=+process.argv[6]||240,BLMS=+process.argv[7]||3000;
const NF=Fe.NF,RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const jobs=[];
for(let i=1;i<=NW;i++)jobs.push({split:'train',kind:'w',seed:200000+i,big:i%2});
for(let i=1;i<=NG;i++)jobs.push({split:'train',kind:'g',seed:400000+i,k:i});
for(let i=1;i<=24;i++)jobs.push({split:'val',kind:'w',seed:210000+i,big:i%2});
for(let i=1;i<=24;i++)jobs.push({split:'val',kind:'g',seed:410000+i,k:i});
const meta=[],chunks=[];let offset=0,n=0,miss=0,steps=0,effSum=0;const t0=Date.now();
jobs.forEach((j,ji)=>{
  if(ji%parts!==part)return;let pcs,rules,width;
  try{if(j.kind==='w'){const pz=C.makePuzzle(C.randomSpecWaste(j.seed,j.big));pcs=pz.pieces;rules=pz.rules;width=pz.width}
      else{const g=G.generate(j.seed,{rules:RULES[j.k%3]});pcs=g.pieces;rules=g.rules;width=g.width}}catch(e){return}
  let best=null;
  for(const fn of [B.solveBLMulti,B.solveBLSA]){const q=fn(pcs,rules,{width,budgetMs:BLMS,seed:j.seed});if(q.placed===pcs.length&&(!best||q.efficiency>best.efficiency))best=q}
  if(!best)return;
  const Gd1=new Gd.Guided(pcs,rules,width),st=Gd1.start();
  for(const pi of best.order){
    if(!st.rem.includes(pi))continue;
    const cands=Gd1.actions(st),k=cands.findIndex(c=>c.pi===pi&&c.vi===best.vsel[pi]);steps++;
    if(k<0){miss++;break}
    const F=new Float32Array(cands.length*NF);Gd1.features(st,cands,F);
    meta.push({split:j.split,kind:j.kind,seed:j.seed,count:cands.length,pos:[k],offset});chunks.push(Buffer.from(F.buffer));offset+=cands.length*NF;
    Gd1.place(st,cands[k])}
  effSum+=best.efficiency;n++;
  if(n%20===0)console.log(`[${part}] ${n} задач, зразків ${meta.length}, пропусків ${miss}/${steps}, сер. ефект. вчителя ${(effSum/n*100).toFixed(1)}, ${((Date.now()-t0)/1000).toFixed(0)}с`)});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`,Buffer.concat(chunks));fs.writeFileSync(`data/expert_${tag}_p${part}.json`,JSON.stringify({NF,meta,n,miss}));
console.log(`[${part}] готово ${n} задач, ${meta.length} зразків, пропусків ${miss}/${steps}`);

// Пазли етапів 1–2 (кути 15°): мережа (beam B=16, ваги r3a), BL-відпал, LNS + BL і гібрид «мережа → LNS» за однакового бюджету.
// Ті самі задачі (зерна), що в results/er_r2m_part*.jsonl. node er_hyb.js <ч> <частин> [ms=15000]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Bm=require('./beam.js'),B=require('./baselines.js'),L=require('./lns2.js'),C=require('./common.js'),Z=require('./zones.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,ms=+process.argv[4]||15000,K=1000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/r3a.json','utf8')));
const jobs=[];for(const f of fs.readdirSync('results').filter(f=>/^er_r2m_part\d+\.jsonl$/.test(f)))for(const l of fs.readFileSync('results/'+f,'utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(l);jobs.push({seed:r.seed,st:r.stage,big:r.big})}
jobs.sort((a,b)=>a.seed-b.seed);
const outF=`results/er3_part${part}.jsonl`,done=new Set();if(fs.existsSync(outF))for(const l of fs.readFileSync(outF,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(outF,'a');
jobs.forEach((j,ji)=>{if(ji%parts!==part||done.has(j.seed))return;let pz;try{pz=C.makePuzzle(C.randomSpecAng(j.seed,j.st,j.big))}catch(e){return}
  const pcs=pz.pieces,W=pz.width,rules=pz.rules,bl=pz.blocked||[],row={seed:j.seed,stage:j.st,big:j.big,pieces:pcs.length,planted:pz.meta.plantedEfficiency,plantedLen:pz.meta.plantedLength,res:{}};
  const chk=(nm,r,t0)=>{let eff=null,len=null;if(r.placements.filter(Boolean).length===pcs.length){const e=Z.evaluateWithZones(pcs,r.placements,bl,W);if(e.valid){eff=e.efficiency;len=e.len}}row.res[nm]={eff,len,ms:Date.now()-t0}};
  const o={width:W,maxLength:4000,seed:j.seed,blocked:bl};
  let t0=Date.now();const bm=Bm.solveBeam(pcs,rules,net,{width:W,maxLength:4000,beam:16,rank:'logp',K,noSlit:true,blocked:bl});chk('мережа beam B=16',bm,t0);const tb=Date.now()-t0;
  t0=Date.now();chk('BL відпал',B.solveBLSA(pcs,rules,{...o,budgetMs:ms}),t0);
  t0=Date.now();chk('LNS + BL',L.solveLNS(pcs,rules,{...o,budgetMs:ms,recreate:'BL',kMin:6,kMax:14,T0:0.6}),t0);
  t0=Date.now();try{const init=new Array(pcs.length).fill(null);bm.seq.forEach(s=>{init[s.pi]={vi:s.vi,A:s.A,cy:s.cy}});
    const r=L.solveLNS(pcs,rules,{...o,budgetMs:Math.max(1000,ms-tb),recreate:'BL',kMin:4,kMax:10,T0:0.25,init});chk('гібрид: мережа→LNS',r,t0);row.res['гібрид: мережа→LNS'].ms+=tb}catch(e){row.res['гібрид: мережа→LNS']={eff:null}}
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${j.seed} ст.${j.st}${j.big?'b':''} n=${pcs.length} еталон ${(row.planted*100).toFixed(0)} `+Object.entries(row.res).map(([k,v])=>k+' '+(v.eff==null?'—':(v.eff*100).toFixed(1))).join(' | '))});

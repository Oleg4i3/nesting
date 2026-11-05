// Пазли з відходами (seed 220001+), рівний час. node eval_waste2.js <ч> <частин> <тег> [N=24] [ms=15000]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),B=require('./baselines.js'),Gd=require('./guided.js'),L=require('./lns2.js'),C=require('./common.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'ew3',NP=+process.argv[5]||24,ms=+process.argv[6]||15000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/e1big.json','utf8')));
const outF=`results/${tag}_part${part}.jsonl`,done=new Set();if(fs.existsSync(outF))for(const l of fs.readFileSync(outF,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(outF,'a');
for(let i=0;i<NP;i++){const seed=220001+i;if(i%parts!==part||done.has(seed))continue;const pz=C.makePuzzle(C.randomSpecWaste(seed,i%2)),pcs=pz.pieces,W=pz.width,rules=pz.rules;
  const row={seed,pieces:pcs.length,planted:pz.meta.plantedEfficiency,res:{}};
  const t=(nm,fn)=>{const t0=Date.now(),r=fn();let eff=null;if(r.placements.filter(Boolean).length===pcs.length){const e=N.evaluateLayout(P.placementsToPolys(pcs,r.placements),{width:W,height:4000,rollWidth:W});if(e.valid)eff=e.efficiency}row.res[nm]={eff,ms:Date.now()-t0}};
  t('жадібний (старий)',()=>P.solveGreedy(pcs,rules,{width:W,maxLength:4000}));
  t('BL перебір',()=>B.solveBLMulti(pcs,rules,{width:W,budgetMs:ms,seed}));
  t('BL відпал',()=>B.solveBLSA(pcs,rules,{width:W,budgetMs:ms,seed}));
  t('мережа: вибірка',()=>Gd.solveGuided(pcs,rules,net,{width:W,budgetMs:ms,temp:0.5,seed}));
  t('LNS + BL',()=>L.solveLNS(pcs,rules,{width:W,budgetMs:ms,seed,recreate:'BL',kMin:6,kMax:14,T0:0.6}));
  t('LNS + мережа',()=>L.solveLNS(pcs,rules,{width:W,budgetMs:ms,seed,recreate:'GUIDED',net,temp:0.5,kMin:4,kMax:10,T0:0.6}));
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed} еталон ${(row.planted*100).toFixed(0)} `+Object.entries(row.res).map(([k,v])=>k+' '+(v.eff==null?'—':(v.eff*100).toFixed(1))).join(' | '))}

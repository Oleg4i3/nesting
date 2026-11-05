// node base_study.js <part> <parts> [budgetMs=9000]  → results/base_part<k>.jsonl
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),B=require('./baselines.js');
const {randomSpecHard20,makePuzzle}=require('./common.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,budgetMs=+process.argv[4]||9000;
const out=`results/base_part${part}.jsonl`,done=new Set();
if(fs.existsSync(out))for(const l of fs.readFileSync(out,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(out,'a');
const S={'BL: перебір порядків':B.solveBLMulti,'BL + відпал':B.solveBLSA,'жадібний + перезапуски':B.solveGreedyRestarts};
for(let i=0;i<20;i++){
  if(i%parts!==part)continue; const seed=95001+i; if(done.has(seed))continue;
  const pz=makePuzzle(randomSpecHard20(seed)),row={seed,pieces:pz.pieces.length,planted:pz.meta.plantedEfficiency,res:{}};
  for(const [nm,fn] of Object.entries(S)){
    const t=Date.now(),r=fn(pz.pieces,pz.rules,{width:pz.width,budgetMs,seed});
    const ev=N.evaluateLayout(P.placementsToPolys(pz.pieces,r.placements),{width:pz.width,height:4000,rollWidth:pz.width});
    if(!ev.valid||r.placements.filter(Boolean).length!==pz.pieces.length)throw new Error('недійсна '+nm+' '+seed);
    row.res[nm]={eff:ev.efficiency,ms:Date.now()-t,iters:r.iters};
  }
  fs.writeSync(fd,JSON.stringify(row)+'\n'); console.log(`[${part}] seed ${seed}`,Object.entries(row.res).map(([k,v])=>(v.eff*100).toFixed(1)).join(' '));
}

// node eval_waste.js <частина> <частин> <тег> [N=24] [blMs=15000]  — тест на нових пазлах з відходами (seed 220001+)
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Bm=require('./beam.js'),B=require('./baselines.js'),C=require('./common.js'),Fe=require('./features.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'ew',NP=+process.argv[5]||24,blMs=+process.argv[6]||15000;
const ld=f=>X.MLPX.fromJSON(JSON.parse(fs.readFileSync(f,'utf8')));
const nets={};for(const a of process.argv.slice(7)){const [nm,f]=a.split('=');nets[nm]=ld(f)}
const out=`results/${tag}_part${part}.jsonl`,done=new Set();
if(fs.existsSync(out))for(const l of fs.readFileSync(out,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(out,'a');
for(let i=0;i<NP;i++){
  const seed=220001+i;if(i%parts!==part||done.has(seed))continue;
  const pz=C.makePuzzle(C.randomSpecWaste(seed,i%2));
  const chk=(nm,r)=>{const ev=N.evaluateLayout(P.placementsToPolys(pz.pieces,r.placements),{width:pz.width,height:4000,rollWidth:pz.width});
    if(!ev.valid||r.placements.filter(Boolean).length!==pz.pieces.length)throw new Error('недійсна '+nm+' '+seed);return ev.efficiency};
  const row={seed,pieces:pz.pieces.length,width:pz.width,planted:pz.meta.plantedEfficiency,big:i%2,res:{}};
  row.greedy=P.solveGreedy(pz.pieces,pz.rules,{width:pz.width,maxLength:4000}).efficiency;
  for(const [nm,net] of Object.entries(nets))for(const b of [1,16,64]){
    const t=Date.now(),r=b===1?Fe.solveNN(pz.pieces,pz.rules,net,{width:pz.width,maxLength:4000}):Bm.solveBeam(pz.pieces,pz.rules,net,{width:pz.width,maxLength:4000,beam:b,rank:'logp'});
    row.res[`${nm}|${b}`]={eff:chk(nm,r),ms:Date.now()-t}}
  {const t=Date.now(),r=B.solveBLMulti(pz.pieces,pz.rules,{width:pz.width,budgetMs:blMs,seed});row.res['BL перебір']={eff:chk('bl',r),ms:Date.now()-t}}
  {const t=Date.now(),r=B.solveBLSA(pz.pieces,pz.rules,{width:pz.width,budgetMs:blMs,seed});row.res['BL відпал']={eff:chk('sa',r),ms:Date.now()-t}}
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed} еталон ${(row.planted*100).toFixed(0)} `+[...Object.keys(nets).map(k=>k+'|64'),'BL перебір','BL відпал'].map(k=>(row.res[k].eff*100).toFixed(1)).join(' '))}

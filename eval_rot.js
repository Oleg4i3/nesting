// Пазли з довільними кутами: мережа (beam) проти BL/LNS. node eval_rot.js <ч> <частин> <тег> <net.json> [N_each=10] [ms=20000] [K=1000]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Bm=require('./beam.js'),B=require('./baselines.js'),L=require('./lns2.js'),C=require('./common.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'er',netf=process.argv[5]||'weights/v2/r1big.json',NE=+process.argv[6]||10,ms=+process.argv[7]||20000,K=+process.argv[8]||1000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync(netf,'utf8')));
const jobs=[];for(const [st,big,s0] of [[1,0,700000],[1,1,701000],[2,0,702000],[2,1,703000]])for(let i=1;i<=NE;i++)jobs.push({st,big,seed:s0+i});
const outF=`results/${tag}_part${part}.jsonl`,done=new Set();if(fs.existsSync(outF))for(const l of fs.readFileSync(outF,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(outF,'a');
jobs.forEach((j,ji)=>{if(ji%parts!==part||done.has(j.seed))return;let pz;try{pz=C.makePuzzle(C.randomSpecAng(j.seed,j.st,j.big))}catch(e){return}
  const pcs=pz.pieces,W=pz.width,rules=pz.rules,row={seed:j.seed,stage:j.st,big:j.big,pieces:pcs.length,planted:pz.meta.plantedEfficiency,plantedLen:pz.meta.plantedLength,res:{}};
  const t=(nm,fn)=>{const t0=Date.now(),r=fn();let eff=null,len=null;if(r.placements.filter(Boolean).length===pcs.length){const e=N.evaluateLayout(P.placementsToPolys(pcs,r.placements),{width:W,height:4000,rollWidth:W});if(e.valid){eff=e.efficiency;len=e.extent.length}}row.res[nm]={eff,len,ms:Date.now()-t0}};
  for(const b of [4,16])t('мережа beam B='+b,()=>Bm.solveBeam(pcs,rules,net,{width:W,maxLength:4000,beam:b,rank:'logp',K,noSlit:true}));
  const o={width:W,maxLength:4000,budgetMs:ms,seed:j.seed};
  t('BL відпал',()=>B.solveBLSA(pcs,rules,o));
  t('LNS + BL',()=>L.solveLNS(pcs,rules,{...o,recreate:'BL',kMin:6,kMax:14,T0:0.6}));
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${j.seed} ст.${j.st}${j.big?'b':''} n=${pcs.length} еталон ${(row.planted*100).toFixed(0)} `+Object.entries(row.res).map(([k,v])=>k+' '+(v.eff==null?'—':(v.eff*100).toFixed(1))+' ('+(v.ms/1000).toFixed(0)+'с)').join(' | '))});

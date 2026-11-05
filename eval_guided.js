// node eval_guided.js <ч> <частин> <тег> [N=20] [ms=15000]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Gd=require('./guided.js'),G=require('./garment.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'eo',NP=+process.argv[5]||20,ms=+process.argv[6]||15000;
const ld=f=>X.MLPX.fromJSON(JSON.parse(fs.readFileSync(f,'utf8')));const nets={};for(const a of process.argv.slice(7)){const [nm,f]=a.split('=');nets[nm]=ld(f)}
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const CFG=Object.keys(nets).flatMap(k=>[[k,0.3],[k,0.5]]);
const fd=fs.openSync(`results/${tag}_part${part}.jsonl`,'a');
for(let i=0;i<NP;i++){if(i%parts!==part)continue;const seed=300001+i,g=G.generate(seed,{rules:RULES[i%3]}),pcs=g.pieces,W=g.width,row={seed,res:{}};
  for(const [nn,T] of CFG){const r=Gd.solveGuided(pcs,g.rules,nets[nn],{width:W,budgetMs:ms,temp:T,seed});
    const e=N.evaluateLayout(P.placementsToPolys(pcs,r.placements),{width:W,height:4000,rollWidth:W});if(!e.valid||r.placed!==pcs.length)throw new Error('недійсна '+seed);
    row.res[`${nn} T${T}`]={eff:e.efficiency,iters:r.iters}}
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed}`,Object.entries(row.res).map(([k,v])=>k+' '+(v.eff*100).toFixed(1)+' ('+v.iters+')').join(' | '))}

// node eval_sampler.js <ч> <частин> <тег> [N=10] [ms=15000]  — стохастична мережа на викрійках
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),S=require('./sampler.js'),G=require('./garment.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'es',NP=+process.argv[5]||10,ms=+process.argv[6]||15000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/g1big.json','utf8')));
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const CFG=[{K:56,temp:0.15},{K:56,temp:0.3},{K:100,temp:0.3}];
const fd=fs.openSync(`results/${tag}_part${part}.jsonl`,'a');
for(let i=0;i<NP;i++){if(i%parts!==part)continue;const seed=300001+i,g=G.generate(seed,{rules:RULES[i%3]}),pcs=g.pieces,W=g.width,row={seed,res:{}};
  for(const c of CFG){const r=S.solveSampled(pcs,g.rules,net,{width:W,budgetMs:ms,seed,...c});
    const e=N.evaluateLayout(P.placementsToPolys(pcs,r.placements),{width:W,height:4000,rollWidth:W});if(!e.valid||r.placed!==pcs.length)throw new Error('недійсна');
    row.res[`K${c.K} T${c.temp}`]={eff:e.efficiency,iters:r.iters}}
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed}`,Object.entries(row.res).map(([k,v])=>k+' '+(v.eff*100).toFixed(1)+' ('+v.iters+')').join(' | '))}

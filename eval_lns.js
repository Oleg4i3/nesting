// node eval_lns.js <ч> <частин> <тег> [N=20] [ms=15000]  — LNS з оператором BL і NET (однаковий час), викрійки
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),L=require('./lns.js'),G=require('./garment.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'el',NP=+process.argv[5]||20,ms=+process.argv[6]||15000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/g1big.json','utf8')));
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const fd=fs.openSync(`results/${tag}_part${part}.jsonl`,'a');
for(let i=0;i<NP;i++){if(i%parts!==part)continue;const seed=300001+i,g=G.generate(seed,{rules:RULES[i%3]}),pcs=g.pieces,W=g.width,row={seed,res:{}};
  for(const [nm,o] of [['LNS-BL',{recreate:'BL'}],['LNS-NET',{recreate:'NET',net,K:56,temp:0.3}]]){
    const r=L.solveLNS(pcs,g.rules,{width:W,budgetMs:ms,seed,...o});
    const e=N.evaluateLayout(P.placementsToPolys(pcs,r.placements),{width:W,height:4000,rollWidth:W});if(!e.valid||Math.abs(e.efficiency-r.efficiency)>0.005)throw new Error('недійсна/розбіжність '+nm+' '+seed+' '+e.efficiency+' '+r.efficiency);
    row.res[nm]={eff:e.efficiency,iters:r.iters,acc:r.accepted}}
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed}`,Object.entries(row.res).map(([k,v])=>k+' '+(v.eff*100).toFixed(1)+' ('+v.iters+'/'+v.acc+')').join(' | '))}

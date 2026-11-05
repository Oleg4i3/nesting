// node eval_lns2.js <ч> <частин> <тег> [N=20] [ms=15000]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),L=require('./lns2.js'),G=require('./garment.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'el2',NP=+process.argv[5]||20,ms=+process.argv[6]||15000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/e1big.json','utf8')));
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const P1={kMin:2,kMax:6,T0:0.6},P2={kMin:2,kMax:4,T0:0.3},P3={kMin:3,kMax:8,T0:0.6};
const CFG=[['BL k2-6',{recreate:'BL',...P1}],['BL k2-4 T.3',{recreate:'BL',...P2}],['BL k3-8',{recreate:'BL',...P3}],
           ['G k2-6',{recreate:'GUIDED',net,temp:0.5,...P1}],['G k2-4 T.3',{recreate:'GUIDED',net,temp:0.5,...P2}],['G k3-8',{recreate:'GUIDED',net,temp:0.5,...P3}]];
const outF=`results/${tag}_part${part}.jsonl`,done=new Set();if(fs.existsSync(outF))for(const l of fs.readFileSync(outF,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(outF,'a');let bad=0;
for(let i=0;i<NP;i++){if(i%parts!==part)continue;const seed=300001+i;if(done.has(seed))continue;const g=G.generate(seed,{rules:RULES[i%3]}),pcs=g.pieces,W=g.width,row={seed,res:{}};
  for(const [nm,o] of CFG){const r=L.solveLNS(pcs,g.rules,{width:W,budgetMs:ms,seed,...o});
    const e=N.evaluateLayout(P.placementsToPolys(pcs,r.placements),{width:W,height:4000,rollWidth:W});const mism=Math.abs(e.efficiency-r.efficiency)>0.005;if(!e.valid||mism){bad++;console.log('УВАГА',nm,seed,'valid',e.valid,'solver',r.efficiency.toFixed(4),'indep',e.efficiency.toFixed(4))}
    row.res[nm]={eff:e.valid?e.efficiency:null,solverEff:r.efficiency,iters:r.iters,valid:e.valid}}
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed}`,Object.entries(row.res).map(([k,v])=>k+' '+(v.eff*100).toFixed(1)).join(' | '))}

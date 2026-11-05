// Налаштування LNS на окремому наборі (seed 500001+). node eval_tune.js <ч> <частин> [N=12] [ms=15000]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),L=require('./lns2.js'),G=require('./garment.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,NP=+process.argv[4]||12,ms=+process.argv[5]||15000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/e1big.json','utf8')));
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const C=[];
for(const [k1,k2,T0,tp] of [[4,10,0.6,0.5],[4,10,0.2,0.5],[4,10,1.5,0.5],[3,7,0.6,0.5],[5,13,0.6,0.5],[4,10,0.6,0.25],[4,10,0.6,1.0]])C.push([`G k${k1}-${k2} T0=${T0} t=${tp}`,{recreate:'GUIDED',net,temp:tp,kMin:k1,kMax:k2,T0}]);
for(const [k1,k2,T0] of [[6,14,0.6],[6,14,0.2],[6,14,1.5],[4,10,0.6],[8,18,0.6]])C.push([`BL k${k1}-${k2} T0=${T0}`,{recreate:'BL',kMin:k1,kMax:k2,T0}]);
const outF=`results/tune_part${part}.jsonl`,done=new Set();if(fs.existsSync(outF))for(const l of fs.readFileSync(outF,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(outF,'a');
for(let i=0;i<NP;i++){if(i%parts!==part)continue;const seed=500001+i;if(done.has(seed))continue;const g=G.generate(seed,{rules:RULES[i%3]}),row={seed,res:{}};
  for(const [nm,o] of C){const r=L.solveLNS(g.pieces,g.rules,{width:g.width,budgetMs:ms,seed,...o});
    const e=N.evaluateLayout(P.placementsToPolys(g.pieces,r.placements),{width:g.width,height:4000,rollWidth:g.width});row.res[nm]=e.valid?e.efficiency:null}
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed} готово`)}

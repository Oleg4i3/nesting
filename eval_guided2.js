const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Gd=require('./guided.js'),G=require('./garment.js');
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/o1big.json','utf8')));
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const part=+process.argv[2]||0,parts=+process.argv[3]||1;const m=a=>a.reduce((s,x)=>s+x,0)/a.length;const out={};
const CFG=[[0.2,1e9,15000],[0.3,1e9,15000],[0.5,100,60000],[0.5,250,60000],[0.5,1000,60000]];
for(let i=0;i<10;i++){if(i%parts!==part)continue;const seed=300001+i,g=G.generate(seed,{rules:RULES[i%3]});
 for(const [T,it,ms] of CFG){const t=Date.now(),r=Gd.solveGuided(g.pieces,g.rules,net,{width:g.width,budgetMs:ms,maxIters:it,temp:T,seed});(out[`T${T} N${it>1e8?'∞(15с)':it}`]??=[]).push([r.efficiency,Date.now()-t])}}
fs.writeFileSync(`results/eo2_part${part}.json`,JSON.stringify(out));

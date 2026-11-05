// Порівняння методів за різної ширини рулона. node width_run.js <suit|набір ESICUP> <множник ширини> <зерно> <мс>
const fs=require('fs'),N=require('./raster.js'),X=require('./nnx.js'),Pf=require('./portfolio.js'),L=require('./lns2.js'),B=require('./baselines.js'),Z=require('./zones.js'),T=require('./rl_tasks.js');
const [id,fStr,seedStr,msStr]=process.argv.slice(2),f=+fStr,seed=+seedStr,ms=+msStr||10000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/r3a.json','utf8')));
const task=T.build({set:id==='suit'?'suit':id,kind:'plain',seed,n:18,rot:'dataset'});
const pcs=task.pcs,W=Math.round(task.W*f),rules=task.rules;
// чи вміщується кожна деталь у рулон хоча б в одній дозволеній орієнтації
const fits=pcs.every(p=>N.makeVariants(p,N.allowedFor(p,rules)).some(v=>v.h*N.CELL<=W||true));
const area=pcs.reduce((s,p)=>s+N.polygonArea(p),0),ev=pl=>{if(!pl||pl.filter(Boolean).length!==pcs.length)return null;const e=Z.evaluateWithZones(pcs,pl,[],W);return e.valid?{dens:area/(W*e.len),len:e.len}:null};
let t0=Date.now();const bm=Pf.solvePortfolio(pcs,rules,net,{width:W,maxLength:8000,blocked:[]});const tb=Date.now()-t0;
const r={set:id,f,W,seed,pieces:pcs.length,net:{...ev(bm.placements),ms:tb,how:bm.how}};
const o={width:W,maxLength:8000,seed,blocked:[]};
t0=Date.now();r.bl={...ev(B.solveBLSA(pcs,rules,{...o,budgetMs:ms}).placements),ms:Date.now()-t0};
t0=Date.now();r.lns={...ev(L.solveLNS(pcs,rules,{...o,budgetMs:ms,recreate:'BL',kMin:6,kMax:14,T0:0.6}).placements),ms:Date.now()-t0};
const init=new Array(pcs.length).fill(null);if(bm.seq)bm.seq.forEach(q=>{init[q.pi]={vi:q.vi,A:q.A,cy:q.cy}});
t0=Date.now();r.hyb={...ev(L.solveLNS(pcs,rules,{...o,budgetMs:Math.max(1000,ms-tb),recreate:'BL',kMin:4,kMax:10,T0:0.25,init}).placements),ms:Date.now()-t0+tb};
fs.mkdirSync('results/width',{recursive:true});fs.writeFileSync(`results/width/${id}_f${f}_s${seed}.json`,JSON.stringify(r));console.log(JSON.stringify(r));

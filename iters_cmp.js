// Якість за однакової кількості прогонів: BL (випадкові порядки) vs стохастична мережа. 
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),B=require('./baselines.js'),G=require('./garment.js');
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const m=a=>a.reduce((s,x)=>s+x,0)/a.length;const out={};
for(let i=0;i<10;i++){const seed=300001+i,g=G.generate(seed,{rules:RULES[i%3]});
  for(const it of [1,10,100,250]){const t=Date.now(),r=B.solveBLMulti(g.pieces,g.rules,{width:g.width,budgetMs:60000,maxIters:it,seed});(out['BL N='+it]??=[]).push([r.efficiency,Date.now()-t])}}
for(const k in out)console.log(k.padEnd(10),(m(out[k].map(x=>x[0]))*100).toFixed(1),' сер. час',(m(out[k].map(x=>x[1]))/1000).toFixed(2)+'с')

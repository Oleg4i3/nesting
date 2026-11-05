// Жадібний режим (саме те, що оптимізувало донавчання) на відкладених наборах: усереднення за багатьма підвибірками.
const fs=require('fs'),X=require('./nnx.js'),T=require('./rl_tasks.js'),Gd=require('./guided.js');
const models=process.argv[2].split(',').map(s=>{const [n,p]=s.split('=');return{n,net:X.MLPX.fromJSON(JSON.parse(fs.readFileSync(p,'utf8')))}});
const sets=(process.argv[3]||'marques,mao,shirts,suit').split(','),rot=process.argv[4]||'dataset',NS=+process.argv[5]||12,res={};
for(const set of sets)for(const kind of ['plain','defects','ragged','both'])for(let s=0;s<NS;s++){
 const t=T.build({set,kind,seed:20000+s,n:set==='suit'?13:(rot==='dataset'?18:14),rot});
 for(const m of models){const g=Gd.solveGuided(t.pcs,t.rules,m.net,{width:t.W,maxLength:4000,temp:0,budgetMs:1,maxIters:1,blocked:t.blocked}),e=T.evaluate(t,g.placements);
  const k=kind+'|'+m.n;(res[k]=res[k]||[]).push(e?e.dens:0);(res['ALL|'+m.n]=res['ALL|'+m.n]||[]).push(e?e.dens:0);(res[set+'|'+m.n]=res[set+'|'+m.n]||[]).push(e?e.dens:0)}}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
for(const grp of ['ALL','plain','defects','ragged','both',...sets])console.log(grp.padEnd(9),models.map(m=>m.n+' '+(100*mean(res[grp+'|'+m.n])).toFixed(1)).join(' | '),' n='+res[grp+'|'+models[0].n].length);

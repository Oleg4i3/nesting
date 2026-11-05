// Реалістичні викрійки (garment.js), оптимум невідомий. node eval_garment.js <ч> <частин> <тег> [N=20] [blMs=15000] [refMs=45000] name=file ...
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Bm=require('./beam.js'),B=require('./baselines.js'),Fe=require('./features.js'),G=require('./garment.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'eg',NP=+process.argv[5]||20,blMs=+process.argv[6]||15000,refMs=+process.argv[7]||45000;
const nets={};const Ks={};for(const a of process.argv.slice(8)){const [nm,fk]=a.split('=');const [f,k]=fk.split('@');nets[nm]=X.MLPX.fromJSON(JSON.parse(fs.readFileSync(f,'utf8')));Ks[nm]=+k||56}
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const out=`results/${tag}_part${part}.jsonl`,done=new Set();
if(fs.existsSync(out))for(const l of fs.readFileSync(out,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(out,'a');
for(let i=0;i<NP;i++){
  const seed=300001+i;if(i%parts!==part||done.has(seed))continue;
  const g=G.generate(seed,{rules:RULES[i%3]}),pcs=g.pieces,W=g.width;
  const ev=N.evaluateLayout(pcs,{width:3000,height:3000});const area=ev.areaPx;
  const chk=r=>{if(r.placements.filter(Boolean).length!==pcs.length)return null;
    const e=N.evaluateLayout(P.placementsToPolys(pcs,r.placements),{width:W,height:4000,rollWidth:W});if(!e.valid)throw new Error('недійсна '+seed);return e.efficiency};
  const row={seed,pieces:pcs.length,width:W,rules:g.rules,areaPx:area,res:{}};
  const run=(nm,fn)=>{const t=Date.now(),r=fn();row.res[nm]={eff:chk(r),ms:Date.now()-t}};
  run('жадібний',()=>P.solveGreedy(pcs,g.rules,{width:W,maxLength:4000}));
  for(const [nm,net] of Object.entries(nets))for(const b of [4,16])run(`${nm}|${b}`,()=>Bm.solveBeam(pcs,g.rules,net,{width:W,maxLength:4000,beam:b,rank:'logp',K:Ks[nm]}));
  run('BL перебір',()=>B.solveBLMulti(pcs,g.rules,{width:W,budgetMs:blMs,seed}));
  run('BL відпал',()=>B.solveBLSA(pcs,g.rules,{width:W,budgetMs:blMs,seed}));
  run('ref: BL відпал довгий',()=>B.solveBLSA(pcs,g.rules,{width:W,budgetMs:refMs,seed:seed+1}));
  fs.writeSync(fd,JSON.stringify(row)+'\n');
  console.log(`[${part}] ${seed} n=${pcs.length} W=${W} `+Object.entries(row.res).map(([k,v])=>k+' '+(v.eff==null?'—':(v.eff*100).toFixed(1))).join(' | '));
}

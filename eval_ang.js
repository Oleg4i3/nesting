// Довільні кути. node eval_ang.js <ч> <частин> <тег> [ms=45000] [netfile=weights/v2/e1big.json] [rot=deg15] [Nstart=300001] [count=8]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),B=require('./baselines.js'),L=require('./lns2.js'),G=require('./garment.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'ang',ms=+process.argv[5]||45000,netf=process.argv[6]||'weights/v2/e1big.json',ROT=process.argv[7]||'deg15',S0=+process.argv[8]||300001,CNT=+process.argv[9]||8;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync(netf,'utf8')));
const suit=N.loadLayout(fs.readFileSync('/mnt/user-data/uploads/suit-manual.json','utf8'));
const base=suit.map(p=>{const b=N.vertexBBox(p);return N.translatePoly(p,-Math.floor(b.minX/10)*10,-Math.floor(b.minY/10)*10)});
const tasks=[{name:'костюм N=1',pcs:base,W:290},{name:'костюм N=2',pcs:[...base,...base],W:290}];
for(let i=0;i<CNT;i++){const g=G.generate(S0+i,{rules:{rotations:'any',mirror:false}});tasks.push({name:'викрійки '+(S0+i),pcs:g.pieces,W:g.width})}
const outF=`results/${tag}_part${part}.jsonl`,done=new Set();if(fs.existsSync(outF))for(const l of fs.readFileSync(outF,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).name);
const fd=fs.openSync(outF,'a');
tasks.forEach((t,i)=>{if(i%parts!==part||done.has(t.name))return;const row={name:t.name,res:{}};
  const run=(nm,rules,fn)=>{const t0=Date.now(),r=fn(rules);let eff=null,len=null;if(r.placements.filter(Boolean).length===t.pcs.length){const e=N.evaluateLayout(P.placementsToPolys(t.pcs,r.placements),{width:t.W,height:8000,rollWidth:t.W});if(e.valid){eff=e.efficiency;len=e.extent.length}}row.res[nm]={eff,len,ms:Date.now()-t0}};
  const o={width:t.W,maxLength:6000,budgetMs:ms,seed:3},R90={rotations:'any',mirror:false},RA={rotations:ROT,mirror:false};
  run('90°: LNS+BL',R90,r=>L.solveLNS(t.pcs,r,{...o,recreate:'BL',kMin:6,kMax:14,T0:0.6}));
  run('90°: LNS+мережа',R90,r=>L.solveLNS(t.pcs,r,{...o,recreate:'GUIDED',net,temp:0.5,kMin:4,kMax:10,T0:0.6}));
  run(ROT+': BL відпал',RA,r=>B.solveBLSA(t.pcs,r,o));
  run(ROT+': LNS+BL',RA,r=>L.solveLNS(t.pcs,r,{...o,recreate:'BL',kMin:6,kMax:14,T0:0.6}));
  run(ROT+': LNS+мережа',RA,r=>L.solveLNS(t.pcs,r,{...o,recreate:'GUIDED',net,temp:0.5,kMin:4,kMax:10,T0:0.6}));
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${t.name}: `+Object.entries(row.res).map(([k,v])=>k+' '+(v.eff==null?'—':(v.eff*100).toFixed(1)+'/'+v.len)).join(' | '))});

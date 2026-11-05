// Викрійки + заборонені зони та обрізки. node eval_zones.js <ч> <частин> <тег> [N=20] [ms=15000]
const fs=require('fs'),N=require('./raster.js'),X=require('./nnx.js'),B=require('./baselines.js'),Gd=require('./guided.js'),L=require('./lns2.js'),G=require('./garment.js'),Z=require('./zones.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'ez',NP=+process.argv[5]||20,ms=+process.argv[6]||15000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/e1big.json','utf8')));
const RG=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const outF=`results/${tag}_part${part}.jsonl`,done=new Set();if(fs.existsSync(outF))for(const l of fs.readFileSync(outF,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).seed);
const fd=fs.openSync(outF,'a');
for(let i=0;i<NP;i++){const seed=300001+i;if(i%parts!==part||done.has(seed))continue;
  const g=G.generate(seed,{rules:RG[i%3]}),pcs=g.pieces,W=g.width,rules=g.rules;
  const area=pcs.reduce((s,p)=>s+N.rasterize(p).area*25,0),est=area/W/0.8,zones=Z.makeZones(seed,W,est),row={seed,zones:zones.length,res:{}};
  const o={width:W,maxLength:6000,budgetMs:ms,seed,blocked:zones};
  const t=(nm,fn)=>{const t0=Date.now(),r=fn(),ok=r.placements.filter(Boolean).length===pcs.length;let e=null;if(ok){e=Z.evaluateWithZones(pcs,r.placements,zones,W)}row.res[nm]={eff:e&&e.valid?e.efficiency:null,len:e?e.len:null,hits:e?e.zoneHits:null,ms:Date.now()-t0}};
  t('BL перебір',()=>B.solveBLMulti(pcs,rules,o));
  t('BL відпал',()=>B.solveBLSA(pcs,rules,o));
  t('мережа: вибірка',()=>Gd.solveGuided(pcs,rules,net,{...o,temp:0.5}));
  t('LNS + BL',()=>L.solveLNS(pcs,rules,{...o,recreate:'BL',kMin:6,kMax:14,T0:0.6}));
  t('LNS + мережа',()=>L.solveLNS(pcs,rules,{...o,recreate:'GUIDED',net,temp:0.5,kMin:4,kMax:10,T0:0.6}));
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed} зон ${zones.length} `+Object.entries(row.res).map(([k,v])=>k+' '+(v.eff==null?'—':(v.eff*100).toFixed(1))).join(' | '))}

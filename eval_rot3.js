// Етап 3: великі пазли, виїмки, діра, обрізок. Мережа beam / гібрид (beam→LNS) проти BL-відпалу й LNS+BL за однакового ЗАГАЛЬНОГО часу.
// node eval_rot3.js <ч> <частин> <тег> <net.json> [NE=4] [ms=20000] [K=1000]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Bm=require('./beam.js'),B=require('./baselines.js'),L=require('./lns2.js'),C=require('./common.js'),Z=require('./zones.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'e3',netf=process.argv[5],NE=+process.argv[6]||4,ms=+process.argv[7]||20000,K=+process.argv[8]||1000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync(netf,'utf8')));
const jobs=[];for(const kind of ['scoop','hole','remnant','both'])for(let i=1;i<=NE;i++)jobs.push({kind,big:1,seed:800000+i*7+kind.length});
const outF=`results/${tag}_part${part}.jsonl`,done=new Set();if(fs.existsSync(outF))for(const l of fs.readFileSync(outF,'utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(l);done.add(r.kind+r.seed)}
const fd=fs.openSync(outF,'a');
jobs.forEach((j,ji)=>{if(ji%parts!==part||done.has(j.kind+j.seed))return;let pz;try{pz=C.makeHole(j.seed,j.kind,j.big)}catch(e){return}if(!pz)return;
  const pcs=pz.pieces,W=pz.width,rules=pz.rules,bl=pz.blocked||[],row={seed:j.seed,kind:j.kind,pieces:pcs.length,planted:pz.meta.plantedEfficiency,plantedLen:pz.meta.plantedLength,res:{}};
  const chk=(nm,r,t0)=>{let eff=null,len=null;if(r.placements.filter(Boolean).length===pcs.length){const e=Z.evaluateWithZones(pcs,r.placements,bl,W);if(e.valid){eff=e.efficiency;len=e.len}}row.res[nm]={eff,len,ms:Date.now()-t0}};
  const o={width:W,maxLength:4000,seed:j.seed,blocked:bl};
  let t0=Date.now();const bm=Bm.solveBeam(pcs,rules,net,{width:W,maxLength:4000,beam:16,rank:'logp',K,noSlit:true,blocked:bl});chk('мережа beam B=16',bm,t0);
  const tb=Date.now()-t0;
  t0=Date.now();chk('BL відпал',B.solveBLSA(pcs,rules,{...o,budgetMs:ms}),t0);
  t0=Date.now();chk('LNS + BL',L.solveLNS(pcs,rules,{...o,budgetMs:ms,recreate:'BL',kMin:6,kMax:14,T0:0.6}),t0);
  // гібрид: старт = результат мережі, решту часу LNS+BL (T0 нижче — не розхитувати добрий старт)
  t0=Date.now();try{const init=new Array(pcs.length).fill(null);bm.seq.forEach(s=>{init[s.pi]={vi:s.vi,A:s.A,cy:s.cy}});
    const r=L.solveLNS(pcs,rules,{...o,budgetMs:Math.max(1000,ms-tb),recreate:'BL',kMin:4,kMax:10,T0:0.25,init});chk('гібрид: мережа→LNS',r,t0);row.res['гібрид: мережа→LNS'].ms+=tb}catch(e){row.res['гібрид: мережа→LNS']={eff:null}}
  fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${j.kind} ${j.seed} n=${pcs.length} еталон ${(row.planted*100).toFixed(0)} `+Object.entries(row.res).map(([k,v])=>k+' '+(v.eff==null?'—':(v.eff*100).toFixed(1))+' ('+((v.ms||0)/1000).toFixed(0)+'с)').join(' | '))});

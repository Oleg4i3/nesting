// Експорт пазлів у формат Sparrow/jagua-rs + запуск наших методів з тим самим бюджетом.
// node ext_export.js export | node ext_export.js ours <ms>
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Bm=require('./beam.js'),Pf=require('./portfolio.js'),B=require('./baselines.js'),L=require('./lns2.js'),C=require('./common.js'),Z=require('./zones.js');
const SC=[
 ['pz_a','puzzle',()=>C.makePuzzle(C.randomSpecAng(700002,1,0))],
 ['pz_b','puzzle',()=>C.makePuzzle(C.randomSpecAng(700004,1,0))],
 ['pzbig_a','puzzle_big',()=>C.makePuzzle(C.randomSpecAng(701002,1,1))],
 ['pzbig_b','puzzle_big',()=>C.makePuzzle(C.randomSpecAng(701008,1,1))],
['pzbig_c','puzzle_big',()=>C.makePuzzle(C.randomSpecAng(701010,1,1))],
 ['trim_a','trim',()=>C.makePuzzle(C.randomSpecAng(702002,2,0))],
 ['trim_b','trim',()=>C.makePuzzle(C.randomSpecAng(702004,2,0))],
];
const mode=process.argv[2];fs.mkdirSync('ext',{recursive:true});
const angs=r=>r==='deg15'?Array.from({length:24},(_,i)=>i*15):r==='half'?[0,180]:r==='quarter'?[0,90,180,270]:null;
if(mode==='export'){
 const meta={};
 for(const [id,kind,mk] of SC){const pz=mk();const a=angs(pz.rules.rotations);if(!a)throw new Error('rot '+pz.rules.rotations);
  const items=pz.pieces.map((p,i)=>{const f=N.flatten(p),pts=[];for(let k=0;k<f.length;k+=2)pts.push([f[k],f[k+1]]);
    // орієнтація CCW + замкнене кільце
    let s=0;for(let k=0;k<pts.length;k++){const q=pts[(k+1)%pts.length];s+=pts[k][0]*q[1]-q[0]*pts[k][1]}if(s<0)pts.reverse();pts.push(pts[0].slice());
    return{id:i,demand:1,allowed_orientations:a,shape:{type:'simple_polygon',data:pts}}});
  // формат як у data/input/*.json
  const inst={name:id,items:items.map(it=>({id:it.id,demand:1,orientation:{rotation:{mode:'discrete',angles:a}},shape:it.shape})),strip_height:pz.width};
  fs.writeFileSync(`ext/${id}.json`,JSON.stringify(inst));
  const area=pz.pieces.reduce((s,p)=>s+N.polygonArea(p),0);
  meta[id]={kind,n:pz.pieces.length,width:pz.width,area,plantedEff:pz.meta.plantedEfficiency,plantedLen:pz.meta.plantedLength};console.log(id,meta[id])}
 fs.writeFileSync('ext/meta.json',JSON.stringify(meta));
}else{
 const ms=+process.argv[3]||30000,only=process.argv[4]?process.argv[4].split(','):null;
 const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/r3a.json','utf8')));
 const out=`ext/ours_${ms}_pf${process.env.SEED?"_s"+process.env.SEED:""}.json`,res=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):{};
 for(const [id,kind,mk] of SC){if(only&&!only.includes(id))continue;const pz=mk(),pcs=pz.pieces,W=pz.width,rules=pz.rules,o={width:W,maxLength:6000,seed:+process.env.SEED||7,blocked:[]};
  const area=pcs.reduce((s,p)=>s+N.polygonArea(p),0),r={};
  const ev=pl=>{if(!pl||pl.filter(Boolean).length!==pcs.length)return null;const e=Z.evaluateWithZones(pcs,pl,[],W);return e.valid?{eff:e.efficiency,len:e.len,dens:area/(W*e.len)}:null};
  const M=(process.env.METHODS||'net,bl,lns,hyb').split(',');
  let t0=Date.now();const bm=Pf.solvePortfolio(pcs,rules,net,{width:W,maxLength:6000,blocked:[]});const tb=Date.now()-t0;if(M.includes('net'))r.net={...ev(bm.placements),ms:tb,how:bm.how};
  if(M.includes('bl')){t0=Date.now();r.bl={...ev(B.solveBLSA(pcs,rules,{...o,budgetMs:ms}).placements),ms:Date.now()-t0}}
  if(M.includes('lns')){t0=Date.now();r.lns={...ev(L.solveLNS(pcs,rules,{...o,budgetMs:ms,recreate:'BL',kMin:6,kMax:14,T0:0.6}).placements),ms:Date.now()-t0}}
  if(M.includes('hyb')){t0=Date.now();const init=new Array(pcs.length).fill(null);bm.seq.forEach(s=>{init[s.pi]={vi:s.vi,A:s.A,cy:s.cy}});
  r.hyb={...ev(L.solveLNS(pcs,rules,{...o,budgetMs:Math.max(1000,ms-tb),recreate:'BL',kMin:4,kMax:10,T0:0.25,init}).placements),ms:Date.now()-t0+tb}}
  res[id]=r;console.log(id,JSON.stringify(r));fs.writeFileSync(out,JSON.stringify(res))}
}

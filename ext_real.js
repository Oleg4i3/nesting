// Реальні лекала ESICUP (формат Sparrow JSON) -> наш растровий рушій. node ext_real.js ours <ms> [ids]
const fs=require('fs'),N=require('./raster.js'),X=require('./nnx.js'),Bm=require('./beam.js'),Pf=require('./portfolio.js'),B=require('./baselines.js'),L=require('./lns2.js'),Z=require('./zones.js');
const DIR=__dirname+'/examples/real/esicup_',WPX=300;
const ALL=['marques','albano','dagli','mao','swim','trousers','shirts'];
function load(id){const d=JSON.parse(fs.readFileSync(DIR+id+'.json','utf8')),s=WPX/d.strip_height,pcs=[];let rot=null;
 for(const it of d.items){const a=it.allowed_orientations||(it.orientation&&it.orientation.rotation&&it.orientation.rotation.angles)||[0];
  const q=Array.from(new Set(a.map(x=>(x/90)))).sort((p,r)=>p-r);rot=JSON.stringify(q);
  let pts=it.shape.data.map(p=>({x:p[0]*s,y:p[1]*s}));if(pts.length>1&&pts[0].x===pts[pts.length-1].x&&pts[0].y===pts[pts.length-1].y)pts.pop();
  for(let k=0;k<it.demand;k++)pcs.push({vertices:pts.map(p=>({...p})),bezierControls:null,_rot:q})}
 return{pcs,W:WPX,H:d.strip_height,rules:{rotations:JSON.parse(rot),mirror:false}}}
if(process.argv[2]==='ours'){
 const ms=+process.argv[3]||30000,only=process.argv[4]?process.argv[4].split(','):ALL;
 const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/v2/r3a.json','utf8')));
 const out=`ext/real_ours_${ms}${process.env.SEED?"_s"+process.env.SEED:""}.json`,res=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):{};
 for(const id of only){const {pcs,W,rules}=load(id);for(const p of pcs){p.constraints={rotations:p._rot,mirror:false}}
  const o={width:W,maxLength:20000,seed:+process.env.SEED||7,blocked:[]},area=pcs.reduce((s,p)=>s+N.polygonArea(p),0),r={n:pcs.length};
  const ev=pl=>{if(!pl||pl.filter(Boolean).length!==pcs.length)return null;const e=Z.evaluateWithZones(pcs,pl,[],W);return e.valid?{dens:area/(W*e.len),len:e.len}:null};
  const M=(process.env.METHODS||'net,bl,lns,hyb').split(','),prev=res[id]||{};Object.assign(r,prev,{n:pcs.length});
  let t0=Date.now();const bm=Pf.solvePortfolio(pcs,rules,net,{width:W,maxLength:20000,blocked:[]});const tb=Date.now()-t0;
  if(M.includes('net'))r.net={...ev(bm.placements),ms:tb,how:bm.how};
  if(M.includes('bl')){t0=Date.now();r.bl={...ev(B.solveBLSA(pcs,rules,{...o,budgetMs:ms}).placements),ms:Date.now()-t0}}
  if(M.includes('lns')){t0=Date.now();r.lns={...ev(L.solveLNS(pcs,rules,{...o,budgetMs:ms,recreate:'BL',kMin:6,kMax:14,T0:0.6}).placements),ms:Date.now()-t0}}
  if(M.includes('hyb')){t0=Date.now();const init=new Array(pcs.length).fill(null);bm.seq.forEach(s=>{init[s.pi]={vi:s.vi,A:s.A,cy:s.cy}});
  r.hyb={...ev(L.solveLNS(pcs,rules,{...o,budgetMs:Math.max(1000,ms-tb),recreate:'BL',kMin:4,kMax:10,T0:0.25,init}).placements),ms:Date.now()-t0+tb}}
  res[id]=r;console.log(id,JSON.stringify(r));fs.writeFileSync(out,JSON.stringify(res))}
}
module.exports={load};

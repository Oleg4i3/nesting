// Сітка: ширина рулона × профіль варіативності. node grid_study.js <part> <parts> [per=8] [blMs=15000]
const fs=require('fs'),P=require('./puzzle.js'),N=require('./raster.js'),X=require('./nnx.js'),Bm=require('./beam.js'),B=require('./baselines.js'),NN=require('./nn.js');
const {makePuzzle}=require('./common.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,per=+process.argv[4]||8,blMs=+process.argv[5]||15000;
const net=X.MLPX.fromJSON(JSON.parse(fs.readFileSync('weights/sup/v1_[16,8]_tanh_без_skip_s1.json','utf8')));
const WIDTHS=[240,360,520];
const PROF={'однорідні, гладкі':{spread:0,wiggle:0.25,pockets:0,trim:0.3},
            'складні (сумірні, кишені)':{spread:0.15,wiggle:1,pockets:0.8,trim:0.7},
            'великий розкид розмірів':{spread:0.7,wiggle:0.8,pockets:1,trim:0.6}};
const RULES=[{rotations:'any',mirror:true},{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const out=`results/grid_part${part}.jsonl`,done=new Set();
if(fs.existsSync(out))for(const l of fs.readFileSync(out,'utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(l);done.add(r.id)}
const fd=fs.openSync(out,'a');
let k=0;
for(const width of WIDTHS)for(const [pn,pf] of Object.entries(PROF))for(let j=0;j<per;j++){
  const id=`${width}|${pn}|${j}`;if(k++%parts!==part||done.has(id))continue;
  const seed=96000+j*7+width/10,r=NN.mulberry32(seed*31+7);
  const pieces=20,length=Math.round(pieces*12500*(0.9+0.2*r())/width/10)*10;
  let pz;try{pz=makePuzzle({seed,hard:20,width,pieces,length,waste:0,trimMin:0.3,trimMax:0.9,rules:RULES[j%4],...pf})}catch(e){console.log('skip',id,e.message);continue}
  const chk=(nm,rr)=>{const ev=N.evaluateLayout(P.placementsToPolys(pz.pieces,rr.placements),{width:pz.width,height:4000,rollWidth:pz.width});
    if(!ev.valid||rr.placements.filter(Boolean).length!==pz.pieces.length)throw new Error('недійсна '+nm+' '+id);return ev.efficiency};
  const row={id,width,profile:pn,j,rules:pz.rules,planted:pz.meta.plantedEfficiency,res:{}};
  row.greedy=P.solveGreedy(pz.pieces,pz.rules,{width:pz.width,maxLength:4000}).efficiency;
  for(const b of [16,64]){const t=Date.now(),s=Bm.solveBeam(pz.pieces,pz.rules,net,{width:pz.width,maxLength:4000,beam:b,rank:'logp'});row.res['мережа B='+b]={eff:chk('net',s),ms:Date.now()-t}}
  {const t=Date.now(),s=B.solveBLMulti(pz.pieces,pz.rules,{width:pz.width,budgetMs:blMs,seed});row.res['BL перебір']={eff:chk('bl',s),ms:Date.now()-t}}
  {const t=Date.now(),s=B.solveBLSA(pz.pieces,pz.rules,{width:pz.width,budgetMs:blMs,seed});row.res['BL відпал']={eff:chk('sa',s),ms:Date.now()-t}}
  fs.writeSync(fd,JSON.stringify(row)+'\n');
  console.log(`[${part}] ${id} планта ${(row.planted*100).toFixed(0)} жад ${(row.greedy*100).toFixed(1)} `+Object.entries(row.res).map(([a,v])=>a+' '+(v.eff*100).toFixed(1)+'('+(v.ms/1000).toFixed(0)+'с)').join(' '));
}

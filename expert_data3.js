// Дані для пазлів із відходами. Мітка = КРАЩА з двох розкладок: еталон пазла (верхня межа) і beam-вчитель.
// node expert_data2.js <частина> <частин> <тег> [N_train=240] [N_val=24] [B=24] [teacher.json]
const fs=require('fs'),X=require('./nnx.js'),Fe=require('./features.js'),Bm=require('./beam.js'),N=require('./raster.js'),C=require('./common.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'w1',NT=+process.argv[5]||240,NV=+process.argv[6]||24,BW=+process.argv[7]||24;
const teacher=X.MLPX.fromJSON(JSON.parse(fs.readFileSync(process.argv[8]||'weights/sup/v1_[16,8]_tanh_без_skip_s1.json','utf8')));
const B=require('./baselines.js'),NF=Fe.NF,CELL=N.CELL,BLMS=+process.argv[9]||4000;
function replay(pz,seq,K=56){
  const board=new Fe.Board(pz.width,4000),vars=pz.pieces.map(p=>N.makeVariants(p,N.allowedFor(p,pz.rules)));
  let rem=[];pz.pieces.forEach((_,i)=>{if(vars[i].some(v=>v.w<=board.W))rem.push(i)});
  const ctx=Fe.makeCtx(vars,board.W,rem,board),out=[];
  for(const st of seq){
    const M=Math.max(5,Math.ceil(K/rem.length)),cands=Fe.genCandidates(board,vars,rem,M);
    let idx=cands.findIndex(c=>c.pi===st.pi&&c.vi===st.vi&&c.A===st.A&&c.cy===st.cy);
    if(idx<0){cands.push({pi:st.pi,vi:st.vi,A:st.A,cy:st.cy,ct:board.contact(vars[st.pi][st.vi],st.A,st.cy),cheap:0});idx=cands.length-1}
    const T=Fe.minDim(vars,rem),F=new Float32Array(cands.length*NF);
    for(let i=0;i<cands.length;i++)Fe.fillFeatures(board,ctx,cands[i],rem.length,T,F,i*NF);
    out.push({F,count:cands.length,pos:[idx]});board.place(vars[st.pi][st.vi],st.A,st.cy);rem=rem.filter(x=>x!==st.pi)}
  return out}
function plantedSeq(pz){
  const vars=pz.pieces.map(p=>N.makeVariants(p,N.allowedFor(p,pz.rules)));
  const t=pz.solution.map((s,i)=>{const vi=vars[i].findIndex(v=>v.rot===s.rot&&v.mirror===s.mirror);if(vi<0)return null;const v=vars[i][vi];return{pi:i,vi,A:v.x0+s.px/CELL,cy:v.y0+s.py/CELL}});
  if(t.some(x=>!x))return null;
  t.sort((a,b)=>a.cy-b.cy||a.A-b.A);return t}
function seqFromPl(pz,pl){
  const vars=pz.pieces.map(p=>N.makeVariants(p,N.allowedFor(p,pz.rules)));
  const t=pl.map((s,i)=>{if(!s)return null;const vi=vars[i].findIndex(v=>v.rot===s.rot&&v.mirror===s.mirror);if(vi<0)return null;const v=vars[i][vi];return{pi:i,vi,A:v.x0+s.px/CELL,cy:v.y0+s.py/CELL,h:v.h}});
  if(t.some(x=>!x))return null;
  const len=Math.max(...t.map(x=>x.cy+x.h));t.sort((a,b)=>a.cy-b.cy||a.A-b.A);return{seq:t,len}}
const jobs=[];
for(let i=1;i<=NT;i++)jobs.push({split:'train',seed:200000+i,big:i%2});
for(let i=1;i<=NV;i++)jobs.push({split:'val',seed:210000+i,big:i%2});
const wins={},sums={},cnts={};const meta=[],chunks=[];let offset=0,n=0,beamWins=0,plWins=0,sumB=0,sumP=0,sumBest=0;const t0=Date.now();
jobs.forEach((j,ji)=>{
  if(ji%parts!==part)return;
  let pz;try{pz=C.makePuzzle(C.randomSpecWaste(j.seed,j.big))}catch(e){return}
  const r=Bm.solveBeam(pz.pieces,pz.rules,teacher,{width:pz.width,maxLength:4000,beam:BW,rank:'logp'});
  const cand=[];
  const ps=plantedSeq(pz);if(ps)cand.push({src:'P',seq:ps,len:pz.meta.plantedLength/CELL});
  if(r.placed===pz.pieces.length)cand.push({src:'B',seq:r.seq,len:r.lengthPx/CELL});
  for(const [src,fn] of [['L',B.solveBLMulti],['S',B.solveBLSA]]){
    const q=fn(pz.pieces,pz.rules,{width:pz.width,budgetMs:BLMS,seed:j.seed});
    if(q.placements.filter(Boolean).length===pz.pieces.length){const sq=seqFromPl(pz,q.placements);if(sq)cand.push({src,seq:sq.seq,len:sq.len})}}
  if(!cand.length)return;
  cand.sort((a,b)=>a.len-b.len);const win=cand[0],area=pz.meta.cells,Wc=pz.width/CELL;
  wins[win.src]=(wins[win.src]||0)+1;
  const effOf=src=>{const c=cand.find(x=>x.src===src);return c?area/(Wc*c.len):NaN};
  for(const k of ['P','B','L','S'])if(!isNaN(effOf(k))){sums[k]=(sums[k]||0)+effOf(k);cnts[k]=(cnts[k]||0)+1}
  sums.best=(sums.best||0)+area/(Wc*win.len);n++;
  const seq=win.seq,useP=win.src;
  for(const s of replay(pz,seq)){meta.push({split:j.split,kind:'w'+j.big,seed:j.seed,count:s.count,pos:s.pos,offset,src:useP});chunks.push(Buffer.from(s.F.buffer));offset+=s.count*NF}
  if(n%10===0)console.log(`[${part}] ${n} пазлів; перемоги ${JSON.stringify(wins)}; сер. ефект. ${Object.keys(sums).map(k=>k+' '+(sums[k]/(k==='best'?n:cnts[k])*100).toFixed(1)).join(' ')}; ${((Date.now()-t0)/1000).toFixed(0)}с`)});
fs.mkdirSync('data',{recursive:true});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`,Buffer.concat(chunks));
fs.writeFileSync(`data/expert_${tag}_p${part}.json`,JSON.stringify({NF,meta,puzzles:n,wins,sums,cnts}));
console.log(`[${part}] готово ${n} пазлів, ${meta.length} зразків; перемоги ${JSON.stringify(wins)}`);
// Дані для пазлів із відходами. Мітка = КРАЩА з двох розкладок: еталон пазла (верхня межа) і beam-вчитель.
// node expert_data2.js <частина> <частин> <тег> [N_train=240] [N_val=24] [B=24] [teacher.json]
const fs=require('fs'),X=require('./nnx.js'),Fe=require('./features.js'),Bm=require('./beam.js'),N=require('./raster.js'),C=require('./common.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'w1',NT=+process.argv[5]||240,NV=+process.argv[6]||24,BW=+process.argv[7]||24;
const teacher=X.MLPX.fromJSON(JSON.parse(fs.readFileSync(process.argv[8]||'weights/sup/v1_[16,8]_tanh_без_skip_s1.json','utf8')));
const NF=Fe.NF,CELL=N.CELL;
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
const jobs=[];
for(let i=1;i<=NT;i++)jobs.push({split:'train',seed:200000+i,big:i%2});
for(let i=1;i<=NV;i++)jobs.push({split:'val',seed:210000+i,big:i%2});
const meta=[],chunks=[];let offset=0,n=0,beamWins=0,plWins=0,sumB=0,sumP=0,sumBest=0;const t0=Date.now();
jobs.forEach((j,ji)=>{
  if(ji%parts!==part)return;
  let pz;try{pz=C.makePuzzle(C.randomSpecWaste(j.seed,j.big))}catch(e){return}
  const r=Bm.solveBeam(pz.pieces,pz.rules,teacher,{width:pz.width,maxLength:4000,beam:BW,rank:'logp'});
  const ps=plantedSeq(pz);
  const area=pz.meta.cells,lenB=r.placed===pz.pieces.length?r.lengthPx/CELL:Infinity,lenP=ps?pz.meta.plantedLength/CELL:Infinity;
  if(!isFinite(lenB)&&!isFinite(lenP))return;
  const useP=lenP<=lenB;useP?plPlus():beamPlus();
  function plPlus(){plWins++}function beamPlus(){beamWins++}
  const seq=useP?ps:r.seq;
  sumB+=area/(pz.width/CELL*lenB);sumP+=area/(pz.width/CELL*lenP);sumBest+=area/(pz.width/CELL*Math.min(lenB,lenP));n++;
  for(const s of replay(pz,seq)){meta.push({split:j.split,kind:'w'+j.big,seed:j.seed,count:s.count,pos:s.pos,offset,src:useP?'P':'B'});chunks.push(Buffer.from(s.F.buffer));offset+=s.count*NF}
  if(n%10===0)console.log(`[${part}] ${n} пазлів; мітка=еталон ${plWins}, beam ${beamWins}; ефект. beam ${(sumB/n*100).toFixed(1)} еталон ${(sumP/n*100).toFixed(1)} краща ${(sumBest/n*100).toFixed(1)}; ${((Date.now()-t0)/1000).toFixed(0)}с`)});
fs.mkdirSync('data',{recursive:true});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`,Buffer.concat(chunks));
fs.writeFileSync(`data/expert_${tag}_p${part}.json`,JSON.stringify({NF,meta,puzzles:n,plWins,beamWins,effB:sumB/n,effP:sumP/n,effBest:sumBest/n}));
console.log(`[${part}] готово ${n} пазлів, ${meta.length} зразків; еталон ${plWins}, beam ${beamWins}; beam ${(sumB/n*100).toFixed(1)} еталон ${(sumP/n*100).toFixed(1)} краща ${(sumBest/n*100).toFixed(1)}`);

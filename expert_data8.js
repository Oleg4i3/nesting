// Складання пазла з довільними кутами: мітка = еталон пазла (відомий оптимум/верхня межа), кроки зверху вниз.
// Кандидати — усі позиції з контактом (genCandidates з великим M), негативи: NEG_TOP за "дешевим" балом + NEG_RND випадкових.
// node expert_data8.js <ч> <частин> <тег> [N1=300] [N2=300] [N1big=60] [N2big=60]
const fs=require('fs'),Fe=require('./features.js'),N=require('./raster.js'),C=require('./common.js'),P=require('./puzzle.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'r1',N1=+process.argv[5]||300,N2=+process.argv[6]||300,N1b=+process.argv[7]||60,N2b=+process.argv[8]||60;
const NF=Fe.NF,CELL=N.CELL,NEG_TOP=150,NEG_RND=150,MPER=300,rng=P.mulberry32(777+part);
function plantedSeq(pz){
  const vars=pz.pieces.map(p=>N.makeVariants(p,N.allowedFor(p,pz.rules)));
  const t=pz.solution.map((s,i)=>{const vi=vars[i].findIndex(v=>Math.abs(v.rot-s.rot)<1e-9&&v.mirror===s.mirror);if(vi<0)return null;const v=vars[i][vi];return{pi:i,vi,A:v.x0+s.px/CELL,cy:v.y0+s.py/CELL}});
  if(t.some(x=>!x))return null;t.sort((a,b)=>a.cy-b.cy||a.A-b.A);return t}
function replay(pz,seq){
  const board=new Fe.Board(pz.width,4000),vars=pz.pieces.map(p=>N.makeVariants(p,N.allowedFor(p,pz.rules)));
  let rem=[];pz.pieces.forEach((_,i)=>{if(vars[i].some(v=>v.w<=board.W))rem.push(i)});
  const ctx=Fe.makeCtx(vars,board.W,rem,board);ctx.noSlit=true;const out=[];
  for(const st of seq){
    let c=Fe.genCandidates(board,vars,rem,MPER);if(!c.length)c=Fe.genCandidates(board,vars,rem,MPER,2);
    let idx=c.findIndex(x=>x.pi===st.pi&&x.vi===st.vi&&x.A===st.A&&x.cy===st.cy);
    if(idx<0){c.push({pi:st.pi,vi:st.vi,A:st.A,cy:st.cy,ct:board.contact(vars[st.pi][st.vi],st.A,st.cy),cheap:0});idx=c.length-1}
    const pos=c[idx];c.splice(idx,1);c.sort((a,b)=>b.cheap-a.cheap);
    const top=c.slice(0,NEG_TOP),rest=c.slice(NEG_TOP);for(let i=rest.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]]}
    const sel=[pos,...top,...rest.slice(0,NEG_RND)],T=Fe.minDim(vars,rem),F=new Float32Array(sel.length*NF);
    for(let i=0;i<sel.length;i++)Fe.fillFeatures(board,ctx,sel[i],rem.length,T,F,i*NF);
    out.push({F,count:sel.length,pos:[0],hit:idx<c.length+1&&true});board.place(vars[st.pi][st.vi],st.A,st.cy);rem=rem.filter(x=>x!==st.pi)}
  return out}
const jobs=[];
for(let i=1;i<=N1;i++)jobs.push({split:'train',stage:1,big:0,seed:600000+i});for(let i=1;i<=N2;i++)jobs.push({split:'train',stage:2,big:0,seed:610000+i});
for(let i=1;i<=N1b;i++)jobs.push({split:'train',stage:1,big:1,seed:620000+i});for(let i=1;i<=N2b;i++)jobs.push({split:'train',stage:2,big:1,seed:630000+i});
for(const [st,big,s0] of [[1,0,690000],[2,0,691000],[1,1,692000],[2,1,693000]])for(let i=1;i<=8;i++)jobs.push({split:'val',stage:st,big,seed:s0+i});
const meta=[],chunks=[];let offset=0,n=0,miss=0,steps=0;const t0=Date.now();
jobs.forEach((j,ji)=>{
  if(ji%parts!==part)return;let pz;try{pz=C.makePuzzle(C.randomSpecAng(j.seed,j.stage,j.big))}catch(e){return}
  const ps=plantedSeq(pz);if(!ps)return;
  for(const s of replay(pz,ps)){meta.push({split:j.split,kind:'a'+j.stage+(j.big?'b':''),seed:j.seed,count:s.count,pos:s.pos,offset});chunks.push(Buffer.from(s.F.buffer));offset+=s.count*NF;steps++}
  n++;if(n%10===0)console.log(`[${part}] ${n} пазлів, зразків ${meta.length}, ${((Date.now()-t0)/1000).toFixed(0)}с`)});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`,Buffer.concat(chunks));fs.writeFileSync(`data/expert_${tag}_p${part}.json`,JSON.stringify({NF,meta,n}));
console.log(`[${part}] готово ${n} пазлів, ${meta.length} зразків, ${((Date.now()-t0)/1000).toFixed(0)}с`);

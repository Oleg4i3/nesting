// Широкі набори кандидатів (без вузького префільтра). Мітки = краща з (еталон, BL, BL+відпал); послідовності кешуються.
// Негативи: 250 найкращих за "дешевим" балом + 250 випадкових; позитив = крок вчителя.
// node expert_data4.js <ч> <частин> <тег> [N_waste=300] [N_garm=300] [BLms=4000]
const fs=require('fs'),Fe=require('./features.js'),N=require('./raster.js'),C=require('./common.js'),B=require('./baselines.js'),G=require('./garment.js'),P=require('./puzzle.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'g1',NW=+process.argv[5]||300,NG=+process.argv[6]||300,BLMS=+process.argv[7]||4000;
const NF=Fe.NF,CELL=N.CELL,NEG_TOP=250,NEG_RND=250,MPER=2000;
const RULES=[{rotations:'any',mirror:false},{rotations:'half',mirror:false},{rotations:'none',mirror:false}];
const rng=P.mulberry32(12345+part);
function seqFromPl(pcs,rules,pl){
  const vars=pcs.map(p=>N.makeVariants(p,N.allowedFor(p,rules)));
  const t=pl.map((s,i)=>{if(!s)return null;const vi=vars[i].findIndex(v=>v.rot===s.rot&&v.mirror===s.mirror);if(vi<0)return null;const v=vars[i][vi];return{pi:i,vi,A:v.x0+s.px/CELL,cy:v.y0+s.py/CELL,h:v.h}});
  if(t.some(x=>!x))return null;const len=Math.max(...t.map(x=>x.cy+x.h));t.sort((a,b)=>a.cy-b.cy||a.A-b.A);return{seq:t,len}}
function replayWide(pcs,rules,width,seq){
  const board=new Fe.Board(width,4000),vars=pcs.map(p=>N.makeVariants(p,N.allowedFor(p,rules)));
  let rem=[];pcs.forEach((_,i)=>{if(vars[i].some(v=>v.w<=board.W))rem.push(i)});
  const ctx=Fe.makeCtx(vars,board.W,rem,board),out=[];
  for(const st of seq){
    let c=Fe.genCandidates(board,vars,rem,MPER);if(!c.length)c=Fe.genCandidates(board,vars,rem,MPER,2);
    let idx=c.findIndex(x=>x.pi===st.pi&&x.vi===st.vi&&x.A===st.A&&x.cy===st.cy);
    if(idx<0){c.push({pi:st.pi,vi:st.vi,A:st.A,cy:st.cy,ct:board.contact(vars[st.pi][st.vi],st.A,st.cy),cheap:0});idx=c.length-1}
    const pos=c[idx];c.splice(idx,1);
    c.sort((a,b)=>b.cheap-a.cheap);
    const top=c.slice(0,NEG_TOP),rest=c.slice(NEG_TOP);
    for(let i=rest.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]]}
    const sel=[pos,...top,...rest.slice(0,NEG_RND)];
    const T=Fe.minDim(vars,rem),F=new Float32Array(sel.length*NF);
    for(let i=0;i<sel.length;i++)Fe.fillFeatures(board,ctx,sel[i],rem.length,T,F,i*NF);
    out.push({F,count:sel.length,pos:[0],total:c.length+1});
    board.place(vars[st.pi][st.vi],st.A,st.cy);rem=rem.filter(x=>x!==st.pi)}
  return out}
const jobs=[];
for(let i=1;i<=NW;i++)jobs.push({split:'train',kind:'w',seed:200000+i,big:i%2});
for(let i=1;i<=NG;i++)jobs.push({split:'train',kind:'g',seed:400000+i,k:i});
for(let i=1;i<=24;i++)jobs.push({split:'val',kind:'w',seed:210000+i,big:i%2});
for(let i=1;i<=24;i++)jobs.push({split:'val',kind:'g',seed:410000+i,k:i});
fs.mkdirSync('data',{recursive:true});
const meta=[],chunks=[];let offset=0,n=0,wins={},totSum=0,totN=0;const t0=Date.now();
jobs.forEach((j,ji)=>{
  if(ji%parts!==part)return;
  let pcs,rules,width,planted=null,cells;
  try{
    if(j.kind==='w'){const pz=C.makePuzzle(C.randomSpecWaste(j.seed,j.big));pcs=pz.pieces;rules=pz.rules;width=pz.width;cells=pz.meta.cells;
      const vars=pcs.map(p=>N.makeVariants(p,N.allowedFor(p,rules)));
      const t=pz.solution.map((s,i)=>{const vi=vars[i].findIndex(v=>v.rot===s.rot&&v.mirror===s.mirror);if(vi<0)return null;const v=vars[i][vi];return{pi:i,vi,A:v.x0+s.px/CELL,cy:v.y0+s.py/CELL}});
      if(!t.some(x=>!x)){t.sort((a,b)=>a.cy-b.cy||a.A-b.A);planted={seq:t,len:pz.meta.plantedLength/CELL}}}
    else{const g=G.generate(j.seed,{rules:RULES[j.k%3]});pcs=g.pieces;rules=g.rules;width=g.width;cells=pcs.reduce((s,p)=>s+N.rasterize(p).area,0)}
  }catch(e){return}
  const cand=[];if(planted)cand.push({src:'P',...planted});
  for(const [src,fn] of [['L',B.solveBLMulti],['S',B.solveBLSA]]){
    const q=fn(pcs,rules,{width,budgetMs:BLMS,seed:j.seed});
    if(q.placements.filter(Boolean).length===pcs.length){const sq=seqFromPl(pcs,rules,q.placements);if(sq)cand.push({src,...sq})}}
  if(!cand.length)return;
  cand.sort((a,b)=>a.len-b.len);const win=cand[0];wins[j.kind+win.src]=(wins[j.kind+win.src]||0)+1;
  totSum+=cells/(width/CELL*win.len);totN++;
  fs.appendFileSync(`data/seqs_${tag}_p${part}.jsonl`,JSON.stringify({seed:j.seed,kind:j.kind,split:j.split,src:win.src,len:win.len,seq:win.seq})+'\n');
  for(const s of replayWide(pcs,rules,width,win.seq)){meta.push({split:j.split,kind:j.kind,seed:j.seed,count:s.count,pos:s.pos,offset});chunks.push(Buffer.from(s.F.buffer));offset+=s.count*NF}
  n++;if(n%10===0)console.log(`[${part}] ${n} задач; перемоги ${JSON.stringify(wins)}; сер. ефект. вчителя ${(totSum/totN*100).toFixed(1)}; зразків ${meta.length}; ${((Date.now()-t0)/1000).toFixed(0)}с`)});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`,Buffer.concat(chunks));
fs.writeFileSync(`data/expert_${tag}_p${part}.json`,JSON.stringify({NF,meta,wins}));
console.log(`[${part}] готово: ${n} задач, ${meta.length} зразків`);

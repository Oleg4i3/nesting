// Етап 3: виїмки, діра, обрізок, великі пазли. Те саме, що expert_data9, але з забороненими зонами.
// (було: Пазли з обрізками/відходами і довільними кутами: мітка = найкраща з {еталон, BL-відпал, LNS+BL} (позиції довільні — старий каркас).
// node expert_data9.js <ч> <частин> <тег> [N=300] [msSA=5000] [msLNS=10000]
const fs=require('fs'),Fe=require('./features.js'),N=require('./raster.js'),C=require('./common.js'),P=require('./puzzle.js'),B=require('./baselines.js'),L=require('./lns2.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'r3',NT=+process.argv[5]||300,MSA=+process.argv[6]||5000,MLN=+process.argv[7]||10000;
const NF=Fe.NF,CELL=N.CELL,NEG_TOP=150,NEG_RND=150,MPER=300,rng=P.mulberry32(888+part);
function seqFromLayout(pz,vars,lay){const t=lay.map((x,i)=>({pi:i,vi:x.vi,A:x.A,cy:x.cy}));t.sort((a,b)=>a.cy-b.cy||a.A-b.A);return t}
function replay(pz,seq){
  const board=new Fe.Board(pz.width,4000);let bz=0;for(const bp of (pz.blocked||[])){Fe.blockPoly(board,bp);bz=Math.max(bz,Math.ceil(N.vertexBBox({vertices:bp.vertices.concat((bp.bezierControls||[]).filter(Boolean))}).maxY/CELL)+2)}
  const vars=pz.pieces.map(p=>N.makeVariants(p,N.allowedFor(p,pz.rules)));
  let rem=[];pz.pieces.forEach((_,i)=>{if(vars[i].some(v=>v.w<=board.W))rem.push(i)});
  const ctx=Fe.makeCtx(vars,board.W,rem,board);ctx.noSlit=true;const out=[];
  for(const st of seq){
    let c=Fe.genCandidates(board,vars,rem,MPER);if(!c.length)c=Fe.genCandidates(board,vars,rem,MPER,2);if(!c.length&&bz>board.len)c=Fe.genCandidates(board,vars,rem,MPER,bz-board.len);
    let idx=c.findIndex(x=>x.pi===st.pi&&x.vi===st.vi&&x.A===st.A&&x.cy===st.cy);
    if(idx<0){c.push({pi:st.pi,vi:st.vi,A:st.A,cy:st.cy,ct:board.contact(vars[st.pi][st.vi],st.A,st.cy),cheap:0});idx=c.length-1}
    const pos=c[idx];c.splice(idx,1);c.sort((a,b)=>b.cheap-a.cheap);
    const top=c.slice(0,NEG_TOP),rest=c.slice(NEG_TOP);for(let i=rest.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]]}
    const sel=[pos,...top,...rest.slice(0,NEG_RND)],T=Fe.minDim(vars,rem),F=new Float32Array(sel.length*NF);
    for(let i=0;i<sel.length;i++)Fe.fillFeatures(board,ctx,sel[i],rem.length,T,F,i*NF);
    out.push({F,count:sel.length,pos:[0]});board.place(vars[st.pi][st.vi],st.A,st.cy);rem=rem.filter(x=>x!==st.pi)}
  return out}
const KINDS=['scoop','hole','remnant','both'];const jobs=[];for(let i=1;i<=NT;i++)jobs.push({split:'train',kind:KINDS[i%4],big:i%3===0?0:1,seed:660000+i});for(let i=1;i<=16;i++)jobs.push({split:'val',kind:KINDS[i%4],big:1,seed:696000+i});
const meta=[],chunks=[];let offset=0,n=0;const wins={};const eff={};const t0=Date.now();
jobs.forEach((j,ji)=>{
  if(ji%parts!==part)return;let pz;try{pz=C.makeHole(j.seed,j.kind,j.big)}catch(e){return}if(!pz)return;
  const pcs=pz.pieces,W=pz.width,rules=pz.rules,bl=pz.blocked||[],vars=pcs.map(p=>N.makeVariants(p,N.allowedFor(p,rules)));
  const cand=[];
  // еталон
  const pl=pz.solution.map((s,i)=>{const vi=vars[i].findIndex(v=>Math.abs(v.rot-s.rot)<1e-9&&v.mirror===s.mirror);if(vi<0)return null;const v=vars[i][vi];return{vi,A:v.x0+s.px/CELL,cy:v.y0+s.py/CELL,h:v.h}});
  if(!pl.some(x=>!x))cand.push({src:'P',len:Math.max(...pl.map(x=>x.cy+x.h))*CELL,lay:pl});
  {const q=B.solveBLSA(pcs,rules,{width:W,budgetMs:MSA,seed:j.seed,blocked:bl});if(q.placed===pcs.length){const lay=q.placements.map((p,i)=>{const vi=vars[i].findIndex(v=>Math.abs(v.rot-p.rot)<1e-9&&v.mirror===p.mirror),v=vars[i][vi];return{vi,A:v.x0+p.px/CELL,cy:v.y0+p.py/CELL}});cand.push({src:'S',len:q.lengthPx,lay})}}
  {const q=L.solveLNS(pcs,rules,{width:W,blocked:bl,budgetMs:MLN,seed:j.seed,recreate:'BL',kMin:6,kMax:14,T0:0.6});cand.push({src:'L',len:q.lengthPx,lay:q.layout})}
  cand.sort((a,b)=>a.len-b.len);const best=cand[0];wins[best.src]=(wins[best.src]||0)+1;
  for(const c of cand){eff[c.src]=(eff[c.src]||[]).concat([pz.meta.cells*CELL*CELL/(W*c.len)])}
  for(const s of replay(pz,seqFromLayout(pz,vars,best.lay))){meta.push({split:j.split,kind:'c3'+j.kind+(j.big?'b':''),seed:j.seed,count:s.count,pos:s.pos,offset});chunks.push(Buffer.from(s.F.buffer));offset+=s.count*NF}
  n++;if(n%10===0)console.log(`[${part}] ${n} пазлів, зразків ${meta.length}, перемоги ${JSON.stringify(wins)}, ${((Date.now()-t0)/1000).toFixed(0)}с`)});
fs.writeFileSync(`data/expert_${tag}_p${part}.bin`,Buffer.concat(chunks));
fs.writeFileSync(`data/expert_${tag}_p${part}.json`,JSON.stringify({NF,meta,n,wins,eff:Object.fromEntries(Object.entries(eff).map(([k,v])=>[k,v.reduce((a,b)=>a+b,0)/v.length]))}));
console.log(`[${part}] готово ${n} пазлів, ${meta.length} зразків, перемоги ${JSON.stringify(wins)}`);

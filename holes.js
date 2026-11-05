// holes.js — пазли з «діркою» і «обрізком» (непрямокутний рулон) із відомим еталоном.
// Беремо готовий пазл, вилучаємо деталі, а їхній ЕТАЛОННИЙ контур лишаємо як заборонену зону. Решта деталей на своїх місцях — валідний еталон.
//  kind 'hole'    — одна внутрішня деталь (не торкається країв рулона) → зона всередині
//  kind 'remnant' — 2–4 деталі біля кута початку рулона → зрізаний кут довільної форми
//  kind 'both'    — і те, й інше
const N=require('./raster.js'),P=require('./puzzle.js');
function bb(poly){return N.vertexBBox({vertices:poly.vertices.concat((poly.bezierControls||[]).filter(Boolean))})}
function makeHolePuzzle(pz,kind,seed){
  const rng=P.mulberry32(seed*31337+7),W=pz.width,n=pz.pieces.length,boxes=pz.originals.map(bb);
  const ev=N.evaluateLayout(pz.originals,{width:W,height:pz.length}),L=ev.extent.length;
  const removed=new Set();
  const cx=i=>(boxes[i].minX+boxes[i].maxX)/2,cy=i=>(boxes[i].minY+boxes[i].maxY)/2;
  if(kind==='hole'||kind==='both'){
    const inner=[...Array(n).keys()].filter(i=>boxes[i].minX>4&&boxes[i].maxX<W-4&&boxes[i].minY>4&&boxes[i].maxY<L-4);
    if(inner.length){inner.sort((a,b)=>Math.hypot(cx(a)-W/2,cy(a)-L/2)-Math.hypot(cx(b)-W/2,cy(b)-L/2));removed.add(inner[Math.floor(rng()*Math.min(3,inner.length))])}
    else if(kind==='hole')return null}
  if(kind==='remnant'||kind==='both'){
    const left=rng()<0.5,m=2+Math.floor(rng()*3);
    const d=i=>Math.hypot(left?cx(i):W-cx(i),cy(i)*0.8);
    const c=[...Array(n).keys()].filter(i=>!removed.has(i)).sort((a,b)=>d(a)-d(b)).slice(0,m);c.forEach(i=>removed.add(i))}
  if(!removed.size||n-removed.size<6)return null;
  const keep=[...Array(n).keys()].filter(i=>!removed.has(i));
  const kept=keep.map(i=>pz.originals[i]),ev2=N.evaluateLayout(kept,{width:W,height:pz.length}),L2=ev2.extent.length;
  const cells=keep.reduce((s,i)=>s+N.rasterize(pz.originals[i]).area,0);
  return {width:W,length:pz.length,rules:pz.rules,pieces:keep.map(i=>pz.pieces[i]),solution:keep.map(i=>pz.solution[i]),originals:kept,
    blocked:[...removed].map(i=>pz.originals[i]),meta:Object.assign({},pz.meta,{kind,n:keep.length,cells,plantedLength:L2,plantedEfficiency:cells*N.CELL*N.CELL/(W*L2),removed:removed.size})};
}
module.exports={makeHolePuzzle};

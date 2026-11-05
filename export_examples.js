// Експорт прикладів у канонічний JSON-формат браузерного симулятора (див. README, розділ «Формат сцени»).
// node export_examples.js
const fs=require('fs'),N=require('./raster.js'),P=require('./puzzle.js'),C=require('./common.js');
const rnd=v=>Math.round(v*10)/10,ser=p=>({v:p.vertices.map(a=>[rnd(a.x),rnd(a.y)]),c:(p.bezierControls||p.vertices.map(()=>null)).map(c=>c?[rnd(c.x),rnd(c.y)]:null)});
function scene(id,title,pz,note){
  const rot=N.resolveRotations(pz.rules.rotations).map(q=>+(q*90).toFixed(6));
  const s={format:'nest-scene-v1',name:id,title,width:pz.width,rotations:rot,mirror:!!pz.rules.mirror,pieces:pz.pieces.map(ser),blocked:(pz.blocked||[]).map(ser)};
  if(pz.solution){const pl=pz.solution.map(q=>({rot:q.rot,mirror:q.mirror,px:q.px,py:q.py}));s.reference={name:'Еталон (відомий розв\'язок)',length:pz.meta.plantedLength,polys:P.placementsToPolys(pz.pieces,pl).map(ser)}}
  if(note)s.note=note;fs.writeFileSync(`examples/scenes/${id}.json`,JSON.stringify(s));console.log(id,s.pieces.length,s.rotations.length,(JSON.stringify(s).length/1024).toFixed(1)+'KB')}
scene('puzzle_8','Пазл, 8 деталей, кути кратні 15°',C.makePuzzle(C.randomSpecAng(700002,1,0)),'Синтетичний пазл зі знаним розв\'язком (ефективність еталона 100 %).');
scene('puzzle_21','Пазл, 21 деталь, кути кратні 15°',C.makePuzzle(C.randomSpecAng(701010,1,1)),'Великий синтетичний пазл із відомим розв\'язком.');
scene('trim_11','Пазл з обрізками, 11 деталей',C.makePuzzle(C.randomSpecAng(702004,2,0)),'Пазл з обрізаними дугами та відходами: еталон — верхня оцінка.');
scene('hole','Пазл з діркою (заборонена зона)',C.makeHole(800025,'hole',1),'Дефект/дірка в рулоні: зона рахується як відхід.');

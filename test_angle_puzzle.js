// Перевірка: еталон пазла з довільними кутами відновлюється точно (кожна деталь ставиться в сітку без перетину, площа збігається)
const N=require('./raster.js'),P=require('./puzzle.js');
let bad=0,tot=0,scaled=0;
for(const rot of ['deg15','deg30','any'])for(const [pieces,wiggle,trim] of [[8,0.5,0],[12,1,0],[12,0.7,0.8],[20,0.8,0.6]])for(let seed=1;seed<=4;seed++){
  let pz;try{pz=P.generate({width:300,length:500,seed,pieces,wiggle,trim,waste:trim?0.08:0,rules:{rotations:rot,mirror:false}})}catch(e){bad++;tot++;console.log('ВИНЯТОК',rot,pieces,wiggle,trim,seed,e.message.slice(0,60));continue}
  const g=new N.Grid(300,500);let ok=true,angles=new Set();
  pz.pieces.forEach((p,i)=>{const s=pz.solution[i],v=new N.Variant(p,s.rot,s.mirror);angles.add(+s.rot.toFixed(3));if(!g.fits(v,s.px,s.py))ok=false;g.place(v,s.px,s.py)});
  if(g.filledCells()!==pz.meta.cells)ok=false;tot++;if(!ok){bad++;console.log('ПОМИЛКА',rot,pieces,wiggle,trim,seed)}
}
console.log(`пазлів ${tot}, помилок відновлення еталона ${bad}`);

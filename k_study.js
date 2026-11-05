// Вплив ширини префільтра K на якість (та час) без перенавчання. node k_study.js <частина> <частин> <тег> [N=12] name=file...
const fs=require('fs'),X=require('./nnx.js'),Bm=require('./beam.js'),C=require('./common.js'),N=require('./raster.js'),P=require('./puzzle.js');
const part=+process.argv[2]||0,parts=+process.argv[3]||1,tag=process.argv[4]||'ks',NP=+process.argv[5]||12;
const nets={};for(const a of process.argv.slice(6)){const [nm,f]=a.split('=');nets[nm]=X.MLPX.fromJSON(JSON.parse(fs.readFileSync(f,'utf8')))}
const out=`results/${tag}_part${part}.jsonl`;const fd=fs.openSync(out,'a');
for(let i=0;i<NP;i++){if(i%parts!==part)continue;const seed=220001+i,pz=C.makePuzzle(C.randomSpecWaste(seed,i%2)),row={seed,res:{}};
 for(const [nm,net] of Object.entries(nets))for(const K of [56,1000,3000])for(const B of [1,4]){
  const t=Date.now(),r=Bm.solveBeam(pz.pieces,pz.rules,net,{width:pz.width,maxLength:4000,beam:B,rank:'logp',K});
  row.res[`${nm}|K${K}|B${B}`]={eff:r.efficiency*(r.placed/pz.pieces.length),ms:Date.now()-t}}
 fs.writeSync(fd,JSON.stringify(row)+'\n');console.log(`[${part}] ${seed} готово`)}

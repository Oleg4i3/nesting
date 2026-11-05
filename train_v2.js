// node train_v2.js <ім'я> <теги через кому> [епох=60] [seed=1] [hidden=16,8] [valTag=w1]
const fs=require('fs'),X=require('./nnx.js'),NN=require('./nn.js'),Fe=require('./features.js');
const name=process.argv[2],tags=process.argv[3].split(','),EP=+process.argv[4]||60,seed=+process.argv[5]||1,hidden=(process.argv[6]||'16,8').split(',').map(Number),valTag=process.argv[7]||'w1';
const NF=Fe.NF;
function load(tag,wantSplit){const out=[];
  for(const f of fs.readdirSync('data').filter(f=>f.startsWith(`expert_${tag}_p`)&&f.endsWith('.json'))){
    const m=JSON.parse(fs.readFileSync('data/'+f,'utf8')),buf=fs.readFileSync('data/'+f.replace('.json','.bin')),all=new Float32Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
    for(const s of m.meta){if(s.split!==wantSplit)continue;const pos=new Uint8Array(s.count);s.pos.forEach(i=>{pos[i]=1});out.push({F:all.subarray(s.offset,s.offset+s.count*NF),count:s.count,pos})}}
  return out}
const train=tags.flatMap(t=>load(t,'train')),val=load(valTag,'val');
console.log(`${name}: train ${train.length}, val ${val.length} (val з ${valTag})`);
const net=new X.MLPX(NF,hidden,'tanh',false).init(seed),rng=NN.mulberry32(77*seed+3),opt=new NN.Adam(net.n,3e-3),g=new Float64Array(net.n),idx=train.map((_,i)=>i);
const ev=set=>{let l=0,h=0;for(const s of set){const e=net.evalSample(s);l+=e.loss;h+=e.hit}return{loss:l/set.length,hit:h/set.length}};
let best={loss:1e9,p:null,ep:0};
for(let ep=1;ep<=EP;ep++){
  for(let i=idx.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]]}
  for(let b=0;b<idx.length;b+=16){g.fill(0);const n=Math.min(16,idx.length-b);for(let k=0;k<n;k++)net.lossGrad(train[idx[b+k]],g);for(let i=0;i<g.length;i++)g[i]/=n;opt.step(net.p,g,1e-4)}
  if(ep%4===0||ep===EP){const v=ev(val);if(v.loss<best.loss)best={loss:v.loss,p:Float64Array.from(net.p),ep,hit:v.hit}}}
net.p.set(best.p);
fs.mkdirSync('weights/v2',{recursive:true});fs.writeFileSync(`weights/v2/${name}.json`,JSON.stringify(net.toJSON()));
console.log(`${name}: параметрів ${net.n}, найкраща епоха ${best.ep}, val loss ${best.loss.toFixed(4)}, top1 ${(best.hit*100).toFixed(1)}%`);

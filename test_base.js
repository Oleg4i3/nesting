const P=require('./puzzle.js'),N=require('./raster.js'),B=require('./baselines.js');
const {randomSpecHard20,makePuzzle}=require('./common.js');
const pz=makePuzzle(randomSpecHard20(95001));
const f=(n,r)=>{const ev=N.evaluateLayout(P.placementsToPolys(pz.pieces,r.placements),{width:pz.width,height:4000,rollWidth:pz.width});
 console.log(n,'eff',(r.efficiency*100).toFixed(1),'indep',(ev.efficiency*100).toFixed(1),'valid',ev.valid,'placed',r.placed+'/'+pz.pieces.length,'iters',r.iters)};
const o={width:pz.width,budgetMs:+process.argv[2]||3000};
f('BLmulti',B.solveBLMulti(pz.pieces,pz.rules,o));
f('BLSA',B.solveBLSA(pz.pieces,pz.rules,o));
f('greedyRS',B.solveGreedyRestarts(pz.pieces,pz.rules,o));

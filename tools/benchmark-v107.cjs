'use strict';
const fs=require('node:fs'),path=require('node:path');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs');
const positions=require('../tests/fixtures/positions.json');
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const pct=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return s[l]+(s[h]-s[l])*(i-l);};
const timings=a=>({meanMs:mean(a),p50Ms:pct(a,.5),p95Ms:pct(a,.95),maxMs:Math.max(...a)});
function syntheticCeiling(board){
  const e=rules.countEmpties(board);if(e<3||e>4)return null;
  const b=board.slice(),m=Math.max(...b);if(!m)return null;b[b.indexOf(m)]=16384;
  if(b.reduce((s,v)=>s+v,0)+24>=65536||rules.legalRootBranches(b).length<2)return null;
  return b;
}
async function compare(boards){
  const old=await client('v10.6/2048-ai',{coordinator:true}),cur=await client('current',{coordinator:true});
  const rows=[];
  try{for(let i=0;i<boards.length;i++){
    const board=boards[i];let a,b;
    if(i&1){b=await cur.request({type:'analyze',board,strength:'extreme'});a=await old.request({type:'analyze',board,strength:'extreme'});}else{a=await old.request({type:'analyze',board,strength:'extreme'});b=await cur.request({type:'analyze',board,strength:'extreme'});}
    rows.push({i,empties:rules.countEmpties(board),old:a,current:b});
  }}finally{await old.close();await cur.close();}
  return rows;
}
(async()=>{
  const normal=await compare(positions);
  const ceilingBoards=positions.map(syntheticCeiling).filter(Boolean).slice(0,100),ceiling=await compare(ceilingBoards);
  const normalSummary={samples:normal.length,refined:normal.filter(r=>r.current.ceilingRefined).length,
    bestMismatch:normal.filter(r=>r.old.best!==r.current.best).length,depthMismatch:normal.filter(r=>r.old.depth!==r.current.depth).length,
    scoreMismatch:normal.filter(r=>JSON.stringify(r.old.scores)!==JSON.stringify(r.current.scores)).length,
    nodeMismatch:normal.filter(r=>r.old.nodes!==r.current.nodes).length,mainNodeMismatch:normal.filter(r=>r.old.mainNodes!==r.current.mainNodes).length,riskNodeMismatch:normal.filter(r=>r.old.riskNodes!==r.current.riskNodes).length,
    oldTiming:timings(normal.map(r=>r.old.time)),currentTiming:timings(normal.map(r=>r.current.time))};
  const triggered=ceiling.filter(r=>r.current.ceilingRefined);
  const ceilingSummary={samples:ceiling.length,refined:triggered.length,consensus:ceiling.filter(r=>r.current.ceilingConsensus).length,
    rejected:ceiling.filter(r=>r.current.ceilingRejected).length,finalChoiceChanged:ceiling.filter(r=>r.old.best!==r.current.best).length,
    finalDepths:Object.fromEntries([4,5,6].map(d=>[d,ceiling.filter(r=>r.current.depth===d).length])),
    oldTiming:timings(ceiling.map(r=>r.old.time)),currentTiming:timings(ceiling.map(r=>r.current.time)),triggeredTiming:timings(triggered.map(r=>r.current.time)),
    changedExamples:ceiling.filter(r=>r.old.best!==r.current.best).map(r=>({index:r.i,empties:r.empties,oldBest:r.old.best,newBest:r.current.best,depth:r.current.depth,gap:r.current.ceilingGap}))};
  const result={date:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,mode:'extreme',workers:4,
    protocol:{baseline:'V10.6 fixture captured before V10.7 changes',normal:'202 inherited reachable corpus boards',ceiling:'first 100 corpus boards with 3-4 empties, one maximum tile replaced by 16384, strict value-core mass certificate retained',note:'wall/search timings are environment-sensitive; semantic mismatch counts and refinement routing are deterministic'},
    normal:normalSummary,ceiling:ceilingSummary};
  fs.writeFileSync(path.join(root,'docs/V10_7_BENCHMARK.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {client,sources}=require('./clients-v10.cjs');
const {rules,engine}=require('./harness.cjs');
const corpus=require('./fixtures/positions.json');
const riskCorpus=require('./fixtures/risk-v9.2.json').positions.filter((_,i)=>i%3===2);
const dirs=['up','left','right','down'];
const median=a=>{const x=[...a].sort((p,q)=>p-q);return x[Math.floor(x.length/2)]};
function projectApi(){const c={Game2048:rules,performance,postMessage(){},onmessage:null};vm.createContext(c);vm.runInContext(sources('current').coordinator+'\nglobalThis.p=projectSurvival;',c);return c.p;}
async function riskBench(projected=false){
 const old=await client('q9.5'),now=await client('current'),project=projectApi();
 const rows=[];let certified=0,eligible=0,oldNodes=0,newNodes=0;
 try{for(const p of riskCorpus){let board=p.board,h=6;
   if(projected){board=board.slice();const idx=board.indexOf(Math.max(...board));if(idx<0)continue;board[idx]=2**31;const pr=project(board,h);if(!pr.eligible)continue;board=Array.from(pr.ranks,r=>r?2**r:0);eligible++;}
   const task={type:'riskall',round:'bench',board,horizon:h,nodeLimit:300000,baseline:p.baseline,minGap:.015};
   const a=await old.request(task),b=await now.request(task);if(b.proofCertified)certified++;
   oldNodes+=a.nodes||0;newNodes+=b.nodes||0;rows.push({old:a.time||0,now:b.time||0,proof:!!b.proofCertified});
 }}finally{await old.close();await now.close();}
 return {positions:rows.length,eligible:projected?eligible:undefined,certified,certRate:rows.length?certified/rows.length:0,
   oldMs:rows.reduce((s,r)=>s+r.old,0),v10Ms:rows.reduce((s,r)=>s+r.now,0),oldMedianMs:median(rows.map(r=>r.old)),v10MedianMs:median(rows.map(r=>r.now)),oldNodes,newNodes};
}
async function jsFixed(){
 const old=await client('q9.5'),now=await client('current'),tasks=[];
 for(const value of [32768,2**20,2**31,2**32])for(const src of [corpus[41],corpus[121],corpus.at(-1)]){const board=src.slice();board[board.indexOf(Math.max(...board))]=value;const cfg={...rules.config(board,'strong'),forceJS:true,fallbackBudget:30000};for(const branch of rules.legalRootBranches(board))tasks.push({...branch,type:'exact',round:'bench',depth:4,cfg,hardBudget:0});}
 const passes=[];try{for(let pass=0;pass<5;pass++){let aMs=0,bMs=0,aNodes=0,bNodes=0;for(const t of tasks){const a=await old.request(t),b=await now.request(t);if(a.score!==b.score||a.nodes!==b.nodes)throw Error('fixed-work mismatch');aMs+=a.time;bMs+=b.time;aNodes+=a.nodes;bNodes+=b.nodes;}passes.push({aMs,bMs,aNodes,bNodes});}}finally{await old.close();await now.close();}
 return {tasks:tasks.length,passes:passes.length,q95MedianMs:median(passes.map(x=>x.aMs)),v10MedianMs:median(passes.map(x=>x.bMs)),nodes:passes[0].aNodes};
}
function proofFixed(){
 const old=engine(sources('p9.5').worker),now=engine(sources('current').worker);return Promise.all([old.ready,now.ready]).then(()=>{
  const passes=[];for(let pass=0;pass<7;pass++){const a=old.safety(),b=now.safety();let an=0,bn=0;const t0=performance.now();for(const p of riskCorpus)for(const h of [6,7]){const q=old.pack4(p.board);if(q)an+=a.certify(...q,dirs.indexOf(p.baseline),h,4096,0).nodes;}const t1=performance.now();for(const p of riskCorpus)for(const h of [6,7]){const q=now.pack4(p.board);if(q)bn+=b.certify(...q,dirs.indexOf(p.baseline),h,4096,0).nodes;}const t2=performance.now();if(an!==bn)throw Error('proof work mismatch');passes.push({old:t1-t0,now:t2-t1,nodes:an});}
  return {passes:passes.length,decisions:riskCorpus.length*2,nodes:passes[0].nodes,p95MedianMs:median(passes.map(x=>x.old)),v10MedianMs:median(passes.map(x=>x.now))};
 });
}
(async()=>{
 const result={date:new Date().toISOString(),node:process.version,platform:process.platform,normalRisk:await riskBench(false),wideProjectedRisk:await riskBench(true),jsFixed:await jsFixed(),proofFixed:await proofFixed()};
 for(const key of ['normalRisk','wideProjectedRisk']){const r=result[key];r.speedup=r.v10Ms? r.oldMs/r.v10Ms:null;r.reduction=r.oldMs?1-r.v10Ms/r.oldMs:null;}
 result.jsFixed.speedRatio=result.jsFixed.v10MedianMs?result.jsFixed.q95MedianMs/result.jsFixed.v10MedianMs:null;
 result.proofFixed.speedRatio=result.proofFixed.v10MedianMs?result.proofFixed.p95MedianMs/result.proofFixed.v10MedianMs:null;
 const file=path.join(__dirname,'../docs/v10-benchmark.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});

// A/B workloads run sequentially in real workers. Alternate order, warm first.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {root,rules,rng,spawn}=require('./harness.cjs');
const {client}=require('./clients-v9.3.cjs');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/positions.json')));
const output=path.resolve(process.env.BENCH_OUTPUT||path.join(root,'docs/v9.3-results.json'));
const stats=a=>{const s=a.slice().sort((a,b)=>a-b);return {count:a.length,mean:a.reduce((a,b)=>a+b,0)/a.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.min(s.length-1,Math.floor(s.length*.95))]};};
const report={date:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,cpus:os.availableParallelism()},notes:['Real Node worker_threads; sequential paired workloads, alternating version order.','Time-budget games are not deterministic; small samples do not establish win rates.','Leaf visits are preserved even on memo hits; nodes/s is logical throughput, not fresh evaluations/s.']};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
async function fixed(){
  const clients={'9.2':await client('9.2'),'9.3':await client('9.3')};report.fixed=[];
  try{for(const forceJS of [false,true]){
    const times={'9.2':[],'9.3':[]},data={'9.2':{nodes:0,hits:0,misses:0},'9.3':{nodes:0,hits:0,misses:0}};let equal=0,total=0;
    const tasks=[];
    for(const original of corpus){const board=original.slice();if(forceJS){const i=board.indexOf(Math.max(...board));board[i]=Math.max(32768,board[i]);}
      const canon=rules.canonicalAI(board),cfg={...rules.config(board,'fast'),forceJS,fallbackBudget:30000};
      for(const b of rules.legalRootBranches(canon.board))tasks.push({...b,type:'exact',round:'bench',depth:forceJS?3:4,cfg,hardBudget:0});}
    for(const v of ['9.2','9.3'])for(const t of tasks.slice(0,32))await clients[v].request(t);
    for(let repeat=0;repeat<3;repeat++)for(let i=0;i<tasks.length;i++){
      const results={};for(const v of (i+repeat)%2?['9.3','9.2']:['9.2','9.3']){const r=await clients[v].request(tasks[i]);assert.equal(r.ok,true);results[v]=r;times[v].push(r.time);data[v].nodes+=r.nodes;data[v].hits+=r.leafHits||0;data[v].misses+=r.leafMisses||0;}
      assert.equal(results['9.2'].score,results['9.3'].score);assert.equal(results['9.2'].nodes,results['9.3'].nodes);equal++;total++;
    }
    const row={engine:forceJS?'JS large-tile compatibility':'WASM normal',positions:corpus.length,uniqueRoots:tasks.length,repeats:3,total,equal,depth:forceJS?3:4,versions:{}};
    for(const v of ['9.2','9.3'])row.versions[v]={ms:stats(times[v]),...data[v],nodesPerSecond:data[v].nodes/(times[v].reduce((a,b)=>a+b,0)/1000)};
    row.meanSpeedup=row.versions['9.2'].ms.mean/row.versions['9.3'].ms.mean;report.fixed.push(row);save();console.log('fixed',JSON.stringify(row));
  }}finally{for(const c of Object.values(clients))await c.close();}
}
async function latency(){
  report.latency=[];
  for(const mode of ['fast','strong','extreme']){
    const clients={'9.2':await client('9.2',{coordinator:true}),'9.3':await client('9.3',{coordinator:true})};
    const sample=corpus.filter((_,i)=>i%3===0).slice(0,60),rows={};
    for(const v of ['9.2','9.3']){rows[v]={time:[],wall:[],depth:[],discarded:[]};for(const board of sample.slice(0,6))await clients[v].request({type:'analyze',board,strength:mode});}
    try{for(let repeat=0;repeat<3;repeat++)for(let i=0;i<sample.length;i++)for(const v of (i+repeat)%2?['9.3','9.2']:['9.2','9.3']){
      const t=performance.now(),r=await clients[v].request({type:'analyze',board:sample[i],strength:mode});assert.ok(r.best);rows[v].time.push(r.time);rows[v].wall.push(performance.now()-t);rows[v].depth.push(r.depth);rows[v].discarded.push(r.discardedNodes||0);
    }}finally{for(const c of Object.values(clients))await c.close();}
    const row={mode,positions:sample.length,repeats:3,versions:{}};for(const v of ['9.2','9.3'])row.versions[v]=Object.fromEntries(Object.entries(rows[v]).map(([k,a])=>[k,stats(a)]));report.latency.push(row);save();console.log('latency',JSON.stringify(row));
  }
}
async function games(count){
  report.games=[];
  for(let seed=1;seed<=count;seed++)for(const version of seed%2?['9.2','9.3']:['9.3','9.2']){
    const c=await client(version,{coordinator:true}),random=rng(seed);let board=Array(16).fill(0),score=0,moves=0;spawn(board,random);spawn(board,random);const times=[];
    try{while(rules.legalRootBranches(board).length){const r=await c.request({type:'analyze',board,strength:'fast'});const m=rules.moveBoardPlain(board,r.best);assert.ok(m.moved);board=m.board;score+=m.gain;moves++;times.push(r.time);spawn(board,random);if(Math.max(...board)>=32768)break;}}
    finally{await c.close();}
    const row={seed,version,score,moves,maxTile:Math.max(...board),completed:!rules.legalRootBranches(board).length,searchMs:stats(times)};report.games.push(row);save();console.log('game',JSON.stringify(row));
  }
}
(async()=>{const action=process.argv[2]||'fixed';if(!['fixed','latency','games','comparisons','all'].includes(action))throw new Error('Use fixed, latency, comparisons, games [count], or all [count].');if(fs.existsSync(output))Object.assign(report,JSON.parse(fs.readFileSync(output)));if(['fixed','comparisons','all'].includes(action))await fixed();if(['latency','comparisons','all'].includes(action))await latency();if(action==='games'||action==='all'){const count=Number(process.argv[3]||6);if(!Number.isInteger(count)||count<1)throw new Error('Game count must be a positive integer');await games(count);}})().catch(e=>{console.error(e);process.exitCode=1;});

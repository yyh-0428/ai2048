const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,rules,rng,spawn,uiHarness}=require('./harness.cjs');
const source=fs.readFileSync(path.join(root,'src/coordinator.js'),'utf8');
function setup(){
 const output=[],sent=[],slots=Array.from({length:4},()=>({port:{postMessage:m=>sent.push(m)},busy:false,ready:true,wasm:true}));
 const context={Game2048:rules,performance,postMessage:m=>output.push(m),onmessage:null};context.globalThis=context;vm.createContext(context);
 const index=source.lastIndexOf('})();');
 vm.runInContext(source.slice(0,index)+`globalThis.hook={mobility,fragility,bestOf,riskComplete,receive,finish,job:()=>job,set(j,s){job=j;slots=s;}};`+source.slice(index),context);
 return {hook:context.hook,output,sent,slots,context};
}
function fakeJob(){
 const board=[2,4,64,4,512,32,256,8,4,256,1024,4,2,2,4,2048],branches=rules.legalRootBranches(board);
 return {id:1,revision:1,key:'fixture',rootBoard:board,transform:0,cfg:rules.config(board,'extreme'),branches,started:performance.now(),nodes:0,riskNodes:0,verifyNodes:0,discardedNodes:0,discardedRounds:0,depth:5,lastComplete:branches.map(b=>({dir:b.dir,depth:5,score:b.dir==='left'?100:99,engine:'wasm64'})),roundCosts:[0,0,0,0],spentBudget:0,roundBudget:0,phase:'risk',riskGap:0,riskFallback:false,verified:false};
}
test('allocation-free mobility matches real moves over 1000 seeded boards',()=>{
 const s=setup(),random=rng(42);let b=Array(16).fill(0);spawn(b,random);
 for(let i=0;i<1000;i++){assert.equal(s.hook.mobility(b),rules.legalRootBranches(b).length);const moves=rules.legalRootBranches(b);b=moves.length?moves[Math.floor(random()*moves.length)].board:Array(16).fill(0);spawn(b,random);}
});
test('canonical ties use direction order, never message arrival order',()=>{
 const s=setup();assert.equal(s.hook.bestOf({right:10,left:10,up:10}),'up');assert.equal(s.hook.bestOf({left:10,right:10}),'left');
});
test('Survival cannot override without a successful, supporting verifier',()=>{
 for(const scenario of ['same','small-gap','reject','accept','timeout']){
  const s=setup(),j=fakeJob();s.hook.set(j,s.slots);
  const risk={ok:true,nodes:10,best:scenario==='same'?'left':'right',survivals:{left:.9,right:scenario==='small-gap'?.901:.99}};
  s.hook.riskComplete(risk);
  if(scenario==='same'||scenario==='small-gap'){assert.equal(s.output.length,1);assert.equal(s.output[0].best,'left');assert.equal(s.sent.length,0);continue;}
  assert.equal(s.output.length,0);assert.equal(s.sent.length,2);assert.equal(j.phase,'verify');
  for(let i=0;i<2;i++){const m=s.sent[i];s.hook.receive(s.slots[i],{id:1,round:'verify',dir:m.dir,ok:scenario!=='timeout',score:m.dir==='right'?(scenario==='accept'?110:90):100,nodes:5});}
  assert.equal(s.output.length,1);assert.equal(s.output[0].best,scenario==='accept'?'right':'left');assert.equal(s.output[0].verified,scenario==='accept');
 }
});
test('H7 abort retries H6 once; second abort safely keeps baseline',()=>{
 const s=setup(),j=fakeJob();s.hook.set(j,s.slots);s.hook.riskComplete({ok:false,nodes:300000});assert.equal(s.sent[0].horizon,6);assert.equal(s.output.length,0);
 s.hook.riskComplete({ok:false,nodes:300000});assert.equal(s.sent.length,1);assert.equal(s.output[0].best,'left');assert.equal(s.output[0].riskAborted,true);
});
test('partial refinement discarded; never compare roots from different depths',()=>{
 const s=setup(),j=fakeJob();j.phase='search';j.depth=6;j.queue=[];j.results={};j.expected=j.branches.length;j.cfg.forceJS=true;s.hook.set(j,s.slots);
 j.branches.forEach((b,i)=>s.hook.receive(s.slots[i],{id:1,round:'d6',dir:b.dir,ok:i!==0,score:1e9,nodes:20}));
 assert.equal(s.output.length,1);assert.equal(s.output[0].depth,5);assert.equal(s.output[0].best,'left');assert.equal(s.output[0].discardedRounds,1);
});
test('message latency does not consume the compute budget',()=>{
 const s=setup(),j=fakeJob();j.phase='search';j.depth=4;j.cfg.budget=6;j.started=performance.now()-1000;j.queue=[];j.results={};j.expected=j.branches.length;s.hook.set(j,s.slots);
 j.branches.forEach((b,i)=>s.hook.receive(s.slots[i],{id:1,round:'d4',dir:b.dir,ok:true,score:100-i,nodes:100,time:1,depth:4}));
 assert.equal(s.output.length,0);assert.equal(j.depth,5);assert.equal(j.spentBudget,1);assert.ok(s.sent.every(m=>m.hardBudget===5));
});
test('cold JS failure retries all roots at the same attainable depth',()=>{
 const s=setup(),j=fakeJob();j.phase='search';j.lastComplete=null;j.queue=[];j.results={};j.expected=j.branches.length;j.cfg.forceJS=true;s.hook.set(j,s.slots);
 j.branches.forEach((b,i)=>s.hook.receive(s.slots[i],{id:1,round:'d5',dir:b.dir,ok:false,score:NaN,nodes:20}));
 assert.equal(s.output.length,0);assert.equal(s.sent.length,j.branches.length);assert.ok(s.sent.every(m=>m.depth===1));
});
test('real MessagePorts: full decision, cached result, cancellation, and large-tile fallback',async()=>{
 const h=uiHarness({realWorkers:true});let pending;
 h.hook.listen(r=>{pending?.(r);pending=null;});
 const ask=(board)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('worker timeout')),10000);pending=r=>{clearTimeout(timer);resolve(r)};h.hook.set({board},'fast');h.hook.askAI();});
 try{
  const b=[1024,512,128,4,256,64,32,8,16,8,2,0,4,2,0,0],r=await ask(b);assert.equal(r.depth,3);assert.equal(r.engine,'v10.5-wasm-expectimax');assert.ok(rules.moveBoardPlain(b,r.best).moved);
  const cached=await ask(b);assert.equal(cached.cached,true);assert.equal(cached.best,r.best);assert.equal(cached.time,0);
  h.hook.set({board:b},'extreme');h.hook.askAI();h.hook.newGame(true);
  const large=[65536,16,8,4,2048,64,4,2,128,16,8,0,32,8,4,0],fallback=await ask(large);assert.ok(fallback.engine.startsWith('js'));assert.ok(fallback.depth>=1);assert.ok(rules.moveBoardPlain(large,fallback.best).moved);assert.ok(Object.values(fallback.scores).every(Number.isFinite));
 }finally{await h.close();}
});

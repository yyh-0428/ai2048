'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {root,engine,rules,thread}=require('./harness.cjs');
const {client,sources}=require('./clients-v10.cjs');
const corpus=require('./fixtures/positions.json');
const riskCorpus=require('./fixtures/risk-v9.2.json').positions;
const dirs=['up','left','right','down'];
function projectApi(source){const c={Game2048:rules,performance,postMessage(){},onmessage:null};vm.createContext(c);vm.runInContext(source+'\nglobalThis.api={projectSurvival};',c);return c.api;}
function call(w,m){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('worker timeout')),10000);w.once('message',r=>{clearTimeout(timer);resolve(r)});w.postMessage(m);});}


test('V10 preserves Q9.5 numeric mover semantics on 50,248 boundary-heavy moves',async()=>{
 const a=engine(sources('q9.5').worker),b=engine(sources('current').worker);await Promise.all([a.ready,b.ready]);const x=a.legacy(),y=b.legacy();
 const {rng}=require('./harness.cjs'),random=rng(1050),cases=[],values=[0,1,2,14,15,30,31,32,55];
 for(let n=0;n<6561;n++){let code=n;const board=new Uint8Array(16);for(let i=0;i<4;i++){board[i]=values[code%9];code=Math.floor(code/9);}cases.push(board);}
 for(let n=0;n<6000;n++){const board=Uint8Array.from({length:16},()=>random()<.12?0:Math.floor(random()*(n%2?40:256)));if(n%3===0)board[1]=board[0];if(n%7===0)board[2]=board[3]=board[0];cases.push(board);}
 cases.push(Uint8Array.from([55,55,0,0,2,2,2,2,1,1,1,1,31,31,31,31]));
 let count=0;for(const board of cases)for(const dir of dirs){const before=Array.from(board),old=x.moveBoard(board,dir),now=y.moveBoard(board,dir);assert.deepEqual(Array.from(now[0]),Array.from(old[0]));assert.equal(now[1],old[1]);assert.equal(now[2],old[2]);assert.deepEqual(Array.from(board),before);count++;}
 assert.equal(count,50248);
});

test('V10 keeps Q9.5 exact JS search semantics at d1-d5 across large-rank boundaries',async()=>{
 const a=await client('q9.5'),b=await client('current');let count=0;
 try{for(const value of [32768,2**20,2**31,2**32])for(const mode of ['fast','strong','extreme'])for(const depth of [1,2,3,4,5])for(const src of [corpus[41],corpus[121],corpus.at(-1)]){
  const board=src.slice();board[board.indexOf(Math.max(...board))]=value;const cfg={...rules.config(board,mode),forceJS:true,fallbackBudget:30000};
  for(const branch of rules.legalRootBranches(board)){
   const task={...branch,type:'exact',round:'v10-equivalence',depth,cfg,hardBudget:0},x=await a.request(task),y=await b.request(task);
   assert.equal(x.ok,true);assert.equal(y.ok,true);assert.equal(y.score,x.score);assert.equal(y.nodes,x.nodes);count++;
  }
 }}finally{await a.close();await b.close();}assert.ok(count>500);
});

test('V10 safety prover preserves P9.5 facts and visited-node counts',async()=>{
 const old=engine(sources('p9.5').worker),now=engine(sources('current').worker);await Promise.all([old.ready,now.ready]);const a=old.safety(),b=now.safety();let count=0,nodes=0;
 for(const p of riskCorpus.filter((_,i)=>i%3===2))for(const h of [6,7]){const packed=old.pack4(p.board);if(!packed)continue;const d=dirs.indexOf(p.baseline),x=a.certify(...packed,d,h,4096,0),y=b.certify(...packed,d,h,4096,0);assert.equal(y.certified,x.certified);assert.equal(y.status,x.status);assert.equal(y.nodes,x.nodes);assert.equal(y.exhausted,x.exhausted);count++;nodes+=x.nodes;}
 assert.ok(count>100);assert.ok(nodes>1000);
});

test('V10 Horizon Quotient projection is byte-for-byte policy-equivalent to Q9.5 projection',()=>{
 const a=projectApi(sources('q9.5').coordinator),b=projectApi(sources('current').coordinator);let checked=0;
 for(const src of corpus.filter((_,i)=>i%3===0))for(const h of [1,4,6,7,12]){const board=src.slice();board[board.indexOf(Math.max(...board))]=2**31;const x=a.projectSurvival(board,h),y=b.projectSurvival(board,h);assert.deepEqual(JSON.parse(JSON.stringify(y)),JSON.parse(JSON.stringify(x)));checked++;}
 assert.ok(checked>100);
});

test('combined V10 path: wide board is projected, then certified, so full Survival is skipped',async()=>{
 const source=fs.readFileSync(path.join(root,'src/coordinator.js'),'utf8'),sent=[],out=[];
 const c={Game2048:rules,performance,postMessage:m=>out.push(m),onmessage:null};vm.createContext(c);
 const i=source.lastIndexOf('})();');vm.runInContext(source.slice(0,i)+"globalThis.hook={riskRound,riskComplete,set(j,s){job=j;slots=s;}};"+source.slice(i),c);
 const board=[2**31,2,4,...Array(13).fill(0)],branches=rules.legalRootBranches(board),slots=[{ready:true,busy:false,wasm:true,port:{postMessage:m=>sent.push(m)}}];
 const lastComplete=branches.map(b=>({dir:b.dir,depth:3,score:b.dir==='right'?100:50,engine:'js-v10'}));
 const j={id:1,revision:1,key:'v10-wide-proof',transform:0,cfg:{...rules.config(board,'strong'),budget:200,riskH:6},branches,rootBoard:board,phase:'risk',started:performance.now(),nodes:0,riskNodes:0,verifyNodes:0,discardedNodes:0,discardedRounds:0,lastComplete,riskResult:null,riskFallback:false,verified:false,overrideBest:null,riskGap:0,recovery:false,spentBudget:0,projectedRisk:true};
 c.hook.set(j,slots);c.hook.riskRound(6);assert.equal(sent.length,1);const task=sent[0];assert.equal(task.baseline,'right');assert.equal(task.minGap,j.cfg.riskGap);assert.ok(task.board.every(v=>v<32768));assert.ok(j.activeProjection.changed);
 const w=thread(sources('current').worker);try{const r=await call(w,{...task,id:1});assert.equal(r.proofCertified,true);assert.equal(r.best,'right');assert.equal(r.survivals.right,1);assert.ok(r.proofNodes>0);c.hook.riskComplete(r);assert.equal(out.length,1);assert.equal(out[0].best,'right');assert.equal(out[0].projectionApplied,true);assert.equal(out[0].proofCertified,true);assert.equal(out[0].verified,false);}finally{await w.terminate();}
});

test('when certificate is disabled, V10 projected/normal Survival probabilities remain unchanged',async()=>{
 const old=await client('q9.5'),now=await client('current');
 try{for(const p of riskCorpus.filter((_,i)=>i%75===0).slice(0,8)){for(const h of [6]){const task={type:'riskall',round:'fallback-equivalence',board:p.board,horizon:h,nodeLimit:300000,baseline:p.baseline,minGap:0},x=await old.request(task),y=await now.request(task);assert.equal(y.ok,x.ok);assert.equal(y.best,x.best);for(const d of dirs)assert.equal(y.survivals[d],x.survivals[d]);}}
 }finally{await old.close();await now.close();}
});

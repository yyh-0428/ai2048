'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rules,engine}=require('./harness.cjs');
const {sources,client}=require('./clients-v9.4.cjs');
const {solver,dirs,canonicalize}=require('./fixtures/quotient-reference.cjs');
const corpus=require('./fixtures/positions.json');
const wide=b=>{b=b.slice();b[b.indexOf(Math.max(...b))]=2**31;return b;};
const {project,requestProjected}=require('./projection-v9.4.cjs');
function api(){return {projectSurvival:project,ready:Promise.resolve()};}
function coordinator(){
 const out=[],sent=[],slots=Array.from({length:4},()=>({port:{postMessage:m=>sent.push(m)},busy:false,ready:true,wasm:true,survival:true}));
 const c={Game2048:rules,performance,postMessage:m=>out.push(m),onmessage:null};vm.createContext(c);
 const src=fs.readFileSync('src/coordinator.js','utf8'),i=src.lastIndexOf('})();');vm.runInContext(src.slice(0,i)+'globalThis.api={riskStart,riskComplete,receive,set(j){job=j;slots=globalThis.slots;}};'+src.slice(i),c);c.slots=slots;
 const board=[2,4,64,4,512,32,256,8,4,256,1024,4,2,2,4,2**31],branches=rules.legalRootBranches(board);
 const j={id:1,revision:1,key:'test',transform:0,rootBoard:board,branches,cfg:{...rules.config(board,'extreme'),budget:480},started:performance.now(),spentBudget:0,nodes:0,riskNodes:0,verifyNodes:0,discardedNodes:0,discardedRounds:0,depth:5,lastComplete:branches.map(b=>({dir:b.dir,depth:5,score:b.dir==='left'?100:99,engine:'js-v9.3'})),riskGap:0,riskFallback:false,verified:false};c.api.set(j);return {api:c.api,out,sent,slots,j};
}
test('9.4 preserves both WASMs, original scoring engine, and ordinary policy',()=>{
 const a=sources('9.3'),b=sources('9.4');
 for(const name of ['WASM_B64','SURVIVAL_WASM_B64']){const re=new RegExp(`const ${name}='([^']+)'`);assert.equal(a.worker.match(re)[1],b.worker.match(re)[1]);}
 const legacy=s=>s.slice(s.indexOf('function createLegacy(){'),s.indexOf('\nlet resultPort=null;'));
 assert.equal(legacy(a.worker),legacy(b.worker));
 assert.equal(a.worker,b.worker);
 assert.ok(b.coordinator.startsWith(a.coordinator.split('// Owns the complete decision.')[0]));
});
test('entry projection validates representation and matches researched transform',async()=>{
 const a=api();await a.ready;
 for(const b of corpus.map(wide))for(const h of [1,4,6,7,12]){
  const before=b.slice(),p=a.projectSurvival(b,h),r=canonicalize(b.map(v=>v?Math.log2(v):0),h);
  assert.deepEqual(b,before);if(p.eligible){assert.deepEqual(Array.from(p.ranks),r);assert.ok(p.maxRank<15);assert.ok(p.massBound<65536);}
 }
 for(const b of [[2],Array(16).fill(3),Array(16).fill(NaN),Array(16).fill(2**32)])assert.throws(()=>a.projectSurvival(b,6));
 for(const h of [0,13,1.5])assert.throws(()=>a.projectSurvival(wide(corpus[0]),h));
 assert.equal(a.projectSurvival(Array.from({length:16},(_,i)=>2**(i+2)),12).eligible,false);
});
test('real wide-tile worker probabilities agree with independent uncompressed JS oracle',async()=>{
 const c=await client('9.4'),reference=solver();let values=0;
 try{for(const board of corpus.filter((_,i)=>i%8===0).slice(0,24).map(wide))for(const h of [2,3]){
  reference.clear();const expected=reference.actionValues(board.map(v=>v?Math.log2(v):0),h);
  const r=await requestProjected(c,board,h,300000);assert.equal(r.ok,true);assert.equal(r.projected,true);
  dirs.forEach((d,i)=>{assert.ok(Math.abs(r.survivals[d]-expected[i])<1e-12);values++;});
 }}finally{await c.close();}assert.equal(values,192);
});
test('coordinator clears partial risk probabilities before fallback or policy decisions',()=>{
 const s=coordinator();s.j.projectedRisk=true;s.j.cfg.riskH=6;s.j.activeProjection={changed:true,maxRank:12};
 s.api.riskComplete({ok:false,best:'right',survivals:{left:.1,right:1},nodes:120000,time:2});
 assert.equal(s.j.riskResult.best,null);assert.equal(s.j.riskResult.survivals,null);assert.equal(s.out[0].best,'left');
});
test('wide risk uses spare budget; missing survival engine and exhausted budget keep baseline',()=>{
 for(const scenario of ['budget','missing','run']){const s=coordinator();if(scenario==='budget')s.j.spentBudget=479;if(scenario==='missing')s.slots[0].wasm=false;s.api.riskStart();
  if(scenario==='run'){assert.equal(s.sent.length,1);assert.equal(s.j.activeProjection.changed,true);assert.equal(s.sent[0].nodeLimit,120000);assert.ok(Math.max(...s.sent[0].board)<32768);assert.ok(s.j.rootBoard.includes(2**31));}
  else{assert.equal(s.sent.length,0);assert.equal(s.out[0].best,'left');}}
});
test('projected risk verifier uses original tile values, same depth and capped spare time',()=>{
 for(const outcome of ['accept','reject','timeout','budget']){
  const s=coordinator();s.j.projectedRisk=true;s.j.spentBudget=outcome==='budget'?478:460;
  s.api.riskComplete({ok:true,best:'right',survivals:{left:.5,right:.9},nodes:100,time:1,projected:true});
  if(outcome==='budget'){assert.equal(s.out[0].best,'left');assert.equal(s.sent.length,0);continue;}
  assert.equal(s.sent.length,2);assert.ok(s.sent.every(m=>m.cfg.forceJS&&m.depth===6&&m.hardBudget===19&&m.board.includes(2**31)));
  s.sent.forEach((m,i)=>s.api.receive(s.slots[i],{id:1,round:'verify',dir:m.dir,ok:outcome!=='timeout',score:m.dir==='right'?(outcome==='accept'?110:90):100,nodes:5}));
  assert.equal(s.out[0].best,outcome==='accept'?'right':'left');assert.equal(s.out[0].verified,outcome==='accept');
 }
});
test('wide H7 fallback stops when its remaining budget is exhausted',()=>{
 const s=coordinator();s.j.projectedRisk=true;s.j.spentBudget=475;s.api.riskComplete({ok:false,best:null,survivals:null,nodes:1,time:2});
 assert.equal(s.sent.length,0);assert.equal(s.out[0].best,'left');assert.equal(s.out[0].riskAborted,true);
});
test('full real coordinator completes certified wide risk at maximum main depth',async()=>{
 const c=await client('9.4',{coordinator:true});
 const b=[2,4,64,4,512,32,256,8,4,256,1024,4,2,2,4,2**31];
 try{const r=await c.request({type:'analyze',board:b,strength:'extreme'});assert.ok(rules.moveBoardPlain(b,r.best).moved);assert.ok(r.depth>=1);assert.equal(r.projectedRisk,true);assert.equal(r.riskChecked,true);assert.equal(r.projectionApplied,true);
 const cached=await c.request({type:'analyze',board:b,strength:'extreme'});assert.equal(cached.cached,true);assert.equal(cached.best,r.best);
 }finally{await c.close();}
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,rules}=require('./harness.cjs'),{client}=require('./clients-v10.cjs');
const source=fs.readFileSync(path.join(root,'src/coordinator.js'),'utf8');
const corpus=require('./fixtures/positions.json');
async function core(){const {instance}=await WebAssembly.instantiate(fs.readFileSync(path.join(root,'v102_ai.wasm')),{});instance.exports.v102_init();return instance.exports;}
test('extended WASM matches independent native C scores, nodes and TT hits at d3–d6',async()=>{
 const w=await core();for(const [lo,hi,d,score,nodes,hits] of require('./fixtures/core-d3-d6.json').rows){
  assert.equal(w.v102_score_depth(lo,hi,d),Math.fround(score));assert.equal(w.v102_nodes()>>>0,nodes);assert.equal(w.v102_cache_hits()>>>0,hits);
 }
});
test('d5 is real deeper work; separate requests do not reuse approximate TT history',async()=>{
 const w=await core();const lo=0x23456789,hi=0x00112234;
 const d4=w.v102_score_depth(lo,hi,4),n4=w.v102_nodes();
 const d5=w.v102_score_depth(lo,hi,5),n5=w.v102_nodes();
 assert.notEqual(d5,d4);assert.ok(n5>n4);
 w.v102_score_depth(0x87654321,0x12345678,6);
 assert.equal(w.v102_score_depth(lo,hi,5),d5);assert.equal(w.v102_nodes(),n5);
 assert.equal(w.v102_score_depth(lo,hi,99),w.v102_score_depth(lo,hi,6));
});
function dispatch(board,mode,{wasm=true,v102=true}={}){
 const sent=[],c={Game2048:rules,performance,postMessage(){},onmessage:null};vm.createContext(c);vm.runInContext(source,c);
 const ports=Array.from({length:4},()=>({postMessage:x=>sent.push(x)}));
 c.onmessage({data:{type:'init',ports}});for(const p of ports)p.onmessage({data:{type:'ready',wasm,v102}});
 c.onmessage({data:{type:'analyze',board,strength:mode,id:1,revision:1}});return sent;
}
test('extreme keeps d4 above two empties; every crowded root receives d5',()=>{
 for(const board of corpus){if(rules.legalRootBranches(board).length<2)continue;
  const tasks=dispatch(board,'extreme'),depth=rules.countEmpties(board)<=2?5:4;
  assert.equal(tasks.length,rules.legalRootBranches(board).length);
  for(const t of tasks){assert.equal(t.type,'v102');assert.equal(t.depth,depth);assert.equal(t.hardBudget,0);}
 }
});
test('fast/strong native floors and unavailable/wide-board fallbacks remain intact',()=>{
 const board=corpus.find(b=>rules.countEmpties(b)===2&&rules.legalRootBranches(b).length>1);
 assert.ok(dispatch(board,'fast').every(t=>t.type==='v102'&&t.depth===3));
 assert.ok(dispatch(board,'strong').every(t=>t.type==='v102'&&t.depth===5));
 assert.ok(dispatch(board,'extreme',{v102:false}).every(t=>t.type==='exact'));
 assert.ok(dispatch(board,'extreme',{wasm:false}).every(t=>t.type==='exact'&&t.cfg.forceJS));
 for(const value of [65536,2**31]){const wide=board.slice();wide[0]=value;assert.ok(dispatch(wide,'extreme').every(t=>t.type==='exact'&&t.cfg.forceJS));}
});
test('one/four compute workers agree on complete d5 root scores',async()=>{
 const board=corpus.find(b=>rules.countEmpties(b)===2&&rules.legalRootBranches(b).length>1);
 const results=[];
 for(const poolSize of [1,4]){const c=await client('current',{coordinator:true,poolSize});try{const r=await c.request({type:'analyze',board,strength:'extreme'});assert.equal(r.depth,5);assert.equal(r.discardedNodes,0);assert.ok(rules.moveBoardPlain(board,r.best).moved);assert.equal(r.nodes,r.mainNodes+r.riskNodes+r.verifyNodes);assert.ok(r.cacheHits>0);results.push(r);}finally{await c.close();}}
 assert.deepEqual(results[0].scores,results[1].scores);
});

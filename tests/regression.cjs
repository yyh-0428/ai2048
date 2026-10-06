const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,scripts,engine,rules,rng,spawn,uiHarness}=require('./harness.cjs');
const dirs=['up','left','right','down'],worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const dead=[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
const trap=[2,4,64,4,512,32,256,8,4,256,1024,4,2,2,4,2048];
const plain=b=>Array.from(b);
test('rules: one merge per tile, score gain, all four directions and large tiles',()=>{
 for(const value of [2,2048,4096,8192,16384,32768,65536]){
  const row=[value,value,value,value,...Array(12).fill(0)],m=rules.moveBoardPlain(row,'left');
  assert.deepEqual(m.board.slice(0,4),[value*2,value*2,0,0]);assert.equal(m.gain,value*4);
  assert.deepEqual(rules.moveBoardPlain(row,'right').board.slice(0,4),[0,0,value*2,value*2]);
  const col=Array(16).fill(0);[0,4,8,12].forEach(i=>col[i]=value);
  assert.deepEqual([0,4,8,12].map(i=>rules.moveBoardPlain(col,'up').board[i]),[value*2,value*2,0,0]);
  assert.deepEqual([0,4,8,12].map(i=>rules.moveBoardPlain(col,'down').board[i]),[0,0,value*2,value*2]);
 }
 assert.equal(rules.legalRootBranches(dead).length,0);
 assert.equal(rules.legalRootBranches([2,4,8,0,4,8,16,0,8,16,32,0,16,32,64,0]).length,1);
});
test('D4 rule equivalence and detailed/plain parity on 500 seeded states',()=>{
 const random=rng(91);let b=Array(16).fill(0);spawn(b,random);spawn(b,random);
 for(let n=0;n<500;n++){
  for(const d of dirs){const m=rules.moveBoardPlain(b,d),detail=rules.moveBoardDetailed(b,d);assert.deepEqual(detail.board,m.board);assert.equal(detail.gain,m.gain);
   for(let t=0;t<8;t++){const tm=rules.moveBoardPlain(rules.transformBoard(b,t),rules.transformDir(d,t));assert.deepEqual(tm.board,rules.transformBoard(m.board,t));assert.equal(tm.gain,m.gain);}
  }
  const moves=rules.legalRootBranches(b);b=moves.length?moves[Math.floor(random()*moves.length)].board:Array(16).fill(0);spawn(b,random);
 }
});
test('WASM instantiation, exports and embedded survival bytes',async()=>{
 const e=engine(worker);await e.ready;for(const k of ['analyze_exact','clear_tt','get_nodes','init_tables'])assert.equal(typeof e.wasm()[k],'function');
 const b64=worker.match(/const SURVIVAL_WASM_B64='([^']+)'/)[1];assert.deepEqual(Buffer.from(b64,'base64'),fs.readFileSync(path.join(root,'survival_v9_1.wasm')));
 assert.equal(e.pack4([32768,...Array(15).fill(0)]),null);
 assert.equal(rules.config([16384,16384,...Array(14).fill(0)],'extreme').forceJS,true);
});
test('Survival trap, node-limit abort and H7→H6 recovery',async()=>{
 const e=engine(worker);await e.ready;const h6=await e.wasmRiskAll(trap,6,300000),h7=await e.wasmRiskAll(trap,7,300000);
 assert.equal(h6.ok,true);assert.ok(h6.survivals.right-h6.survivals.left>.05);assert.equal(h7.ok,false);
 const retry=await e.wasmRiskAll(trap,6,300000);assert.deepEqual({...retry.survivals},{...h6.survivals});
 const terminal=await e.wasmRiskAll(dead,0,100);assert.ok(Object.values(terminal.survivals).every(x=>x<0));
});
test('JS fallback: terminal before depth/probability cutoff, symmetric duplicate maxima, 65536 merges',async()=>{
 const e=engine(worker);await e.ready;const js=e.legacy(),cfg={...rules.config(trap,'fast'),budget:10000};js.begin(cfg);
 assert.equal(js.maxNode(js.toRanks(dead),0,1,0),-1e15);assert.equal(js.maxNode(js.toRanks(dead),5,1e-10,0),-1e15);
 const b=[32768,0,2,4,0,32768,8,16,0,0,0,2,4,0,0,0],v=js.evaluate(js.toRanks(b));
 for(let t=0;t<8;t++)assert.ok(Math.abs(js.evaluate(js.toRanks(rules.transformBoard(b,t)))-v)<1e-8);
 assert.equal(js.rowMove(15|(15<<5))[0]&31,16);
 const large=[2**31,...Array(15).fill(0)];assert.equal(js.toRanks(large)[0],31);
 const wide=js.moveBoard(js.toRanks([2**31,2**31,...Array(14).fill(0)]),'left');assert.equal(wide[0][0],32);assert.equal(wide[2],2**32);
});
test('UI: manual move cancels outstanding hint; old result cannot affect new state',async()=>{
 const h=uiHarness();try{h.hook.set({board:[2,2,...Array(14).fill(0)]});h.hook.askAI();const s=h.hook.state();assert.equal(s.aiBusy,true);
  h.hook.doMove('left');assert.equal(h.hook.state().aiBusy,false);
  h.hook.finishAI({id:s.activeReq,revision:s.revision,best:'down',scores:{down:1},nodes:1,time:1,depth:1,engine:'wasm64'});
  assert.equal(h.ids.get('mMove').textContent,'—');assert.equal(h.ids.get('hintArrow').classList.contains('show'),false);
 }finally{await h.close();}
});
test('UI: undo while hint computes resets busy state and move count',async()=>{
 const h=uiHarness();try{h.hook.set({board:[2,2,...Array(14).fill(0)],moveCount:7});h.hook.doMove('left');h.hook.askAI();assert.equal(h.hook.state().aiBusy,true);h.hook.undo();assert.equal(h.hook.state().aiBusy,false);assert.equal(h.hook.state().moveCount,7);assert.deepEqual(plain(h.hook.state().board),[2,2,...Array(14).fill(0)]);
  h.hook.askAI();assert.equal(h.hook.state().aiBusy,true);
 }finally{await h.close();}
});
test('UI: new game cancels animation frames/timers and restores visible tiles',async()=>{
 const h=uiHarness({reduced:false});try{h.hook.set({board:[2,2,...Array(14).fill(0)]});h.hook.doMove('left');assert.equal(h.hook.state().animating,true);h.hook.newGame(true);const b=plain(h.hook.state().board);for(let i=0;i<8;i++)h.flushOne();assert.deepEqual(plain(h.hook.state().board),b);assert.equal(h.hook.state().animating,false);assert.equal(h.ids.get('tiles').classList.contains('is-moving'),false);assert.equal(h.ids.get('motionLayer').children.length,0);}finally{await h.close();}
});
test('UI: stop invalidates scheduled autoplay callback and does not cold-restart workers',async()=>{
 const h=uiHarness();try{h.hook.set({board:[2,2,...Array(14).fill(0)]});h.hook.toggleAuto();const s=h.hook.state();h.hook.finishAI({id:s.activeReq,revision:s.revision,best:'left',scores:{left:1},nodes:1,time:1,depth:1,engine:'wasm64'});h.hook.toggleAuto();for(let i=0;i<8;i++)h.flushOne();assert.equal(h.hook.state().autoplay,false);assert.equal(h.hook.state().aiBusy,false);assert.equal(h.workers.length,5);assert.ok(h.workers.every(w=>!w.terminated));}finally{await h.close();}
});
test('UI: autoplay overlaps next search with the configured move interval',async()=>{
 const h=uiHarness({reduced:false});try{h.ids.get('speed').value='200';h.hook.set({board:[2,2,...Array(14).fill(0)]});h.hook.toggleAuto();let s=h.hook.state();
  assert.equal(s.aiBusy,true);h.hook.finishAI({id:s.activeReq,revision:s.revision,best:'left',scores:{left:1},nodes:1,time:1,depth:1,engine:'wasm64'});s=h.hook.state();
  assert.equal(s.moveCount,1);assert.equal(s.animating,true);assert.equal(s.aiBusy,true);assert.equal(s.queuedAutoResult,null);
 }finally{await h.close();}
});
test('UI: reduced motion, accessible hidden overlay, progress restore, safe corrupt storage',async()=>{
 const h=uiHarness({session:{board:[2048,2,...Array(14).fill(0)],score:1234,moveCount:100}});try{assert.equal(h.hook.state().score,1234);assert.equal(h.ids.get('gameOverlay').hidden,true);h.hook.doMove('right');assert.equal(h.hook.state().animating,false);assert.equal(h.cells.length,16);assert.ok(h.cells[2].getAttribute('aria-label').includes('2048'));}finally{await h.close();}
 const bad=uiHarness({session:{board:Array(16).fill(3),score:-3}});try{assert.equal(bad.hook.state().score,0);assert.equal(bad.hook.state().board.filter(Boolean).length,2);}finally{await bad.close();}
});
test('UI: game over stops autoplay and exposes restart',async()=>{
 const h=uiHarness({session:{board:dead,score:10,moveCount:9}});try{assert.equal(h.ids.get('gameOverlay').hidden,false);assert.equal(h.ids.get('hintBtn').disabled,true);assert.equal(h.hook.state().autoplay,false);}finally{await h.close();}
});

test('UI: background visibility cannot trap autoplay behind a suspended animation frame',async()=>{
 const h=uiHarness({reduced:false});try{
  h.ids.get('speed').value='20';h.hook.set({board:[2,2,...Array(14).fill(0)]});h.hook.toggleAuto();let s=h.hook.state();
  h.hook.finishAI({id:s.activeReq,revision:s.revision,best:'left',scores:{left:1},nodes:1,time:1,depth:1,engine:'wasm64'});assert.equal(h.hook.state().animating,true);
  h.document.visibilityState='hidden';h.document.dispatch('visibilitychange');assert.equal(h.hook.state().animating,false);
  h.hook.askAI('auto');s=h.hook.state();const dir=rules.legalRootBranches(s.board)[0].dir;
  h.hook.finishAI({id:s.activeReq,revision:s.revision,best:dir,scores:{[dir]:1},nodes:1,time:1,depth:1,engine:'wasm64'});
  assert.equal(h.hook.state().animating,false);assert.equal(h.hook.state().moveCount,2);assert.equal(h.hook.state().autoplay,true);
 }finally{await h.close();}
});

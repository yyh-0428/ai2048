const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {root,scripts,engine,uiHarness,rules}=require('./harness.cjs');
const save=require('../src/session.js');
const initial={board:[1024,128,16,4,256,64,8,2,128,32,4,0,64,16,2,0],score:12340,moveCount:400};
const imported={board:[2048,128,16,4,256,64,8,2,128,32,4,0,64,16,2,0],score:22340,moveCount:700};
const file=s=>({size:Buffer.byteLength(s),text:async()=>s});
const snapshot=h=>{const {board,score,moveCount}=h.hook.state();return {board:Array.from(board),score,moveCount};};
test('portable save roundtrip, strict format, safe powers and corrupt input',()=>{
 assert.deepEqual(save.decode(save.encode(imported)),imported);
 assert.equal(save.validateGame({...initial,board:[2**50+1,...Array(15).fill(0)]}),null);
 for(const game of [{...initial,score:-1},{...initial,moveCount:1.5},{...initial,board:Array(16).fill(0)},{...initial,board:[3,...initial.board.slice(1)]}])assert.throws(()=>save.encode(game));
 for(const text of ['',JSON.stringify({format:'2048-ai-save',version:2,game:initial}),JSON.stringify({format:'2048-ai-save',version:1,game:{...initial,moveCount:-1}}),' '.repeat(save.MAX_BYTES+1)])assert.throws(()=>save.decode(text));
 assert.equal(save.validateGame({...initial,moveCount:-2},true).moveCount,0);
});
test('UI import cancels old hints, persists new board, and can undo the replacement',async()=>{
 const h=uiHarness({session:initial});try{
  h.hook.askAI();const old=h.hook.state();assert.equal(old.aiBusy,true);
  assert.equal(await h.hook.importSave(file(save.encode(imported))),true);assert.deepEqual(snapshot(h),imported);assert.equal(h.hook.state().aiBusy,false);
  h.hook.finishAI({id:old.activeReq,revision:old.revision,best:'down',scores:{down:1},time:1,nodes:1,engine:'wasm64'});assert.deepEqual(snapshot(h),imported);
  assert.deepEqual(JSON.parse(h.store.get('refined2048-session')),imported);
  h.hook.undo();assert.deepEqual(snapshot(h),initial);
 }finally{await h.close();}
});
test('bad file, read failure or over-size file preserves the active game',async()=>{
 const h=uiHarness({session:initial});try{
  let read=false;for(const f of [file('invalid'),{size:10,text:async()=>{throw Error('read failed');}},{size:save.MAX_BYTES+1,text:async()=>{read=true;return save.encode(imported);}}]){assert.equal(await h.hook.importSave(f),false);assert.deepEqual(snapshot(h),initial);}assert.equal(read,false);
 }finally{await h.close();}
});
test('late file read cannot overwrite a newer game or a newer import',async()=>{
 const h=uiHarness({session:initial});try{
  let release;const pending=h.hook.importSave({size:100,text:()=>new Promise(r=>release=r)});h.hook.newGame(true);const newer=snapshot(h);release(save.encode(imported));assert.equal(await pending,false);assert.deepEqual(snapshot(h),newer);
  let release2;const pending2=h.hook.importSave({size:100,text:()=>new Promise(r=>release2=r)});assert.equal(await h.hook.importSave(file(save.encode(initial))),true);release2(save.encode(imported));assert.equal(await pending2,false);assert.deepEqual(snapshot(h),initial);
 }finally{await h.close();}
});
test('reopening the file picker cancels a pending read even if no new file is selected',async()=>{
 const h=uiHarness({session:initial});try{
  let release;const pending=h.hook.importSave({size:100,text:()=>new Promise(r=>release=r)});
  h.ids.get('importBtn').onclick();release(save.encode(imported));
  assert.equal(await pending,false);assert.deepEqual(snapshot(h),initial);
 }finally{await h.close();}
});
test('local restore rejects an integer falsely rounded to a power of two by log2',async()=>{
 const invalid={...initial,board:[2**50+1,...Array(15).fill(0)]};
 const old=uiHarness({session:invalid,htmlPath:path.join(root,'tests/fixtures/proof-v9.4.html')}),updated=uiHarness({session:invalid});
 try{
  assert.equal(old.hook.state().board[0],2**50+1);
  assert.equal(updated.hook.state().score,0);
  assert.equal(updated.hook.state().board.filter(Boolean).length,2);
  assert.ok(updated.hook.state().board.every(v=>v===0||v===2||v===4));
 }finally{await old.close();await updated.close();}
});
test('import picker pauses autoplay; export preserves play and limits retained download URLs',async()=>{
 const h=uiHarness({session:initial});try{
  h.hook.toggleAuto();h.ids.get('exportBtn').onclick();assert.equal(h.hook.state().autoplay,true);assert.equal(h.downloads.length,1);
  const first=h.downloads[0];assert.deepEqual(save.decode(h.urls.get(first.href)),initial);assert.ok(first.download.endsWith('.json'));assert.equal(h.document.body.children.length,0);
  h.ids.get('exportBtn').onclick();assert.ok(h.revokedURLs.has(first.href));const second=h.downloads[1];assert.equal(h.revokedURLs.has(second.href),false);
  h.ids.get('importBtn').onclick();assert.equal(h.hook.state().autoplay,false);assert.equal(h.ids.get('saveFile').clicks,1);
  h.dispatchWindow('pagehide');assert.ok(h.revokedURLs.has(second.href));
 }finally{await h.close();}
});
test('importing terminal and 32768+ boards preserves overlay and compatibility search',async()=>{
 const h=uiHarness({session:initial});try{
  const dead={board:[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2],score:10,moveCount:20};assert.equal(await h.hook.importSave(file(save.encode(dead))),true);assert.equal(h.ids.get('gameOverlay').hidden,false);assert.equal(h.ids.get('hintBtn').disabled,true);h.hook.undo();assert.deepEqual(snapshot(h),initial);
  const large={...imported,board:[65536,...Array(15).fill(0)]};assert.equal(await h.hook.importSave(file(save.encode(large))),true);assert.equal(rules.config(snapshot(h).board,'fast').forceJS,true);assert.equal(h.ids.get('gameOverlay').hidden,true);
 }finally{await h.close();}
});
test('bit-scan proof visits exactly the same nodes and returns the same facts as V9.4',async(t)=>{
 const old=engine(scripts(fs.readFileSync(path.join(root,'tests/fixtures/proof-v9.4.html'),'utf8')).worker),updated=engine(fs.readFileSync(path.join(root,'src/worker.js'),'utf8'));await Promise.all([old.ready,updated.ready]);
 const a=old.safety(),b=updated.safety(),data=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/risk-v9.2.json'))).positions.filter((_,i)=>i%3===2);let count=0,nodes=0;
 for(const p of data)for(const h of [6,7]){const args=[...old.pack4(p.board),['up','left','right','down'].indexOf(p.baseline),h,4096,0],x=a.certify(...args),y=b.certify(...args);assert.equal(y.certified,x.certified);assert.equal(y.status,x.status);assert.equal(y.nodes,x.nodes);assert.equal(y.exhausted,x.exhausted);count++;nodes+=x.nodes;}
 t.diagnostic(JSON.stringify({decisions:count,identicalVisitedNodes:nodes}));
});

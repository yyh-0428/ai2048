const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {root,engine,rules,rng,uiHarness}=require('./harness.cjs');
const source=fs.readFileSync(path.join(root,'src/worker.js'),'utf8'),dirs=['up','left','right','down'];
const pack=b=>b.reduce((p,v,i)=>(p[i>>3]=(p[i>>3]|((v?Math.log2(v):0)<<((i&7)*4)))>>>0,p),[0,0]);
function oracle(){const memo=new Map();function alive(b,h){const key=h+':'+b.join(',');if(memo.has(key))return memo.get(key);const moves=rules.legalRootBranches(b);const yes=moves.length>0&&(h<=0||moves.some(m=>spawns(m.board,h-1)));memo.set(key,yes);return yes;}
 function spawns(b,h){for(let i=0;i<16;i++)if(!b[i])for(const v of [2,4]){const next=b.slice();next[i]=v;if(!alive(next,h))return false;}return true;}
 return (b,d,h)=>{const m=rules.moveBoardPlain(b,dirs[d]);return m.moved&&spawns(m.board,h-1)};
}
test('three-state facts agree with an independent complete AND/OR solver, including horizon reuse',async(t)=>{
 const e=engine(source);await e.ready;const p=e.safety(),expected=oracle(),random=rng(912);let positive=0,negative=0,shortSafeLongUnsafe=0;
 for(let n=0;n<200;n++){
  const b=Array.from({length:16},()=>random()<(n<100?.1:.01)?0:2**(1+Math.floor(random()*(n<100?6:10))));
  for(let d=0;d<4;d++){
   if(!rules.moveBoardPlain(b,dirs[d]).moved)continue;
   const long=expected(b,d,4),short=expected(b,d,1);shortSafeLongUnsafe+=!long&&short;
   for(const h of [4,1,3,2]){const result=p.certify(...pack(b),d,h,1000000,0),ref=expected(b,d,h);assert.notEqual(result.status,'unknown');assert.equal(result.certified,ref);assert.equal(result.status,ref?'safe':'not-certain');ref?positive++:negative++;}
  }
 }
 t.diagnostic(JSON.stringify({positive,negative,shortSafeLongUnsafe}));
 assert.ok(positive>50);assert.ok(negative>50);assert.ok(shortSafeLongUnsafe>10);
});
test('an unfinished proof never poisons a later complete proof',async()=>{
 const e=engine(source);await e.ready;const p=e.safety(),b=[2,4,64,4,512,32,256,8,4,256,1024,4,2,2,4,2048],ref=oracle();
 assert.equal(p.certify(...pack(b),1,6,1,0).status,'unknown');
 for(const h of [1,2,3,4])assert.equal(p.certify(...pack(b),1,h,1000000,0).certified,ref(b,1,h));
 const overflow=[32768,32768,...Array(14).fill(0)];assert.equal(p.certify(...pack(overflow),1,6,10000,0).status,'unknown');
});
test('new cache facts remain correct when every key hashes to the same slot',()=>{
 const vm=require('vm'),c={performance,Math:Object.assign(Object.create(Math),{imul:()=>0})};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function createSafetyProof(){'),source.indexOf('let SAFETY=null'))+';globalThis.p=createSafetyProof()',c);
 const random=rng(927),ref=oracle();for(let n=0;n<30;n++){const b=Array.from({length:16},()=>random()<.1?0:2**(1+Math.floor(random()*6)));for(const h of [3,1,2])for(let d=0;d<4;d++)assert.equal(c.p.certify(...pack(b),d,h,1000000,0).certified,ref(b,d,h));}
});
function backgroundMove(h){
 h.context.performance={now:()=>10000};h.hook.set({board:[1024,128,16,4,256,64,8,2,128,32,4,0,64,16,2,0]},'fast');h.hook.toggleAuto();
 h.document.visibilityState='hidden';h.document.dispatch('visibilitychange');h.context.performance={now:()=>12000};
 const s=h.hook.state(),d=rules.legalRootBranches(s.board)[0].dir;
 h.hook.finishAI({id:s.activeReq,revision:s.revision,best:d,scores:{[d]:1},nodes:1,time:1,depth:1,engine:'wasm64'});
 return {saved:JSON.parse(h.store.get('refined2048-session')),actual:h.hook.state()};
}
test('V9.3 reproduction: background turbo progress depends on a paint',async()=>{
 const h=uiHarness({htmlPath:path.join(root,'tests/fixtures/proof-v9.3.html')});try{const {saved,actual}=backgroundMove(h);assert.notEqual(saved.moveCount,actual.moveCount);}finally{await h.close();}
});
test('background turbo progress saves without an animation frame',async()=>{
 const h=uiHarness();try{const {saved,actual}=backgroundMove(h);assert.equal(saved.moveCount,actual.moveCount);assert.deepEqual(saved.board,Array.from(actual.board));}finally{await h.close();}
});
test('pagehide cancels AI and releases workers; restored page can start a new pool',async()=>{
 const h=uiHarness();try{h.hook.set({board:[1024,128,16,4,256,64,8,2,128,32,4,0,64,16,2,0]},'fast');h.hook.toggleAuto();const before=h.hook.state();h.dispatchWindow('pagehide');assert.equal(h.hook.state().autoplay,false);assert.equal(h.hook.state().aiBusy,false);assert.ok(h.workers.every(w=>w.terminated));h.dispatchWindow('pageshow',{persisted:true});h.hook.finishAI({id:before.activeReq,revision:before.revision,best:'down'});assert.equal(h.hook.state().moveCount,0);h.hook.askAI();assert.equal(h.hook.state().aiBusy,true);assert.equal(h.workers.length,10);}finally{await h.close();}
});
test('120 continuous real-Worker moves obey the rules; pause and undo remain stable',async()=>{
 const h=uiHarness({realWorkers:true});h.context.Math=Object.assign(Object.create(Math),{random:rng(814)});h.hook.newGame(true);h.hook.setStrength('fast');
 let previous=Array.from(h.hook.state().board),score=0,moves=0,lastBefore=null;
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('autoplay did not reach 120 moves')),15000);
   h.hook.listen(r=>{try{
    const expected=rules.moveBoardPlain(previous,r.best),s=h.hook.state(),actual=Array.from(s.board);assert.equal(expected.moved,true);assert.equal(s.moveCount,++moves);score+=expected.gain;assert.equal(s.score,score);
    const changed=actual.flatMap((v,i)=>v===expected.board[i]?[]:[i]);assert.equal(changed.length,1);assert.equal(expected.board[changed[0]],0);assert.ok([2,4].includes(actual[changed[0]]));
    lastBefore=previous;previous=actual;if(moves===120){h.hook.toggleAuto();clearTimeout(timer);resolve();}
   }catch(e){clearTimeout(timer);reject(e);}});h.hook.toggleAuto();
  });
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(h.hook.state().moveCount,120);assert.equal(h.hook.state().autoplay,false);assert.ok(h.workers.every(w=>!w.terminated));h.hook.undo();assert.equal(h.hook.state().moveCount,119);assert.deepEqual(Array.from(h.hook.state().board),lastBefore);
 }finally{await h.close();}
});

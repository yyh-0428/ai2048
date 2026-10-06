'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const cf=require('../src/counterfactual.js'),{root,rules,rng,scripts,uiHarness}=require('./harness.cjs'),{client}=require('./clients-v10.cjs');
test('counterfactual moves preserve real rules including nonchain merges and rank 15',()=>{
 const random=rng(118);for(let n=0;n<1000;n++){const b=Array.from({length:16},()=>random()<.3?0:2**(1+Math.floor(random()*15))),r=Uint8Array.from(b,v=>v?Math.log2(v):0);
  for(const d of cf.DIRS){const a=rules.moveBoardPlain(b,d),m=cf.move(r,d);assert.equal(!!m,a.moved);if(m){assert.deepEqual(Array.from(m.board,x=>x?2**x:0),a.board);assert.equal(m.gain,a.gain);}}}
});
test('counterfactual horizon mass certificate rejects saturation and malformed tiles',()=>{
 const board=Array(16).fill(0);board[0]=32768;assert.ok(cf.ranks(board,24,2));board[1]=32768;assert.equal(cf.ranks(board,24,2),null);board[1]=3;assert.equal(cf.ranks(board,24,2),null);board[1]=65536;assert.equal(cf.ranks(board,24,2),null);
 assert.equal(cf.ranks([0],24,2),null);assert.equal(cf.ranks(Array(16).fill(0),129,2),null);assert.equal(cf.ranks(Array(16).fill(0),24,4),null);
});
test('independent confirmation rejects discovery-only win; disabled switch isolates its effect',()=>{
 const mk=lives=>({ok:true,horizon:96,samples:16,lives}),r={up:mk([...Array(8).fill(12),...Array(8).fill(24)]),left:mk([...Array(8).fill(24),...Array(8).fill(12)])},s={up:1000,left:999};
 assert.equal(cf.choose(r,'up',s).changed,false);assert.equal(cf.choose(r,'up',s,{confirmation:false}).best,'left');
 const good={...r,left:mk(Array(16).fill(24))};assert.equal(cf.choose(good,'up',s).changed,false);
 good.up=mk(Array(16).fill(12));assert.equal(cf.choose(good,'up',s).best,'left');
});
test('all legal root samples must finish; a partial trajectory cannot choose a move',()=>{
 const results={up:{ok:true,horizon:96,samples:16,lives:Array(16).fill(12)},left:{ok:false,horizon:96,samples:16,lives:Array(15).fill(24)}};
 const r=cf.choose(results,'up',{up:1000,left:1000});assert.equal(r.complete,false);assert.equal(r.changed,false);
 results.left={ok:true,horizon:96,samples:16,lives:Array(16).fill(24)};
 assert.equal(cf.choose(results,'up',{up:1000,left:990}).changed,false);assert.equal(cf.choose(results,'up',{up:1000,left:999},{allowed:['up']}).changed,false);
});
test('strong escape arbitration accepts only both complete banks with bounded paired regret',()=>{
 const games=require('../docs/V11_8_DEVELOPMENT.json').rows.filter(r=>r.variant==='cf');
 const one=id=>{const c=games.find(r=>r.checkpoint===id).changes[0];return cf.strongEscape(c.plannerResults,c.planning.baseline,c.best);};
 assert.equal(one('seed-2').passed,true);for(const id of ['seed-1','seed-3','seed-4','seed-5','seed-101'])assert.equal(one(id).passed,false);
 const r={up:{ok:true,horizon:96,samples:16,lives:Array(16).fill(24)},left:{ok:true,horizon:96,samples:16,lives:Array(15).fill(96)}};assert.equal(cf.strongEscape(r,'up','left').complete,false);
});
test('native phase arbitration retains the mature long-route veto and preserves a pre-16384 escape',async()=>{
 const rows=require('../docs/V11_8_ARBITRATED_DEVELOPMENT.json').rows;
 const mature=rows.find(r=>r.checkpoint==='seed-1').changes.find(x=>x.trajectoryEscaped&&Math.max(...x.board)>=16384);
 const early=rows.find(r=>r.checkpoint==='seed-2').changes.find(x=>x.trajectoryEscaped&&Math.max(...x.board)<16384);assert.ok(mature&&early);
 const c=await client('current',{coordinator:true});try{for(const [x,hold] of [[mature,true],[early,false]]){
  const opts={counterfactual:true,learnedTrajectory:true,trajectoryEscape:true};
  const a=await c.request({type:'analyze',board:x.board,strength:'god',policyOptions:{...opts,trajectoryAssetGuard:false}}),b=await c.request({type:'analyze',board:x.board,strength:'god',policyOptions:{...opts,trajectoryAssetGuard:true}});
  assert.deepEqual(a.scores,b.scores);assert.equal(a.depth,b.depth);assert.equal(a.trajectoryEscaped,true);assert.equal(b.trajectoryStageHeld,hold);assert.equal(!!b.cached,false);
  assert.equal(b.trajectory.complete,true);assert.equal(b.trajectory.allowed,false);assert.equal(b.trajectoryEscaped,!hold);
  assert.equal(b.best,hold?b.trajectory.baseline:a.best);assert.equal(b.plannerChanged,!hold);
 }}finally{await c.close();}
});
test('simulation uses reproducible public-state counter streams and no game RNG',()=>{
 const board=[8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,2,0,0],options={...cf.SETTINGS,seed:cf.seed(board)};let calls=0;
 const fn=words=>{calls++;return words[0]+words[1];},a=cf.run(board,options,fn),b=cf.run(board,options,fn);assert.ok(a.ok&&calls);assert.deepEqual(a,b);assert.equal(a.lives.length,16);
 const bad=cf.run(board,options,()=>NaN);assert.equal(bad.ok,false);assert.equal(bad.lives,null);
 const src=fs.readFileSync(root+'/src/counterfactual.js','utf8');assert.ok(!src.includes('Math.random('));assert.ok(!src.includes('random.state'));
});
test('trajectory endpoints are complete pre-action birth states and do not change simulated lifetimes',()=>{
 const board=[8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,2,0,0],options={...cf.SETTINGS,seed:118},score=w=>w[0]+w[1];
 const a=cf.run(board,options,score),b=cf.run(board,{...options,captureEndpoints:true},score);assert.ok(a.ok&&b.ok);assert.deepEqual(a.lives,b.lives);assert.equal(a.searches,b.searches);assert.equal(b.endpoints.length,16);
 for(const e of b.endpoints){assert.equal(e.board.length,16);assert.equal(e.terminal,rules.legalRootBranches(e.board).length===0);}
 const bad=cf.choose({up:{ok:true,horizon:96,samples:16,lives:Array(16).fill(8)},left:{ok:true,horizon:96,samples:16,lives:Array(16).fill(96)}},'up',{up:NaN,left:999});assert.equal(bad.complete,false);
});
test('planner disabled retains V11.7 complete scores, depth and actual direction',async()=>{
 const a=await client('v11.7',{coordinator:true}),b=await client('current',{coordinator:true});
 try{for(const s of require('./fixtures/late-game/manifest.json').checkpoints){const x=await a.request({type:'analyze',board:s.game.board,strength:'god'}),y=await b.request({type:'analyze',board:s.game.board,strength:'god',policyOptions:{counterfactual:false}});
  assert.deepEqual(y.scores,x.scores);assert.equal(y.depth,x.depth);assert.equal(y.best,x.best);assert.equal(y.plannerChecked,false);}}
 finally{await a.close();await b.close();}
});
test('worker native continuations finish a complete reproducible sample bank',async()=>{
 const c=await client('current');try{const board=[8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,2,0,0],options={...cf.SETTINGS,seed:118};
  const a=await c.request({type:'counterfactual',board,options}),b=await c.request({type:'counterfactual',board,options});assert.ok(a.ok);assert.deepEqual(a.lives,b.lives);assert.equal(a.lives.length,16);assert.equal(a.nodes,b.nodes);
  assert.equal((await c.request({type:'counterfactual',board:Array(16).fill(65536),options})).ok,false);
 }finally{await c.close();}
});
test('private exact simulation memo preserves every lifetime, gain, endpoint and final value score',async()=>{
 const c=await client('current');try{const board=[8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,2,0,0],options={...cf.SETTINGS,seed:118,captureEndpoints:true};
  const a=await c.request({type:'counterfactual',board,options:{...options,memo:false}}),b=await c.request({type:'counterfactual',board,options:{...options,memo:true}});assert.ok(a.ok&&b.ok);
  for(const k of ['horizon','samples','policyDepth','lives','merges','minSpaces','terminalScores','searches','endpoints'])assert.deepEqual(a[k],b[k]);assert.ok(b.simulationCacheHits>0);assert.ok(b.nodes<a.nodes);
 }finally{await c.close();}
});
test('final HTML embeds exact new planner source in both decision and compute workers',()=>{
 const html=fs.readFileSync(root+'/2048-ai.html','utf8'),source=fs.readFileSync(root+'/src/counterfactual.js','utf8'),s=scripts(html);assert.ok(s.worker.includes(source));
 const coordinator=html.match(/<script id="ai-coordinator-source" type="text\/plain">([\s\S]*?)<\/script>/)[1];assert.ok(coordinator.includes(source));
 assert.equal(s.worker.trim(),fs.readFileSync(root+'/src/worker.js','utf8').trim());assert.match(html,/2048 · AI V11\.8/);
});

test('a complete baseline at the sample ceiling cannot meet any positive-improvement gate',()=>{
 const {horizon:H,samples:N}=cf.SETTINGS,random=rng(11888);
 for(let n=0;n<1000;n++){const results={up:{ok:true,horizon:H,samples:N,lives:Array(N).fill(H)},left:{ok:true,horizon:H,samples:N,lives:Array.from({length:N},()=>1+Math.floor(random()*H))}};
  for(const confirmation of [true,false])for(const tailGuard of [true,false])assert.equal(cf.choose(results,'up',{up:1000,left:999},{confirmation,tailGuard}).changed,false);
 }
});
test('planner candidate safety proof resets its own facts and has a deterministic node bound',async()=>{
 const c=await client('current');try{
  const rootBoard=[8192,4096,2048,1024,...Array(12).fill(0)],board=rules.moveBoardPlain(rootBoard,'down').board;
  const task={type:'counterfactual',board,rootBoard,dir:'down',proofH:7,options:{...cf.SETTINGS,horizon:8,samples:8,seed:118}};
  const a=await c.request(task),b=await c.request(task);assert.ok(a.ok&&b.ok);assert.equal(a.shortCertified,true);assert.equal(b.shortCertified,true);assert.equal(a.shortProofNodes,b.shortProofNodes);assert.deepEqual(a.lives,b.lives);
 }finally{await c.close();}
});
test('visible planner switch persists only its setting and sends the selected policy to the coordinator',async()=>{
 const h=uiHarness();try{
  const state=JSON.stringify(h.hook.state().board),box=h.ids.get('counterfactualToggle');assert.ok(box);box.checked=true;box.onchange();
  assert.equal(box.checked,true);assert.equal(h.store.get('refined2048-counterfactual-v118'),'on');assert.equal(JSON.stringify(h.hook.state().board),state);
  h.hook.set({board:[8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,2,0,0]},'god');h.hook.askAI();
  const sent=h.workers.flatMap(w=>w.sent).find(m=>m.type==='analyze');assert.equal(sent.policyOptions.counterfactual,true);
  h.hook.newGame();h.hook.setStrength('fast');assert.equal(box.disabled,true);
 }finally{await h.close();}
});

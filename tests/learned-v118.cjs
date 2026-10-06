'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ls=require('../src/learned-survival.js'),{root,rules,rng,uiHarness}=require('./harness.cjs');
const {client}=require('./clients-v10.cjs');
function zeroModel(){return {version:1,heads:[256,1024,4096],inputSize:64,hiddenSize:32,members:Array.from({length:3},()=>({w1:Array(2048).fill(0),b1:Array(32).fill(0),w2:Array(96).fill(0),b2:[0,0,0]})),id:'test'};}
test('learned geometry features are exactly D4 invariant and contain no random state',()=>{
 const random=rng(18118);for(let i=0;i<300;i++){const b=Array.from({length:16},()=>random()<.25?0:2**(1+Math.floor(random()*15))),x=ls.features(b);assert.equal(x.length,64);assert.ok(x.every(Number.isFinite));for(let t=0;t<8;t++)assert.deepEqual(ls.features(rules.transformBoard(b,t)),x);}
 assert.equal(ls.features(Array(16).fill(65536)),null);assert.equal(ls.features(Array(16).fill(3)),null);
});
test('learned critic enumerates every 2/4 birth cell and weights the lower quarter',()=>{
 const model=ls.create(zeroModel()),board=[8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,2,0,0],branches=rules.legalRootBranches(board),r=model.analyze(branches);assert.ok(r.ok);
 assert.deepEqual(Object.keys(r.results).sort(),branches.map(b=>b.dir).sort());for(const b of branches){const a=r.results[b.dir];assert.equal(a.allSpawnOutcomes,2*rules.countEmpties(b.board));for(const m of a.members)for(const [k,v] of Object.entries({short:.5,mid:.25,long:.125,area:.171875,tail:.171875}))assert.ok(Math.abs(m[k]-v)<1e-12);}
});
test('one disagreeing learned member rejects a proposal that the mean alone accepts',()=>{
 const member=(short,long,tail)=>({short,mid:short,long,area:long,tail});
 const base=Array(3).fill(member(.8,.5,.4)),alt=[member(.8,.6,.5),member(.8,.6,.5),member(.8,.49,.4)],a={ok:true,modelId:'test',results:{up:{members:base},left:{members:alt}}},scores={up:1000,left:999};
 assert.equal(ls.choose(a,'up',scores).changed,false);assert.equal(ls.choose(a,'up',scores,{consensus:false}).best,'left');
 a.results.left.members=Array(3).fill(member(.8,.6,.5));assert.equal(ls.choose(a,'up',scores).best,'left');
 a.results.left.members=Array(3).fill(member(.7,.6,.5));assert.equal(ls.choose(a,'up',scores).changed,false);
});
test('incomplete model roots, wrong shapes, nonfinite weights and unsupported directions cannot select',()=>{
 const model=zeroModel();model.members[0].w1[0]=NaN;assert.equal(ls.create(model).available,false);assert.equal(ls.create(null).available,false);
 const a={ok:true,results:{up:{members:Array(3).fill({short:.8,long:.5,tail:.4})}}};assert.equal(ls.choose(a,'up',{up:1000,left:999}).complete,false);
});
test('trained JavaScript predictions match the independent Python golden vectors',()=>{
 const p=root+'/models/v118-survival.json',g=root+'/tests/fixtures/v118-learned-golden.json';assert.ok(fs.existsSync(p)&&fs.existsSync(g),'Train the actual model before release regression');
 const model=ls.create(JSON.parse(fs.readFileSync(p))),embedded=ls.defaultModel();assert.ok(model.available&&embedded.available);
 for(const row of JSON.parse(fs.readFileSync(g))){const x=ls.features(row.board);for(let i=0;i<64;i++)assert.ok(Math.abs(x[i]-row.features[i])<1e-12);
  const y=model.predict(row.board);assert.deepEqual(embedded.predict(row.board),y);for(let i=0;i<3;i++)for(let k=0;k<3;k++)assert.ok(Math.abs(y[i][k]-row.predictions[i][k])<1e-10);
 }
 assert.ok(fs.readFileSync(root+'/2048-ai.html','utf8').includes(fs.readFileSync(root+'/src/learned-survival.js','utf8')));
});
test('long-route guard vetoes a long-horizon regression and rejects incomplete evidence',()=>{
 const m={short:.8,mid:.7,long:.6,area:.6,tail:.5},analysis={ok:true,results:{up:{members:Array(3).fill(m)},left:{members:Array(3).fill({...m,long:.58})},right:{members:Array(3).fill({...m,long:.61,area:.61})}}};
 assert.deepEqual(ls.guard(analysis,'up',['up','left','right']).allowed,['up','right']);
 delete analysis.results.right;assert.deepEqual(ls.guard(analysis,'up',['up','left','right']),{complete:false,allowed:['up']});
});
test('endpoint guard protects joint surviving routes even when more short trajectories survive',()=>{
 const base=[8192,...Array(15).fill(0)],alt=[4096,...Array(15).fill(0)],endpoint=(board,terminal=false)=>({board,terminal});
 const model={available:true,predict:b=>Array.from({length:3},()=>[.9,.8,b[0]===8192?.7:.65])};
 const root=board=>({ok:true,horizon:96,samples:16,lives:Array(16).fill(96),endpoints:Array.from({length:16},()=>endpoint(board))});
 const results={up:root(base),left:root(alt)};
 for(let i=0;i<16;i++)if(i%8<3)results.up.endpoints[i].terminal=true;
 const r=ls.trajectoryGuard(model,results,'up','left');assert.ok(r.complete);assert.equal(r.allowed,false);
 assert.ok(r.evidence.every(e=>e.areaGain>0&&e.longGain>0&&e.jointLongGain<-.005));
 results.left.endpoints=Array.from({length:16},()=>endpoint(base));assert.equal(ls.trajectoryGuard(model,results,'up','left').allowed,true);
 results.left.endpoints.pop();assert.equal(ls.trajectoryGuard(model,results,'up','left').complete,false);
});
test('nonfinite primary scores cannot enter either novel decision selector',()=>{
 const m={short:.8,mid:.7,long:.6,area:.6,tail:.5},a={ok:true,results:{up:{members:Array(3).fill(m)},left:{members:Array(3).fill(m)}}};
 assert.equal(ls.choose(a,'up',{up:NaN,left:999}).complete,false);
});
test('long spectrum separates capped survivors and confirmation cannot nominate the second-best discovery',()=>{
 const base=[8192,...Array(15).fill(0)],left=[4096,...Array(15).fill(0)],right=[2048,...Array(15).fill(0)];
 const model={available:true,predict:b=>Array.from({length:3},()=>[.9,.8,b[1]===2?.15:b[0]===8192?.2:b[0]===4096?.4:.35])};
 const mk=board=>({ok:true,horizon:96,samples:16,lives:Array(16).fill(96),endpoints:Array.from({length:16},()=>({board:board.slice(),terminal:false}))}),results={up:mk(base),left:mk(left),right:mk(right)},scores={up:1000,left:999,right:999};
 const a=ls.trajectoryChoose(model,results,'up',scores);assert.equal(a.best,'left');assert.equal(a.rule,'long-spectrum');
 for(let p=8;p<16;p++)results.left.endpoints[p].board[1]=2;
 const b=ls.trajectoryChoose(model,results,'up',scores);assert.equal(b.proposed,'left');assert.equal(b.best,'up');assert.ok(b.evidence.right.banks.every(x=>x.passed));
});
test('visible endpoint switch stores only its setting and isolates its policy from the immediate guard',async()=>{
 const h=uiHarness();try{
  h.hook.set({board:[8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,2,0,0]},'god');
  const board=JSON.stringify(h.hook.state().board),cf=h.ids.get('counterfactualToggle'),box=h.ids.get('trajectoryToggle');cf.checked=true;cf.onchange();box.checked=true;box.onchange();
  assert.equal(h.store.get('refined2048-learned-trajectory-v118'),'on');assert.equal(JSON.stringify(h.hook.state().board),board);h.hook.askAI();
  const sent=h.workers.flatMap(w=>w.sent).find(m=>m.type==='analyze');assert.equal(sent.policyOptions.learnedTrajectory,true);assert.equal(sent.policyOptions.trajectoryEscape,true);assert.equal(sent.policyOptions.trajectoryAssetGuard,true);assert.equal(sent.policyOptions.learnedGuard,false);
 }finally{await h.close();}
});
test('published native coordinator executes the trained critic on all legal roots without changing main scores or depth',async()=>{
 const c=await client('current',{coordinator:true});let checked=0;
 try{for(const s of require('./fixtures/late-game/manifest.json').checkpoints){
  const off=await c.request({type:'analyze',board:s.game.board,strength:'god',policyOptions:{learnedSurvival:false,counterfactual:false,learnedGuard:false}});
  const on=await c.request({type:'analyze',board:s.game.board,strength:'god',policyOptions:{learnedSurvival:true,counterfactual:false,learnedGuard:false}});
  assert.deepEqual(on.scores,off.scores);assert.equal(on.depth,off.depth);
  if(on.learnedChecked){checked++;assert.equal(on.learned.modelId,JSON.parse(fs.readFileSync(root+'/models/v118-survival.json')).id);assert.deepEqual(Object.keys(on.learned.summary).sort(),Object.keys(on.scores).sort());}
 }assert.ok(checked>0,'actual embedded model was invoked');}
 finally{await c.close();}
});
test('published native long planner evaluates factual simulated endpoints with the embedded model',async()=>{
 const c=await client('current',{coordinator:true}),model=ls.defaultModel();let checked=0;
 try{for(const game of require('../docs/V11_8_DEVELOPMENT.json').rows.filter(r=>r.variant==='cf').slice(0,3)){
  const board=game.changes[0].board,r=await c.request({type:'analyze',board,strength:'god',policyOptions:{counterfactual:true,learnedTrajectory:true,trajectoryPromotion:true}});
  assert.deepEqual(Object.keys(r.scores).sort(),rules.legalRootBranches(board).map(b=>b.dir).sort());assert.ok(Object.values(r.scores).every(Number.isFinite));
  if(r.trajectoryChecked){checked++;assert.equal(r.trajectory.modelId,model.modelId);const results={};for(const [d,ends] of Object.entries(r.trajectory.endpoints))results[d]={...r.plannerResults[d],endpoints:ends};
   const actual=ls.trajectoryGuard(model,results,r.trajectory.baseline,r.trajectory.alternative);assert.deepEqual(actual.evidence,r.trajectory.evidence);assert.deepEqual(actual.endpointScores,r.trajectory.endpointScores);
  }
 }assert.ok(checked>0,'native endpoint critic was actually invoked');}
 finally{await c.close();}
});
test('missing trained critic cannot overrule a veto through strong or phase arbitration',async()=>{
 const game=require('../docs/V11_8_ARBITRATED_DEVELOPMENT.json').rows.find(r=>r.checkpoint==='seed-2'),board=game.changes.find(x=>x.trajectoryEscaped).board;
 const c=await client('current',{coordinator:true,transformCoordinator:s=>s.replace(/\/\/ LEARNED_SURVIVAL_MODEL_START[\s\S]*?\/\/ LEARNED_SURVIVAL_MODEL_END/,'// LEARNED_SURVIVAL_MODEL_START\nconst LEARNED_SURVIVAL_MODEL=null;\n// LEARNED_SURVIVAL_MODEL_END')});
 try{
  const a=await c.request({type:'analyze',board,strength:'god',policyOptions:{counterfactual:false,learnedTrajectory:false}}),b=await c.request({type:'analyze',board,strength:'god',policyOptions:{counterfactual:true,learnedTrajectory:true,trajectoryEscape:true,trajectoryAssetGuard:true}});
  assert.deepEqual(a.scores,b.scores);assert.equal(a.depth,b.depth);assert.equal(a.best,b.best);assert.equal(b.plannerChanged,false);assert.equal(b.trajectoryChecked,false);assert.equal(b.trajectoryEscaped,false);assert.equal(b.trajectory.complete,false);
 }finally{await c.close();}
});

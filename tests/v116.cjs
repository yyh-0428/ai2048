'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {root,rules,rng,uiHarness}=require('./harness.cjs'),{client}=require('./clients-v10.cjs');
const {randomStream}=require('../tools/late-game.cjs'),save=require('../src/session.js');
const source=fs.readFileSync(root+'/src/coordinator.js','utf8');
function setup(){
  const output=[],sent=[],slots=Array.from({length:4},()=>({port:{postMessage:m=>sent.push(m)},ready:true,busy:false,wasm:true,v102:true}));
  const c={Game2048:rules,performance,postMessage:m=>output.push(m),onmessage:null};vm.createContext(c);
  const i=source.lastIndexOf('})();');vm.runInContext(source.slice(0,i)+`globalThis.hook={canonicalRoot,mobility,policyChoice,ceilingRefine,riskComplete,tieBreak,set(j){job=j;slots=globalThis.testSlots;}};`+source.slice(i),c);c.testSlots=slots;
  return {hook:c.hook,output,sent,slots};
}
const ranked=(up,left,depth)=>[{dir:'up',score:up,ok:true,depth,engine:'wasm64'},{dir:'left',score:left,ok:true,depth,engine:'wasm64'}];
function consensusJob(){
  const d4=ranked(1000,999.8,4),d5=ranked(1000,999,5);
  return {id:1,revision:1,cfg:{v102:true,profile:'extreme',coreDepth:5,budget:58,policyConsensus:true},
    branches:[{dir:'up',gain:0,board:Array(16).fill(2)},{dir:'left',gain:32,board:Array(16).fill(4)}],
    depth:5,lastComplete:d5,ceilingStage:5,ceilingBase:{complete:d4,depth:4,best:'up',policyBest:'left'},spentBudget:0};
}
test('late corpus contains eight distinct reachable ~170k games and exact RNG states',()=>{
  const corpus=require('./fixtures/late-game/manifest.json');assert.equal(corpus.checkpoints.length,8);
  const boards=new Set();let holdout=0;
  for(const s of corpus.checkpoints){
    const parsed=save.decode(fs.readFileSync(root+'/tests/fixtures/late-game/'+s.id+'.json','utf8'));
    assert.deepEqual(parsed,s.game);assert.ok(parsed.score>=170000&&parsed.score<180000);assert.ok(rules.legalRootBranches(parsed.board).length);
    assert.equal(parsed.board.reduce((a,v)=>a+v,0),s.reachability.spawnMass);
    assert.equal(parsed.board.reduce((a,v)=>a+(v?v*Math.log2(v):0),0)-s.reachability.spawnPotential,parsed.score);
    assert.equal(s.random.draws,2*(parsed.moveCount+2));assert.equal(s.random.state,(s.random.seed+Math.imul(s.random.draws,0x6D2B79F5))>>>0);
    boards.add(rules.canonicalAI(parsed.board).board.join(','));holdout+=s.split==='holdout';
  }
  assert.equal(boards.size,8);assert.equal(holdout,3);
});
test('RNG checkpoints resume the original stream rather than restarting its seed',()=>{
  const a=randomStream(137),b=rng(137);for(let i=0;i<1000;i++)assert.equal(a(),b());
  const s=a.snapshot(),resumed=randomStream(s.seed,s.state,s.draws);
  for(let i=0;i<1000;i++){const next=b();assert.equal(a(),next);assert.equal(resumed(),next);}
  assert.deepEqual(resumed.snapshot(),a.snapshot());
});
test('allocation-light canonical roots and mobility preserve transforms, ties and wide values',()=>{
  const s=setup(),random=rng(116),boards=[...require('./fixtures/positions.json'),Array(16).fill(0),Array(16).fill(2)];
  for(const p of require('./fixtures/late-game/manifest.json').checkpoints)for(let t=0;t<8;t++)boards.push(rules.transformBoard(p.game.board,t));
  for(let n=0;n<5000;n++)boards.push(Array.from({length:16},()=>random()<.3?0:2**(1+Math.floor(random()*31))));
  for(const b of boards){assert.deepEqual(JSON.parse(JSON.stringify(s.hook.canonicalRoot(b))),rules.canonicalAI(b));assert.equal(s.hook.mobility(b),rules.legalRootBranches(b).length);}
});
test('reusing legal branches preserves the frozen rule configuration, including overflow boundaries',()=>{
  const html=fs.readFileSync(root+'/tests/fixtures/v11.5.html','utf8'),old=html.match(/<script id="ai-coordinator-source" type="text\/plain">([\s\S]*?)<\/script>/)[1];
  const c={performance,postMessage(){},onmessage:null};vm.createContext(c);vm.runInContext(old+';globalThis.legacyRules=Game2048;',c);
  const boards=[...require('./fixtures/positions.json'),[16384,16384,...Array(14).fill(0)],[32768,...Array(15).fill(0)],[65536,...Array(15).fill(0)]];
  for(const board of boards)for(const mode of ['fast','strong','extreme'])assert.deepEqual(rules.config(board,mode,rules.legalRootBranches(board)),JSON.parse(JSON.stringify(c.legacyRules.config(board,mode))));
});
test('raw d4/d5 agreement cannot hide a different final merge-stabilized choice',()=>{
  const s=setup(),j=consensusJob();s.hook.set(j);
  assert.equal(s.hook.policyChoice(j,j.ceilingBase.complete.reduce((o,r)=>(o[r.dir]=r.score,o),{})),'left');
  assert.equal(s.hook.ceilingRefine(),true);assert.equal(j.ceilingStage,6);assert.equal(j.policyOnlyCheck,true);
  assert.equal(s.sent.length,2);assert.ok(s.sent.every(m=>m.type==='v102'&&m.depth===6));
  j.lastComplete=ranked(1000,999.8,6);assert.equal(s.hook.ceilingRefine(),false);
  assert.equal(j.ceilingRejected,true);assert.equal(j.cfg.coreDepth,4);assert.equal(j.lastComplete,j.ceilingBase.complete);
});
test('an additional d6 confirmation retains the original complete d5 score and verifier depth',()=>{
  const s=setup(),j=consensusJob(),d5=j.lastComplete;s.hook.set(j);s.hook.ceilingRefine();
  j.lastComplete=ranked(1000,999,6);s.hook.ceilingRefine();assert.equal(j.ceilingConsensus,true);assert.equal(j.policyConfirmed,true);
  assert.equal(j.cfg.coreDepth,5);assert.equal(j.depth,5);assert.equal(j.lastComplete,d5);
});
test('the new guard never skips a d6 round required by the original raw-score consensus',()=>{
  const s=setup(),j=consensusJob();j.lastComplete=ranked(999.8,1000,5);j.branches[0].gain=32;j.branches[1].gain=0;
  j.ceilingBase.policyBest='up';s.hook.set(j);assert.equal(s.hook.ceilingRefine(),true);assert.equal(j.policyOnlyCheck,false);
  j.lastComplete=ranked(999,1000,6);s.hook.ceilingRefine();assert.equal(j.ceilingConsensus,true);assert.equal(j.cfg.coreDepth,6);
});
function terminalJob(){
  const board=[2,4,64,4,512,32,256,8,4,256,1024,4,2,2,4,2048],branches=rules.legalRootBranches(board),floor=Math.fround(.000001);
  return {id:1,revision:1,key:'test',transform:0,cfg:{...rules.config(board,'extreme'),v102:true,profile:'extreme',terminalRescue:true},
    rootBoard:board,branches,lastComplete:branches.map(b=>({dir:b.dir,score:floor,depth:5})),tieBest:'left',started:performance.now(),
    nodes:0,riskNodes:0,verifyNodes:0,discardedNodes:0,discardedRounds:0,riskFallback:false,verified:false,spentBudget:0,activeRiskH:7};
}
test('terminal floor ties use completed positive survival differences even below the ordinary risk gate',()=>{
  const s=setup(),j=terminalJob();s.hook.set(j);const survivals=Object.fromEntries(j.branches.map(b=>[b.dir,b.dir==='right'?.001:0]));
  s.hook.riskComplete({ok:true,best:'right',survivals,nodes:10});assert.equal(s.output[0].best,'right');assert.equal(s.output[0].terminalRescued,true);
  assert.equal(s.output[0].rescueHorizon,7);assert.equal(s.output[0].verified,false);assert.equal(s.sent.length,0);
});
test('partial, non-floor, wide and invalid survival results cannot bypass the normal verifier',()=>{
  for(const kind of ['partial','non-floor','wide','invalid']){
    const s=setup(),j=terminalJob();if(kind==='non-floor')j.lastComplete[0].score=.01;if(kind==='wide')j.cfg.wideValue=true;
    const survivals=Object.fromEntries(j.branches.map(b=>[b.dir,b.dir==='right'?.001:0]));if(kind==='invalid')survivals[j.branches.find(b=>b.dir!=='right').dir]=NaN;
    s.hook.set(j);s.hook.riskComplete({ok:kind!=='partial',best:'right',survivals,nodes:10});
    if(kind==='partial'){assert.equal(s.output.length,0);assert.equal(s.sent[0].horizon,6);s.hook.riskComplete({ok:false,nodes:10});}
    assert.equal(s.output[0].best,'left');assert.equal(s.output[0].terminalRescued,false);
  }
});
test('short value-worker messages retain identical fast/extreme root scores to V11.5',async()=>{
  const old=await client('v11.5',{coordinator:true}),cur=await client('current',{coordinator:true});
  try{for(const board of require('./fixtures/positions.json').filter((_,i)=>i%17===0))for(const strength of ['fast','extreme']){
    const a=await old.request({type:'analyze',board,strength}),b=await cur.request({type:'analyze',board,strength});
    assert.deepEqual(b.scores,a.scores);assert.equal(b.depth,a.depth);if(!b.terminalRescued)assert.equal(b.best,a.best);
  }}finally{await old.close();await cur.close();}
});
test('V11.6 metadata and portable save export agree on the release version',async()=>{
  const html=fs.readFileSync(root+'/tests/fixtures/v11.6.html','utf8'),pkg=JSON.parse(fs.readFileSync(root+'/tests/fixtures/v11.6-package.json','utf8'));
  assert.match(html,/2048 · AI V11\.6/);assert.match(html,/V11\.6 · 全程本地计算/);assert.equal(pkg.version,'11.6.0');
  const h=uiHarness({htmlPath:root+'/tests/fixtures/v11.6.html'});try{h.hook.exportSave();assert.match(h.downloads[0].download,/^2048-v11\.6-/);}finally{await h.close();}
});

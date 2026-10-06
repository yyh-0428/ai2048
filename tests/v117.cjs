'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,rules,rng,uiHarness,scripts}=require('./harness.cjs'),{client}=require('./clients-v10.cjs'),{base,acceptance}=require('../tools/evaluate-v117.cjs');
const source=fs.readFileSync(root+'/src/coordinator.js','utf8');
function setup(input=source){const out=[],sent=[],c={Game2048:rules,performance,postMessage:r=>out.push(r),onmessage:null};vm.createContext(c);const i=input.lastIndexOf('})();');vm.runInContext(input.slice(0,i)+`globalThis.hook={fragility,valueCoreEligible,policyChoice,ceilingRefine,tieBreak,begin,set(j){job=j;slots=[{ready:true,busy:false,wasm:true,v102:true,port:{postMessage:r=>globalThis.sent.push(r)}}];},get(){return job;},setPending(m){pending=m;job=null;}};`+input.slice(i),c);c.sent=sent;return {h:c.hook,out,sent};}
const boards=[
 [2,0,4,0,0,4,2,4,1024,256,64,4,8192,4096,2048,128],
 [16384,32,8,4,128,8,4,2,8,4,0,2,4,2,0,0],
 [8192,4096,512,64,2048,1024,128,4,0,2,8,4,0,0,2,4],
 [0,4,8,64,0,4,16,2048,2,2,128,4096,0,2,1024,8192]
];
test('explicit rollback retains stable complete scores, depth and actual direction at four regressions',async()=>{
 const old=await client('v11.5',{coordinator:true}),cur=await client('current',{coordinator:true});try{for(const board of boards){const a=await old.request({type:'analyze',board,strength:'god'}),b=await cur.request({type:'analyze',board,strength:'god',policyOptions:base});assert.deepEqual(b.scores,a.scores);assert.equal(b.depth,a.depth);assert.equal(b.best,a.best);assert.equal(b.policyConsensusGuard,false);assert.equal(b.terminalRescued,false);}}finally{await old.close();await cur.close();}
});
test('fallback candidate repairs four first choices using full d5 without a false consensus certificate',async()=>{
 const old=await client('v11.5',{coordinator:true}),cur=await client('current',{coordinator:true});try{for(const board of boards){const a=await old.request({type:'analyze',board,strength:'god'}),b=await cur.request({type:'analyze',board,strength:'god',policyOptions:{...base,policyConsensus:true,fallbackConsensus:true}});assert.deepEqual(b.scores,a.scores);assert.equal(b.depth,5);assert.equal(b.best,a.best);assert.equal(b.policyFallbackRetained,true);assert.equal(b.ceilingEvidenceRejected,true);assert.equal(b.ceilingConsensus,false);}}finally{await old.close();await cur.close();}
});
test('supported d4 fallback remains intact at winning seed-3 first difference',async()=>{
 const board=[0,0,4,2,2,4,8,4,4096,1024,16,4,8192,2048,16,2];
 // The exact reproduced diagnostic board is read when development data exists.
 const f=root+'/docs/V11_7_FIRST_DIVERGENCES.json',b=fs.existsSync(f)?JSON.parse(fs.readFileSync(f)).rows.find(r=>r.checkpoint==='seed-3').game.board:board;
 const old=await client('v11.6',{coordinator:true}),cur=await client('current',{coordinator:true});try{const a=await old.request({type:'analyze',board:b,strength:'god'}),r=await cur.request({type:'analyze',board:b,strength:'god',policyOptions:{...base,policyConsensus:true,fallbackConsensus:true,terminalRescue:true}});assert.equal(r.best,a.best);assert.deepEqual(r.scores,a.scores);assert.equal(r.depth,a.depth);}finally{await old.close();await cur.close();}
});
test('experiment flags isolate result cache and reject unrecognized or non-boolean overrides',async()=>{
 const c=await client('current',{coordinator:true});try{const b=boards[0];const a=await c.request({type:'analyze',board:b,strength:'god'}),r=await c.request({type:'analyze',board:b,strength:'god',policyOptions:base});assert.equal(!!r.cached,false);assert.notEqual(a.best,r.best);const again=await c.request({type:'analyze',board:b,strength:'god',policyOptions:{...base,unknown:true}});assert.equal(again.cached,true);const malformed=await c.request({type:'analyze',board:b,strength:'god',policyOptions:{policyConsensus:'false'}});assert.equal(malformed.policyConsensusGuard,true);assert.equal(malformed.best,a.best);}finally{await c.close();}
});
test('merge-preference ablation preserves complete scores and depth but exposes a different raw choice',async()=>{
 const c=await client('current',{coordinator:true});try{const a=await c.request({type:'analyze',board:boards[1],strength:'god',policyOptions:base}),b=await c.request({type:'analyze',board:boards[1],strength:'god',policyOptions:{...base,mergePreference:false}});assert.deepEqual(a.scores,b.scores);assert.equal(a.depth,b.depth);assert.notEqual(a.best,b.best);assert.equal(!!b.cached,false);}finally{await c.close();}
});
function oldFragility(src,dir){const b=rules.moveBoardPlain(src,dir).board,empty=[];for(let i=0;i<16;i++)if(!b[i])empty.push(i);let dead=0,forced=0,tight=0,minMoves=4;for(const i of empty)for(const [v,p] of [[2,.9],[4,.1]]){b[i]=v;const n=rules.legalRootBranches(b).length,q=p/empty.length;b[i]=0;minMoves=Math.min(minMoves,n);if(!n)dead+=q;if(n<=1)forced+=q;if(n<=2)tight+=q;}return {dead,forced,tight,minMoves};}
test('allocation reductions preserve all spawn probabilities and never mutate reused root boards',()=>{
 const {h}=setup(),random=rng(117),corpus=[...boards,...require('./fixtures/positions.json')];for(let n=0;n<300;n++)corpus.push(Array.from({length:16},()=>random()<.3?0:2**(1+Math.floor(random()*31))));
 for(const board of corpus){const branches=rules.legalRootBranches(board),snapshot=JSON.stringify(branches);for(const b of branches)assert.deepEqual(JSON.parse(JSON.stringify(h.fragility(board,b.dir,branches))),oldFragility(board,b.dir));assert.equal(JSON.stringify(branches),snapshot);}
});
test('integer power validation and clz packing match frozen implementation across limits and invalid tiles',()=>{
 const html=fs.readFileSync(root+'/tests/fixtures/v11.6.html','utf8'),old=scripts(html).worker,cur=fs.readFileSync(root+'/src/worker.js','utf8');
 const get=s=>{const a=s.indexOf('function packValue4('),b=s.indexOf('\nasync function v102Exact',a);return vm.runInNewContext(s.slice(a,b)+';packValue4');},a=get(old),b=get(cur),{h}=setup(),random=rng(711);
 const corpus=[...boards,[32768,32768,...Array(14).fill(0)],[65536,...Array(15).fill(0)],[32768,...Array(15).fill(0)]];for(let i=0;i<1000;i++)corpus.push(Array.from({length:16},()=>random()<.3?0:2**(1+Math.floor(random()*16))));for(const v of [-1,1,3,NaN,Infinity,.5,2**31])corpus.push([v,...Array(15).fill(0)]);
 for(const board of corpus){for(let d=2;d<=6;d++)assert.equal(JSON.stringify(b(board,d)),JSON.stringify(a(board,d)));const oldEligible=board.length===16&&board.every(v=>v===0||(v>=2&&v<=32768&&Number.isInteger(Math.log2(v))&&v===2**Math.log2(v)))&&board.reduce((s,v)=>s+v,0)+24<65536;assert.equal(h.valueCoreEligible(board),oldEligible);}
});
function job(){return {id:1,cfg:{profile:'extreme',v102:true,coreDepth:6,policyConsensus:true,fallbackConsensus:true},branches:[{dir:'up',gain:0},{dir:'left',gain:32}],lastComplete:[{dir:'up',score:999,ok:true,depth:6},{dir:'left',score:1000,ok:true,depth:6}],policyOnlyCheck:true,ceilingStage:6,ceilingBest5:'up',ceilingPolicy5:'up',policyRound5:[{dir:'up',score:1000,ok:true,depth:5},{dir:'left',score:999,ok:true,depth:5}],ceilingBase:{depth:4,best:'up',policyBest:'left',complete:[{dir:'up',score:1000,ok:true,depth:4},{dir:'left',score:999.8,ok:true,depth:4}]}};}
test('dual-agreement fallback keeps evidence status distinct from consensus',()=>{const {h}=setup(),j=job();h.set(j);h.ceilingRefine();assert.equal(j.lastComplete,j.policyRound5);assert.equal(j.depth,5);assert.equal(j.policyFallbackRetained,true);assert.equal(!!j.ceilingConsensus,false);});
test('a genuinely supported full d4 fallback is restored with matching depth',()=>{const {h}=setup(),j=job();j.lastComplete=[{dir:'up',score:1000,ok:true,depth:6},{dir:'left',score:999.8,ok:true,depth:6}];h.set(j);h.ceilingRefine();assert.equal(j.lastComplete,j.ceilingBase.complete);assert.equal(j.depth,4);assert.equal(j.ceilingRejected,true);assert.equal(!!j.policyFallbackRetained,false);});
test('original raw disagreement remains governed by original consensus',()=>{const {h}=setup(),j=job();j.policyOnlyCheck=false;h.set(j);h.ceilingRefine();assert.equal(j.lastComplete,j.ceilingBase.complete);assert.equal(!!j.policyFallbackRetained,false);});
function metricRows(moves,v){return moves.map((n,i)=>({checkpoint:'i'+i,variant:v,repeat:0,additionalMoves:n,score:170000+n*20,maxTile:16384,terminal:true,split:'independent-v117',start:{game:{board:[i],score:170000},random:{seed:i,state:i,draws:0}}}));}
test('precommitted gates reject mean-only improvement, early deaths, known starts and repeat-count inflation',()=>{
 const baseline=Array(20).fill(4000),bad=[...Array(11).fill(2000),...Array(9).fill(10000)];let rows=[...metricRows(baseline,'stable'),...metricRows(baseline,'v116'),...metricRows(bad,'fallback')];assert.equal(acceptance(rows).passed,false);assert.equal(acceptance(rows).against.stable.checks.median,false);
 const good=[...metricRows(baseline,'stable'),...metricRows(baseline,'v116'),...metricRows(Array(20).fill(5000),'fallback')];assert.equal(acceptance(good).passed,true);assert.equal(acceptance(good.map(r=>({...r,checkpoint:'same'}))).passed,false);assert.equal(acceptance(good.map(r=>({...r,split:'known-development'}))).passed,false);assert.equal(acceptance(good.map(r=>({...r,terminal:false}))).passed,false);
 rows=[...metricRows(baseline,'stable'),...metricRows(baseline,'v116'),...metricRows([1,...Array(19).fill(6000)],'fallback')];assert.equal(acceptance(rows).against.stable.checks.earlyDeath,false);
});
test('offline release embeds final coordinator, rules, worker and both external WASM modules',()=>{
 const html=fs.readFileSync(root+'/2048-ai.html','utf8'),s=scripts(html),inert=x=>x.replace(/<\/script/gi,'<\\/script');assert.equal(s.worker.trim(),inert(fs.readFileSync(root+'/src/worker.js','utf8')).trim());const c=html.match(/<script id="ai-coordinator-source" type="text\/plain">([\s\S]*?)<\/script>/)[1].trim();assert.equal(c,inert(fs.readFileSync(root+'/src/rules.js','utf8')+'\n'+fs.readFileSync(root+'/src/counterfactual.js','utf8')+'\n'+fs.readFileSync(root+'/src/learned-survival.js','utf8')+'\n'+source).trim());
 for(const [name,file] of [['V102_WASM_B64','v102_ai.wasm'],['SURVIVAL_WASM_B64','survival_v9_1.wasm']])assert.deepEqual(Buffer.from(s.worker.match(new RegExp("const "+name+"='([^']+)'") )[1],'base64'),fs.readFileSync(root+'/'+file));assert.match(html,/2048 · AI V11\.8/);assert.equal(require('../package.json').version,'11.8.0');
 const frozen=fs.readFileSync(root+'/tests/fixtures/v117-release-engine.html','utf8');assert.equal(scripts(frozen).worker,scripts(fs.readFileSync(root+'/tests/fixtures/v11.7.html','utf8')).worker); // Historical V11.7 engine is immutable, not the new release.
});
test('V11.7 portable export retains legacy save format and persistent storage key',async()=>{const h=uiHarness();try{h.hook.exportSave();assert.match(h.downloads[0].download,/^2048-v11\.8-/);const ui=fs.readFileSync(root+'/src/ui.js','utf8'),old=scripts(fs.readFileSync(root+'/tests/fixtures/v11.6.html','utf8')).ui;const keys=s=>[...s.matchAll(/(?:KEY|Key|key)\s*=\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);assert.deepEqual(keys(ui),keys(old));assert.ok(scripts(fs.readFileSync(root+'/tests/fixtures/v11.6.html','utf8')).ui.includes(fs.readFileSync(root+'/src/session.js','utf8').trim()));}finally{await h.close();}});
test('new independent corpus contains twenty distinct reachable nonterminal starts and complete RNG states',()=>{
 const f=root+'/tests/fixtures/late-game-v117/manifest.json';assert.ok(fs.existsSync(f),'Generate independent corpus before final regression');const m=JSON.parse(fs.readFileSync(f));assert.ok(m.complete);assert.equal(m.checkpoints.length,20);const known=new Set(require('./fixtures/late-game/manifest.json').checkpoints.map(s=>rules.canonicalAI(s.game.board).board.join(','))),seen=new Set();
 for(const s of m.checkpoints){assert.equal(s.split,'independent-v117');const key=rules.canonicalAI(s.game.board).board.join(',');assert.ok(!known.has(key)&&!seen.has(key));seen.add(key);assert.ok(rules.legalRootBranches(s.game.board).length);assert.equal(s.random.draws,2*(s.game.moveCount+2));assert.equal(s.random.state,(s.random.seed+Math.imul(s.random.draws,0x6D2B79F5))>>>0);assert.equal(s.game.board.reduce((a,v)=>a+v,0),s.reachability.spawnMass);assert.equal(s.game.board.reduce((a,v)=>a+(v?v*Math.log2(v):0),0)-s.reachability.spawnPotential,s.game.score);assert.deepEqual(require('../src/session.js').decode(fs.readFileSync(root+'/tests/fixtures/late-game-v117/'+s.id+'.json','utf8')),s.game);}
 assert.equal(m.checkpoints.filter(s=>s.targetScore===170000).length,16);assert.equal(m.checkpoints.filter(s=>s.targetScore===230000).length,4);
});
test('packed root transport exactly preserves core score, depth, nodes and search-cache hits',async()=>{
 const c=await client('current');const random=rng(1717),corpus=[...require('./fixtures/positions.json'),...boards];for(let i=0;i<80;i++)corpus.push(Array.from({length:16},()=>random()<.3?0:2**(1+Math.floor(random()*12))));
 try{for(const board of corpus)for(const branch of rules.legalRootBranches(board))for(const depth of [3,4,5,6]){
  if(branch.board.some(v=>v>32768)||branch.board.reduce((s,v)=>s+v,0)+4*depth>=65536)continue;
  let lo=0,hi=0;for(let i=0;i<16;i++){const r=branch.board[i]?Math.log2(branch.board[i]):0;if(i<8)lo|=r<<(4*i);else hi|=r<<(4*(i-8));}
  const a=await c.request({type:'v102',board:branch.board,depth}),b=await c.request({type:'v102',lo:lo>>>0,hi:hi>>>0,depth});assert.ok(a.ok&&b.ok);for(const k of ['score','depth','nodes','cacheHits'])assert.equal(a[k],b[k]);
 }}finally{await c.close();}
});
test('packed transport retains worker unsigned-word, horizon and total-mass rejection',async()=>{
 const c=await client('current');try{for(const task of [{lo:-1,hi:0,depth:3},{lo:2**32,hi:0,depth:3},{lo:1.5,hi:0,depth:3},{lo:0,hi:NaN,depth:3},{lo:0xff,hi:0,depth:6},{lo:0xf,hi:0xf,depth:3},{lo:1,hi:0,depth:7}])assert.equal((await c.request({type:'v102',...task})).ok,false);assert.equal((await c.request({type:'v102',lo:15,hi:0,depth:6})).ok,true);}finally{await c.close();}
});

test('retain-d5 promotion experiment uses every complete d5 root value and reports the restored depth',async()=>{
 const html=fs.readFileSync(root+'/tests/fixtures/v117-retain5-promotion.html','utf8');
 const coordinator=html.match(/<script id="ai-coordinator-source" type="text\/plain">([\s\S]*?)<\/script>/)[1];
 const c=await client('current',{coordinator:true,transformCoordinator:()=>coordinator}),worker=await client('current');
 const board=[2,0,0,4,4,4,2,0,32,8,4,2,1024,2048,4096,8192];
 try{
  const r=await c.request({type:'analyze',board,strength:'god',policyOptions:{...base,actualConsensusPromotion:true}});
  assert.equal(r.actualConsensusPromoted,true);assert.equal(r.depth,5);
  const canonical=rules.canonicalAI(board),scores={};
  for(const b of rules.legalRootBranches(canonical.board)){
   const expected=await worker.request({type:'v102',board:b.board,depth:5});assert.ok(expected.ok);
   scores[rules.inverseTransformDir(b.dir,canonical.t)]=expected.score;
  }
  assert.deepEqual(r.scores,scores);assert.deepEqual(Object.keys(r.scores).sort(),rules.legalRootBranches(board).map(b=>b.dir).sort());
 }finally{await c.close();await worker.close();}
});

test('final default God preserves input V11.6 decisions rather than imposing an unvalidated rollback',async()=>{
 const old=await client('v11.6',{coordinator:true}),cur=await client('current',{coordinator:true});
 try{for(const board of boards){
  const a=await old.request({type:'analyze',board,strength:'god'}),b=await cur.request({type:'analyze',board,strength:'god'});
  assert.deepEqual(b.scores,a.scores);assert.equal(b.depth,a.depth);assert.equal(b.best,a.best);
  assert.equal(b.policyConsensusGuard,true);assert.equal(b.actualConsensusPromoted,false);assert.equal(b.policyFallbackRetained,false);
 }}finally{await old.close();await cur.close();}
});

test('final God-only default correction preserves the complete other-mode engine and root configurations',()=>{
 const html=fs.readFileSync(root+'/tests/fixtures/v117-validation.html','utf8');
 const embedded=html.match(/<script id="ai-coordinator-source" type="text\/plain">([\s\S]*?)<\/script>/)[1];
 const archived=embedded.slice(embedded.indexOf('// V9.4: entry-only'));
 const before="// Default God restores the stable V11.5 policy pending independent gates.\n    const policy={policyConsensus:false,terminalRescue:false,actualConsensusPromotion:false,mergePreference:true,fallbackConsensus:false};";
 const after="// Keep the input V11.6 God policy after every new candidate failed.\n    // Rollback is an explicit experiment, not an unvalidated new default.\n    const policy={policyConsensus:m.strength==='god',terminalRescue:m.strength==='god',actualConsensusPromotion:false,mergePreference:true,fallbackConsensus:false};";
 assert.ok(source.includes('counterfactual:false')); // New God planner is an explicit experiment.
 const a=setup(archived),b=setup(),corpus=[...require('./fixtures/positions.json'),...require('./fixtures/late-game-v117/manifest.json').checkpoints.map(s=>s.game.board)];
 for(const board of corpus)for(const strength of ['fast','strong','extreme']){
  for(const x of [a,b]){x.h.set(null);x.h.setPending({id:7,revision:8,board,strength});x.h.begin();}
  const snapshot=x=>{const j=x.h.get();if(!j)return JSON.parse(JSON.stringify(x.out.at(-1)));const cfg={...j.cfg};for(const k of ['counterfactual','counterfactualConfirm','counterfactualTail','counterfactualScreen','counterfactualMemo','learnedSurvival','learnedConsensus','learnedGuard','learnedTrajectory','trajectoryPromotion','trajectoryEscape','trajectoryAssetGuard'])delete cfg[k];return JSON.parse(JSON.stringify({cfg,branches:j.branches,depth:j.depth,boardKey:j.key.split(':').at(-1)}));};
  assert.deepEqual(snapshot(a),snapshot(b));
 }
});

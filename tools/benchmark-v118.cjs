'use strict';
// Run alone. Measurements include every completed and discarded worker round.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),{root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs');
const {mean,pct,fileHash,write}=require('./evaluate-v117.cjs');
function computeTiming(source){
 const round='function round(phase,tasks){job.phase=phase;',receive="const j=job;\n    if(j.phase==='risk')",finish='cache={key:j.key,value:result};';
 for(const token of [round,receive,finish])assert.ok(source.includes(token),'Timing hook absent: '+token);
 return source.replace(round,'function round(phase,tasks){job.measuredCompute=(job.measuredCompute||0)+Math.max(0,...(job.measuredLanes||[]));job.measuredLanes=slots.map(()=>0);job.phase=phase;')
 .replace(receive,"const j=job;\n    j.measuredLanes[slots.indexOf(slot)]+=r.time||0;\n    if(j.phase==='risk')")
 .replace(finish,'result.computeMs=(j.measuredCompute||0)+Math.max(0,...(j.measuredLanes||[]));'+finish);
}
const stats=a=>({mean:mean(a),median:pct(a,.5),p95:pct(a,.95)});
async function benchmark(){
 const freeze=require('../docs/V11_8_FREEZE.json');assert.equal(fileHash(freeze.html),freeze.htmlSHA256);
 const proposed=[...require('../tests/fixtures/positions.json'),...require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>s.game.board),...require('../tests/fixtures/late-game-v118/manifest.json').checkpoints.map(s=>s.game.board),
  ...require('../docs/V11_8_DEVELOPMENT.json').rows.filter(r=>r.variant==='cf').flatMap(r=>r.changes.slice(0,2).map(x=>x.board))];
 const seen=new Set(),boards=proposed.filter(b=>{const key=rules.canonicalAI(b).board.join(',');if(seen.has(key)||rules.legalRootBranches(b).length<2)return false;seen.add(key);return true;});
 const passes=5,warmup=20,poolSize=4,profiles=['fast','strong','extreme','god-preserved','god-innovation'];
 const file=path.resolve(root,process.env.OUTPUT||'docs/V11_8_LATENCY.json');assert.ok(!fs.existsSync(file),'Use a new OUTPUT to retain measurements');
 const raw='docs/raw-v118/'+path.basename(file,'.json')+'/requests.jsonl';fs.mkdirSync(path.dirname(root+'/'+raw),{recursive:true});assert.ok(!fs.existsSync(root+'/'+raw));
 const out={date:new Date().toISOString(),node:process.version,complete:false,protocol:{poolSize,passes,warmup,boards:boards.length,profiles,order:'A/B alternates by pass+index; extra V11.6 and old budgeted V11.5 strong alternate before/after the primary pair',parallelCPUWorkloads:false,
  search:'Sum of longest worker lane in EACH round, including discarded search, survival, verifier, planner screen, planner and candidate proofs. Learned inference executes in coordinator and is included in coordinatorMs and wallMs.',latency:'Node worker computeMs, coordinatorMs and caller end-to-end wallMs; no browser paint or Mac measurement',speedGate:'All scores/depth/actions identical; median coordinator and wall each >=5% faster; both P95 <=105% baseline'},
  hashes:{script:fileHash('tools/benchmark-v118.cjs'),protocol:fileHash('docs/V11_8_PROTOCOL.json'),html:freeze.htmlSHA256,v117:fileHash('tests/fixtures/v11.7.html'),v116:fileHash('tests/fixtures/v11.6.html'),v115:fileHash('tests/fixtures/v11.5.html')},rawMeasurements:raw,rows:[],summary:{}};
 const previous=process.env.CURRENT_HTML;process.env.CURRENT_HTML=freeze.html;const cs={};
 try{
  for(const v of ['current','v11.7','v11.6','v11.5'])cs[v]=await client(v,{coordinator:true,poolSize,transformCoordinator:computeTiming});
  for(const profile of profiles){
   const mode=profile.startsWith('god-')?'god':profile,policy=profile==='god-innovation'?freeze.policyOptions:{counterfactual:false,learnedSurvival:false,learnedGuard:false,learnedTrajectory:false,trajectoryPromotion:false,trajectoryEscape:false,trajectoryAssetGuard:false};
   const versions=['current','v11.7','v11.6',...(mode==='strong'?['v11.5']:[])];
   for(let i=0;i<warmup;i++)for(const version of versions)await cs[version].request({type:'analyze',board:boards[i%boards.length],strength:mode,policyOptions:version==='current'?policy:undefined});
   for(let pass=0;pass<passes;pass++)for(let index=0;index<boards.length;index++){
    const reverse=(pass+index)%2,order=reverse?['current','v11.7']:['v11.7','current'],extras=versions.filter(v=>!['current','v11.7'].includes(v));
    if(reverse)order.unshift(...extras.slice().reverse());else order.push(...extras);const pair={};
    for(const version of order){
     const begun=performance.now(),r=await cs[version].request({type:'analyze',board:boards[index],strength:mode,policyOptions:version==='current'?policy:undefined});
     assert.ok(!r.cached,'Do not time the result cache');assert.deepEqual(Object.keys(r.scores).sort(),rules.legalRootBranches(boards[index]).map(b=>b.dir).sort());assert.ok(Object.values(r.scores).every(Number.isFinite));
     pair[version]={computeMs:r.computeMs,coordinatorMs:r.time,wallMs:performance.now()-begun,scores:r.scores,depth:r.depth,best:r.best,nodes:r.nodes,engine:r.engine,discardedRounds:r.discardedRounds,plannerChanged:r.plannerChanged,trajectoryEscaped:r.trajectoryEscaped};
     fs.appendFileSync(root+'/'+raw,JSON.stringify({profile,pass,index,version,board:boards[index],...pair[version]})+'\n');
    }
    const a=pair['v11.7'],b=pair.current;out.rows.push({profile,index,pass,board:boards[index],pair,sameScores:JSON.stringify(a.scores)===JSON.stringify(b.scores),sameDepth:a.depth===b.depth,sameMove:a.best===b.best});
    if(index===boards.length-1)write(file,out);
   }
   const rows=out.rows.filter(r=>r.profile===profile),latency=Object.fromEntries(versions.map(v=>[v,Object.fromEntries(['computeMs','coordinatorMs','wallMs'].map(k=>[k,stats(rows.map(r=>r.pair[v][k]))]))])),a=latency['v11.7'],b=latency.current;
   const sameScores=rows.filter(r=>r.sameScores).length,sameDepths=rows.filter(r=>r.sameDepth).length,sameMoves=rows.filter(r=>r.sameMove).length,identicalDecisions=sameScores===rows.length&&sameDepths===rows.length&&sameMoves===rows.length;
   out.summary[profile]={samples:rows.length,sameScores,sameDepths,sameMoves,identicalDecisions,latency,clearSpeedup:identicalDecisions&&b.coordinatorMs.median<=a.coordinatorMs.median*.95&&b.wallMs.median<=a.wallMs.median*.95&&b.coordinatorMs.p95<=a.coordinatorMs.p95*1.05&&b.wallMs.p95<=a.wallMs.p95*1.05};
   write(file,out);console.log(JSON.stringify({profile,summary:out.summary[profile]}));
  }
 }finally{for(const c of Object.values(cs))await c.close();if(previous===undefined)delete process.env.CURRENT_HTML;else process.env.CURRENT_HTML=previous;}
 out.complete=true;out.rawMeasurementsSHA256=fileHash(raw);write(file,out);
}
module.exports={computeTiming};if(require.main===module)benchmark().catch(e=>{console.error(e);process.exitCode=1;});

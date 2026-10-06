'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs');
const {randomStream}=require('./late-game.cjs'),{write,hash,fileHash,addTile,mass,potential,summary,mean,pct}=require('./evaluate-v117.cjs');
// Final independent comparators use the exact older HTML, rather than merely
// a newer engine retaining its policy. Earlier reports retain their true hashes.
const variants={original:{version:'v11.6',strength:'god'},stable:{version:'v11.5',strength:'god'},
  cf:{version:'current',strength:'god',policyOptions:{counterfactual:true}},
  noTail:{version:'current',strength:'god',policyOptions:{counterfactual:true,counterfactualTail:false}},
  noConfirm:{version:'current',strength:'god',policyOptions:{counterfactual:true,counterfactualConfirm:false}},
  learned:{version:'current',strength:'god',policyOptions:{learnedSurvival:true,counterfactual:false}},
  learnedNoConsensus:{version:'current',strength:'god',policyOptions:{learnedSurvival:true,learnedConsensus:false,counterfactual:false}},
  guarded:{version:'current',strength:'god',policyOptions:{learnedSurvival:false,counterfactual:true,learnedGuard:true}},
  hybrid:{version:'current',strength:'god',policyOptions:{learnedSurvival:true,counterfactual:true,learnedGuard:true}},
  trajectory:{version:'current',strength:'god',policyOptions:{counterfactual:true,learnedTrajectory:true}},
  spectrum:{version:'current',strength:'god',policyOptions:{counterfactual:true,learnedTrajectory:true,trajectoryPromotion:true}},
  arbitrated:{version:'current',strength:'god',policyOptions:{counterfactual:true,learnedTrajectory:true,trajectoryEscape:true}},
  phased:{version:'current',strength:'god',policyOptions:{counterfactual:true,learnedTrajectory:true,trajectoryEscape:true,trajectoryAssetGuard:true}},
  off:{version:'current',strength:'god',policyOptions:{counterfactual:false}}};
for(const mode of ['fast','strong','extreme']){
 variants['v116-'+mode]={version:'v11.6',strength:mode};
 variants['current-'+mode]={version:'current',strength:mode};
}
function compactPlanning(p){
 if(!p||p.rule!=='long-spectrum')return p;
 const {guard,...rest}=p;
 return {...rest,evidence:Object.fromEntries(Object.entries(p.evidence).map(([d,e])=>[d,{banks:e.banks,endpointCheck:e.guard.evidence,endpointComplete:e.guard.complete,endpointAllowed:e.guard.allowed}]))};
}
async function play(c,start,spec,log){
 const random=randomStream(start.random.seed,start.random.state,start.random.draws);let board=start.game.board.slice(),score=start.game.score,moves=0;
 const begun=performance.now(),lines=[],times=[],plannerTimes=[],depths={},counts={trajectoryChecked:0,trajectoryVeto:0,trajectoryPromoted:0,trajectoryEscaped:0,trajectoryStageHeld:0,learnedGuardChecked:0,learnedGuardVeto:0,learnedGuardScreened:0,learnedChecked:0,learnedChanged:0,learnedConsensus:0,plannerScreened:0,plannerChecked:0,plannerChanged:0,plannerConfirmed:0,riskAborted:0,verified:0},changes=[];
 let spawnMass=start.reachability.spawnMass,spawnPotential=start.reachability.spawnPotential;
 while(rules.legalRootBranches(board).length){
  const legal=rules.legalRootBranches(board),wall=performance.now(),r=await c.request({type:'analyze',board,strength:spec.strength,policyOptions:spec.policyOptions});
  assert.deepEqual(Object.keys(r.scores).sort(),legal.map(b=>b.dir).sort());assert.ok(Object.values(r.scores).every(Number.isFinite));
  const m=legal.find(b=>b.dir===r.best);assert.ok(m,'legal final action');
  const item={move:moves,score,best:r.best,depth:r.depth,scores:r.scores,nodes:r.nodes,time:r.time,wallMs:performance.now()-wall};
  for(const k of Object.keys(counts)){counts[k]+=+!!r[k];item[k]=!!r[k];}
  if(r.learned){item.learned=r.learned;item.learnedMs=r.learnedMs;}
  if(r.trajectory)item.trajectory=r.trajectory;
  if(r.plannerResults){item.plannerResults=r.plannerResults;item.planning=compactPlanning(r.planning);item.plannerSeed=r.plannerSeed;item.plannerMs=r.plannerMs;plannerTimes.push(r.plannerMs);}
  if(r.plannerChanged||r.learnedChanged)changes.push({move:moves,board:board.slice(),score,random:random.snapshot(),...item});
  board=m.board;score+=m.gain;moves++;const spawn=addTile(board,random);spawnMass+=spawn.value;spawnPotential+=spawn.value*Math.log2(spawn.value);
  assert.equal(mass(board),spawnMass);assert.equal(potential(board)-spawnPotential,score);
  lines.push(JSON.stringify({...item,spawn,random:random.snapshot()}));times.push(r.time);depths[r.depth]=(depths[r.depth]||0)+1;
  if(moves%4000===0)console.log(JSON.stringify({progress:start.id,variant:spec.label,moves,score,counts}));
 }
 const raw=Buffer.from(lines.join('\n')+'\n'),gzip=zlib.gzipSync(raw,{level:9});fs.mkdirSync(path.dirname(log),{recursive:true});fs.writeFileSync(log,gzip);
 return {checkpoint:start.id,split:start.split,start,startScore:start.game.score,startMoves:start.game.moveCount,additionalMoves:moves,totalMoves:start.game.moveCount+moves,
  score,scoreGain:score-start.game.score,maxTile:Math.max(...board),terminal:true,stopReason:'no legal moves',finalBoard:board,finalRandom:random.snapshot(),spawnMass,spawnPotential,
  counts,depths,meanMs:mean(times),p50Ms:pct(times,.5),p95Ms:pct(times,.95),plannerMeanMs:mean(plannerTimes),wallMs:performance.now()-begun,log:path.relative(root,log),logSHA256:hash(gzip),decisionsSHA256:hash(raw),changes};
}
function acceptance(rows,candidate='cf',requiredRepeats=2){
 const own=rows.filter(r=>r.variant===candidate),unique=new Set(own.map(r=>r.checkpoint)).size;
 const repeated=own.length===unique*requiredRepeats&&[...new Set(own.map(r=>r.checkpoint))].every(id=>{
  const group=own.filter(r=>r.checkpoint===id);return group.length===requiredRepeats&&Array.from({length:requiredRepeats},(_,i)=>i).every(i=>group.filter(r=>r.repeat===i).length===1);
 });
 const allComplete=unique>=20&&repeated&&own.every(r=>r.terminal&&r.split==='independent-v118'),against={};
 for(const v of ['original','stable']){
  const others=rows.filter(r=>r.variant===v),a=summary(own),b=summary(others),rat=k=>b[k]?a[k]/b[k]:a[k]?Infinity:1;
  const pairs=[...new Set(own.map(r=>r.checkpoint))].map(id=>({id,candidate:mean(own.filter(r=>r.checkpoint===id).map(r=>r.additionalMoves)),baseline:mean(others.filter(r=>r.checkpoint===id).map(r=>r.additionalMoves))}));
  const gains=pairs.map(p=>p.candidate-p.baseline),leaveOneOut=pairs.map(p=>{const rest=pairs.filter(q=>q.id!==p.id);return mean(rest.map(q=>q.candidate))/mean(rest.map(q=>q.baseline));});
  const pairedEvidence={wins:gains.filter(x=>x>0).length,losses:gains.filter(x=>x<0).length,ties:gains.filter(x=>x===0).length,medianGain:pct(gains,.5),minimumLeaveOneOutMeanRatio:leaveOneOut.length?Math.min(...leaveOneOut):0};
  const checks={paired:own.length===others.length&&own.every(r=>others.some(t=>t.checkpoint===r.checkpoint&&t.repeat===r.repeat&&JSON.stringify(r.start)===JSON.stringify(t.start))),mean:rat('meanAdditionalMoves')>=1.05,
   median:rat('medianAdditionalMoves')>=.98,lowerQuartile:rat('bottomQuartileMean')>=.98,earlyDeath:a.earlyDeathRate<=b.earlyDeathRate,score:rat('meanScore')>=1,tile16384:a.reached16384Rate>=b.reached16384Rate,tile32768:a.reached32768Rate>=b.reached32768Rate,
   pairedMedian:pairedEvidence.medianGain>=0,pairedWins:pairedEvidence.wins>=Math.max(pairedEvidence.losses,Math.ceil(unique*.25)),noSinglePeak:pairedEvidence.minimumLeaveOneOutMeanRatio>=1.02};
  against[v]={passed:allComplete&&Object.values(checks).every(Boolean),checks,candidate:a,baseline:b,pairedEvidence,pairs};
 }
 return {passed:allComplete&&Object.values(against).every(x=>x.passed),uniqueStarts:unique,requiredRepeats,repeated,allComplete,against};
}
async function run({starts,selected,repeats=1,output,candidate='cf'}){
 const signatures=Object.fromEntries(selected.map(v=>[v,{...variants[v],HTMLSHA256:fileHash(variants[v].version==='current'?(process.env.CURRENT_HTML||'2048-ai.html'):'tests/fixtures/'+variants[v].version+'.html')}]));
 const p=path.resolve(root,output),dir=path.join(root,'docs/raw-v118',path.basename(p,'.json'));
 let j={date:new Date().toISOString(),node:process.version,protocol:{driverSHA256:fileHash('tools/evaluate-v118.cjs'),poolSize:4,parallelCPUWorkloads:false,repeats,termination:'no legal moves',pairedBoardAndPRNG:true,selected,startSHA256:hash(JSON.stringify(starts))},signatures,rows:[],complete:false};
 if(fs.existsSync(p)){assert.equal(process.env.RESUME,'1','existing report must be resumed explicitly or choose new output');j=JSON.parse(fs.readFileSync(p));assert.deepEqual(j.signatures,signatures);assert.equal(j.protocol.startSHA256,hash(JSON.stringify(starts)));}
 write(p,j);const cs={};
 try{
  for(const v of selected)cs[v]=await client(variants[v].version,{coordinator:true,poolSize:4});
  for(const v of selected)for(const board of require('../tests/fixtures/positions.json').slice(0,2))await cs[v].request({type:'analyze',board,strength:variants[v].strength,policyOptions:variants[v].policyOptions});
  for(let repeat=0;repeat<repeats;repeat++)for(let i=0;i<starts.length;i++)for(const v of (i+repeat)%2?selected.slice().reverse():selected){
   if(j.rows.some(r=>r.checkpoint===starts[i].id&&r.variant===v&&r.repeat===repeat))continue;
   const row={variant:v,repeat,...await play(cs[v],starts[i],{...variants[v],label:v},path.join(dir,starts[i].id+'-'+v+'-r'+repeat+'.jsonl.gz'))};j.rows.push(row);
   j.summary=Object.fromEntries(selected.map(v=>[v,summary(j.rows.filter(r=>r.variant===v))]));write(p,j);
   console.log(JSON.stringify({completed:j.rows.length,expected:starts.length*selected.length*repeats,id:row.checkpoint,variant:v,moves:row.additionalMoves,score:row.score,maxTile:row.maxTile,counts:row.counts,wallMs:Math.round(row.wallMs)}));
  }
 }finally{for(const c of Object.values(cs))await c.close();}
 j.complete=true;if(selected.includes('original')&&selected.includes('stable'))j.acceptance=acceptance(j.rows,candidate);write(p,j);return j;
}
module.exports={run,play,variants,acceptance};
if(require.main===module)(async()=>{
 const suite=process.argv[2]||'development';let starts,freeze;
 if(suite==='development')starts=require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>({...s,split:'known-v118-development'}));
 else if(suite==='known20')starts=require('../tests/fixtures/late-game-v117/manifest.json').checkpoints.map(s=>({...s,split:'known-v118-development'}));
 else if(suite==='other')starts=require('../tests/fixtures/late-game/manifest.json').checkpoints.filter(s=>['seed-2','seed-4'].includes(s.id)).map(s=>({...s,split:'known-v118-mode-regression'}));
 else if(suite==='validation'){
  freeze=require('../docs/V11_8_FREEZE.json');assert.equal(fileHash(process.env.CURRENT_HTML||'2048-ai.html'),freeze.htmlSHA256);
  assert.deepEqual(variants[freeze.candidate].policyOptions,freeze.policyOptions);
  const manifest=require('../tests/fixtures/late-game-v118/manifest.json');assert.ok(manifest.complete);starts=manifest.checkpoints;
 }
 else throw new Error('Unknown suite');
 if(process.env.STARTS)starts=starts.filter(s=>process.env.STARTS.split(',').includes(s.id));
 const selected=(process.env.VARIANTS||(freeze?'original,stable,'+freeze.candidate:suite==='other'?'v116-fast,current-fast,v116-strong,current-strong,v116-extreme,current-extreme':'original,stable,cf')).split(','),repeats=Number(process.env.REPEATS||(freeze?2:suite==='other'?3:1));
 if(freeze){assert.equal(repeats,2);assert.deepEqual(selected.slice().sort(),['original','stable',freeze.candidate].sort());assert.equal(starts.length,20);}
 await run({starts,selected,repeats,output:process.env.OUTPUT||'docs/V11_8_'+suite.toUpperCase()+'.json',candidate:freeze?.candidate||'cf'});
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
// Run alone: matched boards, warmed four-worker pools, alternating A/B.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),{root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs');
const {base,mean,pct,fileHash,write}=require('./evaluate-v117.cjs');
function computeTiming(s){
 const tokens=['j.spentBudget+=Math.max(...j.roundCosts);','j.verifyNodes+=n;','const j=job;j.riskNodes+=r.nodes||0;','cache={key:j.key,value:result};'];for(const t of tokens)assert.ok(s.includes(t),'Instrumentation missing '+t);
 return s.replace(tokens[0],tokens[0]+'j.measuredCompute=(j.measuredCompute||0)+Math.max(...j.roundCosts);')
 .replace(tokens[1],tokens[1]+'j.measuredCompute=(j.measuredCompute||0)+Math.max(...rs.map(r=>r.time||0));')
 .replace(tokens[2],tokens[2]+'j.measuredCompute=(j.measuredCompute||0)+(r.time||0);')
 .replace(tokens[3],'result.computeMs=j.measuredCompute||0;'+tokens[3]);
}
function boardMessages(s){
 const a=s.indexOf("const message=task.type==='v102'?"),b=s.indexOf('\n      slot.port.postMessage(message);',a);assert.ok(a>=0&&b>a);
 return s.slice(0,a)+"const message=task.type==='v102'?{type:task.type,id:j.id,round:task.round,dir:task.dir,board:task.board,depth:task.depth,hardBudget:task.hardBudget}:{...task,id:j.id};"+s.slice(b);
}
const stats=a=>({mean:mean(a),median:pct(a,.5),p95:pct(a,.95)});
(async()=>{
 const startBoards=require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>s.game.board),fresh=require('../tests/fixtures/late-game-v117/manifest.json').checkpoints.map(s=>s.game.board),diffs=require('../docs/V11_7_FIRST_DIVERGENCES.json').rows.filter(r=>r.game).map(r=>r.game.board);
 const boards=[...require('../tests/fixtures/positions.json').filter(b=>rules.legalRootBranches(b).length>1),...startBoards,...fresh,...diffs],out={date:new Date().toISOString(),node:process.version,
  protocol:{poolSize:4,passes:5,warmup:20,boards:boards.length,order:'sequential primary alternating A/B by index + pass; legacy strong before/after alternates; separate transport pools alternate board/packed A/B',compute:'sum of longest compute lane per search round + verifier max lane + whole survival task (already includes proof), includes discarded work; leaves original budgets unchanged',latency:'computeMs, coordinator result time, caller end-to-end'},
  hashes:{benchmarkScript:fileHash('tools/benchmark-v117.cjs'),protocol:fileHash('docs/V11_7_LATENCY_PROTOCOL.json'),v116:fileHash('tests/fixtures/v11.6.html'),v115:fileHash('tests/fixtures/v11.5.html'),current:fileHash('2048-ai.html')},rows:[],summary:{},complete:false};
 let file=path.join(root,process.env.OUTPUT||'docs/V11_7_LATENCY.json');
 if(fs.existsSync(file))file=file.replace(/\.json$/,'.rerun-'+Date.now()+'.json');
 const rawDir=path.join(root,'docs/raw-v117',path.basename(file,'.json'));fs.mkdirSync(rawDir,{recursive:true});
 const rawFile=path.join(rawDir,'requests.jsonl');assert.ok(!fs.existsSync(rawFile),'Never overwrite latency measurements');
 out.rawMeasurements=path.relative(root,rawFile);out.rawMeasuredRequests=0;
 const record=(profile,index,pass,version,result)=>{fs.appendFileSync(rawFile,JSON.stringify({profile,index,pass,version,board:boards[index],...result})+'\n');out.rawMeasuredRequests++;};
 const profiles=[{label:'fast',mode:'fast'},{label:'strong',mode:'strong'},{label:'extreme',mode:'extreme'},
  {label:'god-v116-policy',mode:'god',options:{...base,policyConsensus:true,terminalRescue:true}},
  {label:'god-stable-policy',mode:'god',oldMode:'extreme',options:base}];
 const cs={};try{for(const v of ['v11.6','current','v11.5'])cs[v]=await client(v,{coordinator:true,poolSize:4,transformCoordinator:computeTiming});
 cs['messages-off']=await client('current',{coordinator:true,poolSize:4,transformCoordinator:s=>computeTiming(boardMessages(s))});
 cs['messages-on']=await client('current',{coordinator:true,poolSize:4,transformCoordinator:computeTiming});
 for(const profile of profiles){
  for(let i=0;i<20;i++)for(const v of ['v11.6','current','messages-off','messages-on',...(profile.mode==='strong'?['v11.5']:[])])await cs[v].request({type:'analyze',board:boards[i],strength:v==='v11.6'?(profile.oldMode||profile.mode):profile.mode,policyOptions:(v==='current'||v==='messages-off'||v==='messages-on')?profile.options:undefined});
  for(let pass=0;pass<5;pass++)for(let i=0;i<boards.length;i++){
   const pair={},order=(pass+i)%2?['current','v11.6']:['v11.6','current'];if(profile.mode==='strong'){if((pass+i)%2)order.unshift('v11.5');else order.push('v11.5');}for(const v of order){
    const begin=performance.now(),r=await cs[v].request({type:'analyze',board:boards[i],strength:v==='v11.6'?(profile.oldMode||profile.mode):profile.mode,policyOptions:(v==='current'||v==='messages-off'||v==='messages-on')?profile.options:undefined});assert.ok(!r.cached,'Do not measure result cache');
    pair[v]={computeMs:r.computeMs||0,coordinatorMs:r.time,wallMs:performance.now()-begin,depth:r.depth,best:r.best,scores:r.scores,nodes:r.nodes,engine:r.engine,projectedRisk:r.projectedRisk,wideValueCore:r.wideValueCore,verified:r.verified,riskAborted:r.riskAborted,riskSkipped:r.riskSkipped,discardedRounds:r.discardedRounds};record(profile.label,i,pass,v,pair[v]);
   }
   for(const v of (pass+i)%2?['messages-on','messages-off']:['messages-off','messages-on']){const begin=performance.now(),r=await cs[v].request({type:'analyze',board:boards[i],strength:profile.mode,policyOptions:profile.options});assert.ok(!r.cached);pair[v]={computeMs:r.computeMs||0,coordinatorMs:r.time,wallMs:performance.now()-begin,depth:r.depth,best:r.best,scores:r.scores,nodes:r.nodes,engine:r.engine};record(profile.label,i,pass,v,pair[v]);}
   const a=pair['v11.6'],b=pair.current;out.rows.push({profile:profile.label,index:i,pass,board:boards[i],empties:rules.countEmpties(boards[i]),maxTile:Math.max(...boards[i]),pair,sameScores:JSON.stringify(a.scores)===JSON.stringify(b.scores),sameDepth:a.depth===b.depth,sameMove:a.best===b.best});if(i===boards.length-1)write(file,out);
  }
  const rows=out.rows.filter(r=>r.profile===profile.label),same=rows.every(r=>r.sameScores&&r.sameDepth&&r.sameMove),all={};
  for(const v of ['v11.6','current','messages-off','messages-on',...(profile.mode==='strong'?['v11.5']:[])])all[v]=Object.fromEntries(['computeMs','coordinatorMs','wallMs'].map(k=>[k,stats(rows.map(r=>r.pair[v][k]))]));
  const a=all['v11.6'],b=all.current;out.summary[profile.label]={samples:rows.length,sameScores:rows.filter(r=>r.sameScores).length,sameDepths:rows.filter(r=>r.sameDepth).length,sameMoves:rows.filter(r=>r.sameMove).length,identicalDecisions:same,latency:all,transportAblation:{identicalDecisions:rows.every(r=>r.pair['messages-off'].depth===r.pair['messages-on'].depth&&r.pair['messages-off'].best===r.pair['messages-on'].best&&JSON.stringify(r.pair['messages-off'].scores)===JSON.stringify(r.pair['messages-on'].scores)),boardMessages:all['messages-off'],packedMessages:all['messages-on']},
   clearSpeedup:same&&b.coordinatorMs.median<=a.coordinatorMs.median*.95&&b.wallMs.median<=a.wallMs.median*.95&&b.coordinatorMs.p95<=a.coordinatorMs.p95*1.05&&b.wallMs.p95<=a.wallMs.p95*1.05};
  write(file,out);console.log(JSON.stringify({profile:profile.label,summary:out.summary[profile.label]}));
 }
 }finally{for(const c of Object.values(cs))await c.close();}out.complete=true;out.rawMeasurementsSHA256=fileHash(out.rawMeasurements);write(file,out);
})().catch(e=>{console.error(e);process.exitCode=1;});

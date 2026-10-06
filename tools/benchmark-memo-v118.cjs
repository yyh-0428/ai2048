'use strict';
// Run alone. Same complete simulations, same one compute worker, warmed A/B.
const fs=require('node:fs'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs'),cf=require('../src/counterfactual.js');
const {write,fileHash,mean,pct}=require('./evaluate-v117.cjs');
(async()=>{
 const boards=[...require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>s.game.board),...require('../docs/V11_8_DEVELOPMENT.json').rows.filter(r=>r.variant==='cf').flatMap(r=>r.changes.slice(0,2).map(x=>x.board))].map(b=>rules.legalRootBranches(rules.canonicalAI(b).board)[0].board);
 const c=await client('current'),rows=[],stats=a=>({median:pct(a,.5),p95:pct(a,.95),mean:mean(a)});
 try{
  for(let i=0;i<12;i++)for(const memo of [false,true])await c.request({type:'counterfactual',board:boards[i%boards.length],options:{...cf.SETTINGS,seed:cf.seed(boards[i%boards.length]),captureEndpoints:true,memo}});
  for(let pass=0;pass<5;pass++)for(let i=0;i<boards.length;i++){
   const pair={};for(const memo of (i+pass)%2?[true,false]:[false,true]){const start=performance.now(),r=await c.request({type:'counterfactual',board:boards[i],options:{...cf.SETTINGS,seed:cf.seed(boards[i]),captureEndpoints:true,memo}});assert.ok(r.ok);pair[memo?'on':'off']={...r,wallMs:performance.now()-start};}
   for(const k of ['horizon','samples','policyDepth','lives','merges','minSpaces','terminalScores','searches','endpoints'])assert.deepEqual(pair.on[k],pair.off[k]);
   rows.push({pass,index:i,board:boards[i],pair,identicalCompleteResults:true});
  }
 }finally{await c.close();}
 const summary=Object.fromEntries(['on','off'].map(v=>[v,Object.fromEntries(['time','wallMs','nodes','simulationCacheHits'].map(k=>[k,stats(rows.map(r=>r.pair[v][k]))]))]));
 write(root+'/docs/V11_8_MEMO_LATENCY.json',{date:new Date().toISOString(),HTMLSHA256:fileHash('2048-ai.html'),scriptSHA256:fileHash('tools/benchmark-memo-v118.cjs'),protocol:{workers:1,parallelCPUWorkloads:false,warmupPairs:12,passes:5,boards:boards.length,order:'alternating A/B by index and pass',scope:'virtual complete96-step simulations only; not whole-game or other-mode speed'},rows,summary,complete:true,
  clearSpeedup:summary.on.time.median<=summary.off.time.median*.95&&summary.on.wallMs.median<=summary.off.wallMs.median*.95&&summary.on.time.p95<=summary.off.time.p95*1.05&&summary.on.wallMs.p95<=summary.off.wallMs.p95*1.05});console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});

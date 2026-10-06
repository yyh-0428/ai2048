'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs'),{replay}=require('./replay-v117.cjs'),{write,variants}=require('./evaluate-v117.cjs');
function diagnostic(source){
 if(!source.includes('function policyChoice(')){
  source=source.replace('  function begin(){',`  function policyChoice(j,scores){const order=orderedScores(scores);if(!order.length)return null;const top=scores[order[0]],den=Math.max(1,Math.abs(top));let pick=j.branches.find(b=>b.dir===order[0]);for(const d of order){const br=j.branches.find(b=>b.dir===d),gap=(top-scores[d])/den;if(gap>=0&&gap<=.0005&&br.gain>pick.gain)pick=br;}return pick.dir;}\n  function begin(){`);
 }
 assert.ok(source.includes('j.lastComplete=rs;'));assert.ok(source.includes('cache={key:j.key,value:result};'));
 return source.replace('j.lastComplete=rs;',`j.lastComplete=rs;\n    if(j.cfg.v102)(j.diagnosticRounds??=[]).push({depth:j.cfg.coreDepth,scores:scoresFor(j),raw:bestOf(scoresFor(j)),policy:policyChoice(j,scoresFor(j))});`)
 .replace('cache={key:j.key,value:result};',`result.diagnostic={transform:j.transform,config:j.cfg,rounds:j.diagnosticRounds,fragility:Object.fromEntries(j.branches.map(b=>[b.dir,fragility(j.rootBoard,b.dir)])),riskResult:j.riskResult,verifyBase:j.verifyBase,verifySafe:j.verifySafe};\n    cache={key:j.key,value:result};`);
}
function crowdedEpisode(states,at){let run=0;for(let i=at;i<states.length;i++){run=states[i].empties<=1?run+1:0;if(run>=5){const k=i-run+1;return {at:k,score:states[k].score,board:states[k].board,states:states.slice(k,k+12)};}}return null;}
function windowStats(states,at,n){const a=states.slice(at,at+n);return {moves:a.length,minEmpties:Math.min(...a.map(r=>r.empties)),singleLegalStates:a.filter(r=>r.legal===1).length,zeroEmptyStates:a.filter(r=>r.empties===0).length,scoreAfter:a.at(-1)?.score,firstStates:a.slice(0,12),tail:a.slice(-6)};}
(async()=>{
 const j=require('../docs/V11_7_DEVELOPMENT.json');assert.ok(j.complete);const out={date:new Date().toISOString(),purpose:'Locate first actual move differences, inspect complete continuations and d4/d5/d6 evidence; not an isolated causal proof of entire trajectory',directions:'top-level scores/best original coordinates; diagnostic rounds canonical coordinates',rows:[]};
 const cs={};try{for(const v of ['stable','v116','fallback'])cs[v]=await client(variants[v].version,{coordinator:true,transformCoordinator:diagnostic});
 for(const id of [...new Set(j.rows.map(r=>r.checkpoint))]){
  const a=j.rows.find(r=>r.checkpoint===id&&r.variant==='stable'),b=j.rows.find(r=>r.checkpoint===id&&r.variant==='v116');const sa=replay(a,true).states,sb=replay(b,true).states;
  let at=-1;for(let i=0;i<Math.min(sa.length,sb.length);i++){assert.deepEqual(sa[i].board,sb[i].board);assert.deepEqual(sa[i].random,sb[i].random);if(sa[i].best!==sb[i].best){at=i;break;}}
  if(at<0){out.rows.push({checkpoint:id,firstDifference:null,stableTerminal:a.additionalMoves,v116Terminal:b.additionalMoves});continue;}
  const board=sa[at].board,responses={};for(const v of ['stable','v116','fallback'])responses[v]=await cs[v].request({type:'analyze',board,strength:'god',policyOptions:variants[v].policyOptions});
  out.rows.push({checkpoint:id,firstDifference:at,game:{board,score:sa[at].score,moveCount:a.startMoves+at},random:sa[at].random,responses,
   stable:{firstFiveCrowded: crowdedEpisode(sa,at),terminalMoves:a.additionalMoves,terminalScore:a.score,next32:windowStats(sa,at,32),next128:windowStats(sa,at,128),terminalTail:a.tail},
   v116:{firstFiveCrowded: crowdedEpisode(sb,at),terminalMoves:b.additionalMoves,terminalScore:b.score,next32:windowStats(sb,at,32),next128:windowStats(sb,at,128),terminalTail:b.tail}});
 }
 }finally{for(const c of Object.values(cs))await c.close();}
 write(path.join(root,'docs/V11_7_FIRST_DIVERGENCES.json'),out);console.log(JSON.stringify(out.rows.map(r=>({start:r.checkpoint,at:r.firstDifference,stable:r.responses?.stable.best,v116:r.responses?.v116.best,fallback:r.responses?.fallback.best}))));
})().catch(e=>{console.error(e);process.exitCode=1;});

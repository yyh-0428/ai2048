'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {root,scripts}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs');
const {write,fileHash}=require('./evaluate-v117.cjs');
(async()=>{
 const old=fs.readFileSync(root+'/tests/fixtures/v118-pilot-b.html','utf8'),oldCoordinator=old.match(/<script id="ai-coordinator-source" type="text\/plain">([\s\S]*?)<\/script>/)[1];
 const corpus=[...require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>s.game.board),...require('../docs/V11_8_PILOT_B.json').rows.flatMap(r=>r.changes.map(c=>c.board))];
 const a=await client('current',{coordinator:true,transformCoordinator:()=>oldCoordinator,transformWorker:()=>scripts(old).worker}),b=await client('current',{coordinator:true}),rows=[];
 try{
  for(let i=0;i<corpus.length;i++){
   const req={type:'analyze',board:corpus[i],strength:'god',policyOptions:{counterfactual:true}},r={};
   for(const v of i%2?['new','old']:['old','new'])r[v]=await (v==='old'?a:b).request(req);
   assert.deepEqual(r.new.scores,r.old.scores);assert.equal(r.new.depth,r.old.depth);assert.equal(r.new.best,r.old.best);
   if(r.new.plannerResults)for(const [d,x] of Object.entries(r.new.plannerResults)){assert.deepEqual(x.lives,r.old.plannerResults[d].lives);assert.equal(x.seed,r.old.plannerResults[d].seed);}
   rows.push({board:corpus[i],scores:r.new.scores,depth:r.new.depth,best:r.new.best,changed:r.new.plannerChanged,screened:r.new.plannerScreened,
    oldMs:r.old.time,newMs:r.new.time,oldPlannerNodes:r.old.plannerNodes,newPlannerNodes:r.new.plannerNodes,decisionIdentical:true});
  }
 }finally{await a.close();await b.close();}
 write(root+'/docs/V11_8_SCREEN_EQUIVALENCE.json',{date:new Date().toISOString(),oldSHA256:fileHash('tests/fixtures/v118-pilot-b.html'),newSHA256:fileHash('2048-ai.html'),rows,passed:true,
  limit:'Known matched boards, not a new strength sample or a warmed P95 speed claim. All main scores/depth/actions and computed scenario lives compared.'});
 console.log('Screen equivalence passed on '+rows.length+' matched boards.');
})().catch(e=>{console.error(e);process.exitCode=1;});

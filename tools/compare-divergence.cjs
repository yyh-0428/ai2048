'use strict';
// Divergence + latency: run each build's DEFAULT god mode on identical late-game boards.
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {root,rules}=require('../tests/harness.cjs');
const {client}=require('../tests/clients-v10.cjs');

const builds=[
 {name:'V11.6', html:'../2048-ai-v11.6/2048-ai.html'},
 {name:'V11.7', html:'../2048-ai-v11.7/2048-ai.html'},
 {name:'V11.7-2', html:'../2048-ai-v11.7 2/2048-ai.html'},
 {name:'V11.8', html:'2048-ai.html'},
 {name:'V11.9', html:'../2048-ai-v11.9/2048-ai-v11.9/2048-ai.html'},
];

(async()=>{
 const m=require('../tests/fixtures/late-game-v117/manifest.json');
 const boards=m.checkpoints.map(c=>({id:c.id,board:c.game.board}));
 const cs={};
 for(const b of builds){
  const prev=process.env.CURRENT_HTML;
  process.env.CURRENT_HTML=b.html;
  cs[b.name]=await client('current',{coordinator:true,poolSize:4});
  if(prev===undefined)delete process.env.CURRENT_HTML;else process.env.CURRENT_HTML=prev;
 }
 const rows=[];
 try{
  for(const {id,board} of boards){
   const res={};
   for(const b of builds){
    const t0=performance.now();
    const r=await cs[b.name].request({type:'analyze',board,strength:'god'});
    res[b.name]={best:r.best,depth:r.depth,nodes:r.nodes,time:r.time,wallMs:performance.now()-t0,scores:r.scores,engine:r.engine};
   }
   const bests=builds.map(b=>res[b.name].best);
   const uniq=[...new Set(bests)];
   rows.push({id,board,agree:uniq.length===1,uniqBests:uniq,res});
   console.log(JSON.stringify({id,agree:uniq.length===1,uniqBests:uniq,bests:bests.join('/'),times:builds.map(b=>Math.round(res[b.name].wallMs)).join('/')}));
  }
 }finally{for(const c of Object.values(cs))await c.close();}
 const fs=require('node:fs');
 fs.writeFileSync(path.join(root,'docs/V11_8_COMPARE_DIVERGENCE.json'),JSON.stringify({date:new Date().toISOString(),builds:builds.map(b=>b.name),rows},null,2)+'\n');
 console.log('agree on all boards:',rows.every(r=>r.agree));
})().catch(e=>{console.error(e);process.exitCode=1;});

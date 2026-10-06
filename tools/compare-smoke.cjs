'use strict';
// Smoke test: load each build's HTML, run one god-mode analyze, report timing.
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
 const board=require('../tests/fixtures/positions.json')[0];
 console.log('board:',JSON.stringify(board));
 for(const b of builds){
  const prev=process.env.CURRENT_HTML;
  process.env.CURRENT_HTML=b.html;
  let c;
  try{
   c=await client('current',{coordinator:true,poolSize:4});
   const t0=performance.now();
   const r=await c.request({type:'analyze',board,strength:'god'});
   const wall=performance.now()-t0;
   console.log(JSON.stringify({name:b.name,ok:true,wallMs:Math.round(wall),time:r.time,depth:r.depth,nodes:r.nodes,best:r.best,scores:r.scores,engine:r.engine}));
  }catch(e){
   console.log(JSON.stringify({name:b.name,ok:false,error:String(e&&e.message||e)}));
  }finally{
   if(c)await c.close();
   if(prev===undefined)delete process.env.CURRENT_HTML;else process.env.CURRENT_HTML=prev;
  }
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

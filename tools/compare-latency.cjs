'use strict';
// Speed comparison: identical boards, warm cache, alternating order, several passes.
const fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {root,rules}=require('../tests/harness.cjs');
const {client}=require('../tests/clients-v10.cjs');
const {mean,pct}=require('./evaluate-v117.cjs');

const configs=[
 {key:'v116',  label:'V11.6 默认神级',        html:'../2048-ai-v11.6/2048-ai.html',              strength:'god'},
 {key:'v117',  label:'V11.7 默认神级',        html:'../2048-ai-v11.7/2048-ai.html',              strength:'god'},
 {key:'v117b', label:'V11.7(2) 默认神级',     html:'../2048-ai-v11.7 2/2048-ai.html',            strength:'god'},
 {key:'v118',  label:'V11.8 默认神级',        html:'2048-ai.html',                                strength:'god'},
 {key:'v118x', label:'V11.8 实验神级(续命仲裁)',html:'2048-ai.html',                              strength:'god',policyOptions:{counterfactual:true,learnedTrajectory:true,trajectoryEscape:true,trajectoryAssetGuard:true}},
 {key:'v119',  label:'V11.9 默认神级',        html:'../2048-ai-v11.9/2048-ai-v11.9/2048-ai.html', strength:'god'},
];
const PASSES=Number(process.env.PASSES||3),WARMUP=Number(process.env.WARMUP||12);

async function mk(cfg){const prev=process.env.CURRENT_HTML;process.env.CURRENT_HTML=cfg.html;try{return await client('current',{coordinator:true,poolSize:4});}finally{if(prev===undefined)delete process.env.CURRENT_HTML;else process.env.CURRENT_HTML=prev;}}

(async()=>{
 const corpus=[...require('../tests/fixtures/positions.json'),
  ...require('../tests/fixtures/late-game-v117/manifest.json').checkpoints.map(c=>c.game.board),
  ...require('../tests/fixtures/late-game/manifest.json').checkpoints.map(c=>c.game.board)]
  .filter(b=>rules.legalRootBranches(b).length>1);
 const seen=new Set(),boards=corpus.filter(b=>{const k=b.join(',');if(seen.has(k))return false;seen.add(k);return true;});
 const clients={};for(const c of configs)if(!clients[c.html])clients[c.html]=await mk(c);
 const rows=[];
 try{
  for(let i=0;i<WARMUP;i++)for(const c of configs)await clients[c.html].request({type:'analyze',board:boards[i%boards.length],strength:c.strength,policyOptions:c.policyOptions});
  for(let pass=0;pass<PASSES;pass++)for(let i=0;i<boards.length;i++){
   const order=(pass+i)%2?[...configs].reverse():[...configs];const rec={pass,index:i,board:boards[i]};
   for(const c of order){
    const t0=performance.now();
    const r=await clients[c.html].request({type:'analyze',board:boards[i],strength:c.strength,policyOptions:c.policyOptions});
    rec[c.key]={wallMs:performance.now()-t0,time:r.time,depth:r.depth,best:r.best,nodes:r.nodes};
   }
   rows.push(rec);
  }
 }finally{for(const c of Object.values(clients))await c.close();}
 const stats=key=>{const a=rows.map(r=>r[key].wallMs);return {samples:a.length,meanMs:mean(a),p50Ms:pct(a,.5),p95Ms:pct(a,.95),maxMs:Math.max(...a)};};
 const summary=Object.fromEntries(configs.map(c=>[c.key,{label:c.label,...stats(c.key)}]));
 // agreement: fraction of boards where all configs pick the same move
 const agree=rows.filter(r=>new Set(configs.map(c=>r[c.key].best)).size===1).length;
 const out={date:new Date().toISOString(),node:process.version,protocol:{boards:boards.length,passes:PASSES,warmup:WARMUP,order:'alternating',mode:'god'},summary,agreeRows:agree,totalRows:rows.length};
 fs.writeFileSync(path.join(root,'docs/V11_8_COMPARE_LATENCY.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify(summary,null,1));
 console.log('same-move rows',agree,'/',rows.length);
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
// Diagnose V11.9: is the early death caused by its new default planners?
const {rules}=require('../tests/harness.cjs');
const {client}=require('../tests/clients-v10.cjs');
const {randomStream,spawn}=require('./late-game.cjs');
const {performance}=require('node:perf_hooks');

const V119='../2048-ai-v11.9/2048-ai-v11.9/2048-ai.html';
const configs=[
 {key:'v119-default',html:V119,policyOptions:undefined,label:'V11.9 默认(三规划器开)'},
 {key:'v119-noPlanners',html:V119,policyOptions:{lifetimePlanner:false,viabilityPlanner:false,reservePlanner:false,mergeTopology:false},label:'V11.9 关闭新规划器'},
];
async function mk(cfg){const prev=process.env.CURRENT_HTML;process.env.CURRENT_HTML=cfg.html;try{return await client('current',{coordinator:true,poolSize:4});}finally{if(prev===undefined)delete process.env.CURRENT_HTML;else process.env.CURRENT_HTML=prev;}}
async function play(c,start,cfg){
 let board=start.game.board.slice(),score=start.game.score,moves=0;const random=randomStream(start.random.seed,start.random.state,start.random.draws);
 while(rules.legalRootBranches(board).length){
  const r=await c.request({type:'analyze',board,strength:'god',policyOptions:cfg.policyOptions});
  const m=rules.moveBoardPlain(board,r.best);board=m.board;score+=m.gain;moves++;spawn(board,random);
 }
 return {moves,score,maxTile:Math.max(...board)};
}
(async()=>{
 const m=require('../tests/fixtures/late-game-v117/manifest.json');
 const id=process.env.START||'seed-601';
 const start=m.checkpoints.find(c=>c.id===id);
 for(const cfg of configs){
  const c=await mk(cfg);const t0=performance.now();
  try{const r=await play(c,start,cfg);console.log(JSON.stringify({id,config:cfg.key,label:cfg.label,...r,wallMs:Math.round(performance.now()-t0)}));}
  finally{await c.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

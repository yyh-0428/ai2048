'use strict';
// Head-to-head: play late-game checkpoints to terminal with each build's god mode.
// Paired board + PRNG stream => every build faces the exact same tile sequence.
const fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {root,rules}=require('../tests/harness.cjs');
const {client}=require('../tests/clients-v10.cjs');
const {randomStream,spawn}=require('./late-game.cjs');
const {mean,pct}=require('./evaluate-v117.cjs');

// Each entry = one (build, policy) configuration under test.
const configs=[
 {key:'v116',  label:'V11.6 默认神级',      html:'../2048-ai-v11.6/2048-ai.html',              strength:'god'},
 {key:'v117',  label:'V11.7 默认神级',      html:'../2048-ai-v11.7/2048-ai.html',              strength:'god'},
 {key:'v117b', label:'V11.7(2) 默认神级',   html:'../2048-ai-v11.7 2/2048-ai.html',            strength:'god'},
 {key:'v118',  label:'V11.8 默认神级',      html:'2048-ai.html',                                strength:'god'},
 {key:'v118x', label:'V11.8 实验神级(续命仲裁)',html:'2048-ai.html',                           strength:'god',policyOptions:{counterfactual:true,learnedTrajectory:true,trajectoryEscape:true,trajectoryAssetGuard:true}},
 {key:'v119',  label:'V11.9 默认神级',      html:'../2048-ai-v11.9/2048-ai-v11.9/2048-ai.html', strength:'god'},
];

const output=process.env.OUTPUT||'docs/V11_8_COMPARE_PLAY.json';
const limit=Number(process.env.MOVE_LIMIT||Infinity);
const ids=process.env.STARTS?process.env.STARTS.split(','):null;

async function makeClient(cfg){
 const prev=process.env.CURRENT_HTML;process.env.CURRENT_HTML=cfg.html;
 try{return await client('current',{coordinator:true,poolSize:4});}
 finally{if(prev===undefined)delete process.env.CURRENT_HTML;else process.env.CURRENT_HTML=prev;}
}

async function play(c,start,cfg){
 let board=start.game.board.slice(),score=start.game.score,moves=0;
 const random=randomStream(start.random.seed,start.random.state,start.random.draws),times=[],depths={};
 let changes=0,lastBest=null;const wallStart=performance.now();
 while(moves<limit){
  const legal=rules.legalRootBranches(board);if(!legal.length)break;
  const t0=performance.now();
  const r=await c.request({type:'analyze',board,strength:cfg.strength,policyOptions:cfg.policyOptions});
  const wall=performance.now()-t0;
  const m=rules.moveBoardPlain(board,r.best);if(!m.moved)throw new Error('Illegal move '+r.best);
  if(lastBest!==null&&lastBest!==r.best)changes++;
  lastBest=r.best;
  board=m.board;score+=m.gain;moves++;spawn(board,random);
  times.push({time:r.time,wall});depths[r.depth]=(depths[r.depth]||0)+1;
  if(moves%500===0)console.log(JSON.stringify({progress:start.id,config:cfg.key,additionalMoves:moves,score,maxTile:Math.max(...board),wallMs:Math.round(performance.now()-wallStart)}));
 }
 return {checkpoint:start.id,config:cfg.key,label:cfg.label,startScore:start.game.score,startMoves:start.game.moveCount,
  score,scoreGain:score-start.game.score,additionalMoves:moves,totalMoves:start.game.moveCount+moves,maxTile:Math.max(...board),
  terminal:!rules.legalRootBranches(board).length,stopReason:moves<limit?'no legal moves':'move limit',finalBoard:board,
  meanWallMs:mean(times.map(t=>t.wall)),p50WallMs:pct(times.map(t=>t.wall),.5),p95WallMs:pct(times.map(t=>t.wall),.95),
  meanSearchMs:mean(times.map(t=>t.time)),totalSearchMs:times.reduce((s,t)=>s+t.time,0),depths,wallMs:performance.now()-wallStart};
}

function summarize(rows){
 if(!rows.length)return null;
 return {games:rows.length,meanScore:mean(rows.map(r=>r.score)),meanGain:mean(rows.map(r=>r.scoreGain)),
  meanAdditionalMoves:mean(rows.map(r=>r.additionalMoves)),medianAdditionalMoves:pct(rows.map(r=>r.additionalMoves),.5),
  minAdditionalMoves:Math.min(...rows.map(r=>r.additionalMoves)),maxAdditionalMoves:Math.max(...rows.map(r=>r.additionalMoves)),
  reached16384:rows.filter(r=>r.maxTile>=16384).length,reached32768:rows.filter(r=>r.maxTile>=32768).length,
  meanWallMs:mean(rows.map(r=>r.wallMs)),meanMsPerMove:rows.reduce((s,r)=>s+r.meanWallMs*r.additionalMoves,0)/Math.max(1,rows.reduce((s,r)=>s+r.additionalMoves,0))};
}

(async()=>{
 const manifest=require('../tests/fixtures/late-game-v117/manifest.json');
 let starts=manifest.checkpoints;if(ids)starts=starts.filter(s=>ids.includes(s.id));
 const file=path.resolve(root,output);
 const report={date:new Date().toISOString(),node:process.version,complete:false,
  protocol:{source:'tests/fixtures/late-game-v117',pairedBoardAndPRNG:true,termination:Number.isFinite(limit)?'move limit or no legal moves':'no legal moves',
   note:'All builds run each checkpoint with the same restored mulberry32 stream; identical tile sequences.',configs:configs.map(c=>({key:c.key,label:c.label,html:c.html,strength:c.strength,policyOptions:c.policyOptions||null}))},rows:[]};
 if(fs.existsSync(file)){if(process.env.RESUME!=='1')throw new Error('output exists; set RESUME=1');const j=JSON.parse(fs.readFileSync(file));report.rows=j.rows;}
 const write=()=>{report.summary=Object.fromEntries(configs.map(c=>[c.key,summarize(report.rows.filter(r=>r.config===c.key))]));fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');};
 const cs={};for(const c of configs){if(!cs[c.html])cs[c.html]=await makeClient(c);}
 try{
  for(let i=0;i<starts.length;i++)for(const ci of i%2?[...configs.keys()].reverse():[...configs.keys()]){
   const cfg=configs[ci];
   if(report.rows.some(r=>r.checkpoint===starts[i].id&&r.config===cfg.key))continue;
   const row=await play(cs[cfg.html],starts[i],cfg);
   report.rows.push(row);write();
   console.log(JSON.stringify({done:report.rows.length,checkpoint:row.checkpoint,config:cfg.key,moves:row.additionalMoves,score:row.score,maxTile:row.maxTile,wallMs:Math.round(row.wallMs),msPerMove:Math.round(row.meanWallMs*10)/10}));
  }
 }finally{for(const c of Object.values(cs))await c.close();}
 report.complete=true;write();console.log('SUMMARY',JSON.stringify(report.summary,null,1));
})().catch(e=>{console.error(e);process.exitCode=1;});

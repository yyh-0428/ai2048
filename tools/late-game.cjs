'use strict';
// Reachable late-game starts, with the exact PRNG state after the last spawn.
// Every comparison restores BOTH the board and the random stream.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {root,rules}=require('../tests/harness.cjs');
const {client}=require('../tests/clients-v10.cjs');
function randomStream(seed,state=seed,draws=0){
  let s=state|0,n=draws;
  const random=()=>{s=s+0x6D2B79F5|0;n++;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
  random.snapshot=()=>({algorithm:'mulberry32',seed,state:s>>>0,draws:n});return random;
}
function spawn(board,random){
  const empty=[];for(let i=0;i<16;i++)if(!board[i])empty.push(i);
  if(!empty.length)throw new Error('No spawn cell');
  const i=empty[Math.floor(random()*empty.length)],v=random()<.9?2:4;board[i]=v;return v;
}
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const pct=(a,p)=>{if(!a.length)return 0;const b=a.slice().sort((x,y)=>x-y),x=(b.length-1)*p,i=Math.floor(x);return b[i]+(b[Math.ceil(x)]-b[i])*(x-i);};
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write=(p,x)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');};
async function checkpoints(seeds,target=170000){
  const dir=path.join(root,'tests/fixtures/late-game'),manifest={format:'2048-late-corpus',version:1,targetScore:target,source:'V11.5 god',sourceHash:sha(path.join(root,'tests/fixtures/v11.5.html')),checkpoints:[],rejected:[]};
  const c=await client('v11.5',{coordinator:true});
  try{for(const seed of seeds){
    const random=randomStream(seed);let board=Array(16).fill(0),score=0,moveCount=0,spawnPotential=0,spawnMass=0;
    for(let i=0;i<2;i++){const v=spawn(board,random);spawnPotential+=v*Math.log2(v);spawnMass+=v;}
    while(score<target&&rules.legalRootBranches(board).length){
      const r=await c.request({type:'analyze',board,strength:'god'}),m=rules.moveBoardPlain(board,r.best);
      if(!m.moved)throw new Error('Illegal move');board=m.board;score+=m.gain;moveCount++;
      const v=spawn(board,random);spawnPotential+=v*Math.log2(v);spawnMass+=v;
      if(moveCount%2000===0)console.log(JSON.stringify({checkpointSeed:seed,moves:moveCount,score}));
    }
    if(score<target){manifest.rejected.push({seed,score,moveCount,reason:'terminal before target'});}
    else{
      const item={id:'seed-'+seed,split:seed<100?'development':'holdout',format:'2048-ai-save',version:1,game:{board,score,moveCount},random:random.snapshot(),reachability:{source:'V11.5 god',spawnPotential,spawnMass,terminal:false}};
      write(path.join(dir,item.id+'.json'),item);manifest.checkpoints.push(item);console.log(JSON.stringify({saved:item.id,score,moveCount,board}));
    }
    write(path.join(dir,'manifest.json'),manifest);
  }}finally{await c.close();}
  return manifest;
}
async function play(c,start,strength,limit=Infinity){
  let board=start.game.board.slice(),score=start.game.score,moves=0,nodes=0,refined=0,verified=0,rescued=0,terminal=false;
  const random=randomStream(start.random.seed,start.random.state,start.random.draws),times=[],wallStart=performance.now(),depths={},tail=[],interventions=[];
  while(moves<limit){
    if(!rules.legalRootBranches(board).length){terminal=true;break;}
    const r=await c.request({type:'analyze',board,strength}),m=rules.moveBoardPlain(board,r.best);
    if(!m.moved)throw new Error('Illegal move: '+r.best);tail.push({board:board.slice(),score,best:r.best,depth:r.depth,scores:r.scores,riskChecked:r.riskChecked,verified:r.verified,terminalRescued:r.terminalRescued,riskVetoed:r.riskVetoed});if(tail.length>24)tail.shift();
    if(r.verified||r.terminalRescued||r.riskVetoed)interventions.push({move:moves,board:board.slice(),score,random:random.snapshot(),best:r.best,verified:r.verified,terminalRescued:r.terminalRescued,riskVetoed:r.riskVetoed,riskGap:r.riskGap,scores:r.scores,verifiedScores:r.verifiedScores,riskConfirmation:r.riskConfirmation});
    board=m.board;score+=m.gain;moves++;spawn(board,random);times.push(r.time);nodes+=r.nodes;refined+=+!!r.ceilingRefined;verified+=+!!r.verified;rescued+=+!!r.terminalRescued;depths[r.depth]=(depths[r.depth]||0)+1;
    if(moves%2000===0)console.log(JSON.stringify({continuing:start.id,strength,additionalMoves:moves,score}));
  }
  return {checkpoint:start.id,split:start.split,strength,startScore:start.game.score,startMoves:start.game.moveCount,score,scoreGain:score-start.game.score,additionalMoves:moves,totalMoves:start.game.moveCount+moves,maxTile:Math.max(...board),terminal,stopReason:terminal?'no legal moves':'move limit',meanMs:mean(times),p50Ms:pct(times,.5),p95Ms:pct(times,.95),searchMs:times.reduce((s,x)=>s+x,0),wallMs:performance.now()-wallStart,nodes,refined,verified,rescued,depths,finalBoard:board,tail,interventions};
}
function summary(rows){return {games:rows.length,complete:rows.every(r=>r.terminal),meanScore:mean(rows.map(r=>r.score)),meanGain:mean(rows.map(r=>r.scoreGain)),meanAdditionalMoves:mean(rows.map(r=>r.additionalMoves)),minScore:rows.length?Math.min(...rows.map(r=>r.score)):0,reached16384:rows.filter(r=>r.maxTile>=16384).length,reached32768:rows.filter(r=>r.maxTile>=32768).length,meanSearchMs:rows.reduce((s,r)=>s+r.searchMs,0)/Math.max(1,rows.reduce((s,r)=>s+r.additionalMoves,0))};}
async function benchmark({versions=['v11.5','current'],modes=['god'],ids=null,limit=Infinity,output='docs/V11_6_LATE_BENCHMARK.json'}={}){
  const manifest=require('../tests/fixtures/late-game/manifest.json'),starts=manifest.checkpoints.filter(s=>!ids||ids.includes(s.id));
  const report={date:new Date().toISOString(),node:process.version,protocol:{targetScore:manifest.targetScore,versions,modes,limit:Number.isFinite(limit)?limit:null,pairedBoardAndPRNG:true,termination:Number.isFinite(limit)?'move limit or no legal moves':'no legal moves',order:'alternating versions, sequential games',limitations:'Finite development and holdout samples; no universal survival guarantee.'},hashes:Object.fromEntries(versions.map(v=>[v,sha(path.join(root,v==='current'?'2048-ai.html':'tests/fixtures/'+v+'.html'))])),rows:[],complete:false};
  const cs=[];for(const v of versions)cs.push(await client(v,{coordinator:true}));
  try{for(const mode of modes)for(let i=0;i<starts.length;i++)for(const vi of i%2?[...versions.keys()].reverse():[...versions.keys()]){
    const row={version:versions[vi],...await play(cs[vi],starts[i],mode,limit)};report.rows.push(row);
    report.summary=Object.fromEntries(modes.map(m=>[m,Object.fromEntries(versions.map(v=>[v,summary(report.rows.filter(r=>r.version===v&&r.strength===m))]))]));
    write(path.join(root,output),report);console.log(JSON.stringify({...row,tail:undefined,finalBoard:undefined,interventions:undefined}));
  }}finally{for(const c of cs)await c.close();}
  report.complete=true;write(path.join(root,output),report);return report;
}
module.exports={randomStream,spawn,checkpoints,play,summary,benchmark};
if(require.main===module)(async()=>{
  const command=process.argv[2]||'compare';
  if(command==='checkpoints')await checkpoints((process.argv[3]||'1,2,3,4,5,101,102,103').split(',').map(Number),Number(process.argv[4]||170000));
  else if(command==='compare')await benchmark({versions:(process.env.VERSIONS||'v11.5,current').split(','),modes:(process.env.MODES||'god').split(','),ids:process.env.STARTS?.split(','),limit:Number(process.env.MOVE_LIMIT||Infinity),output:process.env.OUTPUT||'docs/V11_6_LATE_BENCHMARK.json'});
  else throw new Error('Usage: late-game.cjs checkpoints [seeds] [score] | compare');
})().catch(e=>{console.error(e);process.exit(1);});

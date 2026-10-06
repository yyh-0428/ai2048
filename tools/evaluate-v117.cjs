'use strict';
// Sequential complete games. Timing benchmarks live in benchmark-v117.cjs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs'),{randomStream}=require('./late-game.cjs');
const base={policyConsensus:false,terminalRescue:false,actualConsensusPromotion:false,mergePreference:true,fallbackConsensus:false};
const variants={
 stable:{version:'v11.5',strength:'god'},v116:{version:'v11.6',strength:'god'},release:{version:'current',strength:'god'},
 rescue:{version:'current',strength:'god',policyOptions:{...base,terminalRescue:true}},
 promotion:{version:'current',strength:'god',policyOptions:{...base,actualConsensusPromotion:true}},
 combined:{version:'current',strength:'god',policyOptions:{...base,actualConsensusPromotion:true,terminalRescue:true}},
 fallback:{version:'current',strength:'god',policyOptions:{...base,policyConsensus:true,fallbackConsensus:true}},
 fallbackRescue:{version:'current',strength:'god',policyOptions:{...base,policyConsensus:true,fallbackConsensus:true,terminalRescue:true}},
 v116Policy:{version:'current',strength:'god',policyOptions:{...base,policyConsensus:true,terminalRescue:true}},
 rollback:{version:'current',strength:'god',policyOptions:base},
 rawNoMerge:{version:'current',strength:'god',policyOptions:{...base,mergePreference:false}},
 retain5Promotion:{version:'current',strength:'god',policyOptions:{...base,actualConsensusPromotion:true}}
};
for(const strength of ['fast','strong','extreme'])for(const version of ['v11.6','current'])variants[version+'-'+strength]={version,strength};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const pct=(a,p)=>{if(!a.length)return 0;const b=a.slice().sort((x,y)=>x-y),x=(b.length-1)*p,i=Math.floor(x);return b[i]+(b[Math.ceil(x)]-b[i])*(x-i);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fileHash=p=>hash(fs.readFileSync(path.resolve(root,p)));
const write=(p,x)=>{fs.mkdirSync(path.dirname(p),{recursive:true});const t=p+'.tmp';fs.writeFileSync(t,JSON.stringify(x,null,2)+'\n');fs.renameSync(t,p);};
const mass=b=>b.reduce((s,v)=>s+v,0),potential=b=>b.reduce((s,v)=>s+(v?v*Math.log2(v):0),0);
function addTile(board,random){const empty=[];for(let i=0;i<16;i++)if(!board[i])empty.push(i);assert.ok(empty.length);const index=empty[Math.floor(random()*empty.length)],value=random()<.9?2:4;board[index]=value;return {index,value};}
const flags=['verified','terminalRescued','actualConsensusPromoted','ceilingEvidenceRejected','riskAborted','policyFallbackRetained','ceilingRejected'];
async function play(c,start,variant,logFile){
 const spec=variants[variant],random=randomStream(start.random.seed,start.random.state,start.random.draws);
 let board=start.game.board.slice(),score=start.game.score,moves=0,spawnMass=start.reachability.spawnMass,spawnPotential=start.reachability.spawnPotential,nodes=0;
 const wall=performance.now(),times=[],lines=[],tail=[],interventions=[],depths={},counts=Object.fromEntries(flags.map(k=>[k,0]));
 for(;;){
  const legal=rules.legalRootBranches(board);if(!legal.length)break;
  const r=await c.request({type:'analyze',board,strength:spec.strength,policyOptions:spec.policyOptions});
  assert.deepEqual(Object.keys(r.scores).sort(),legal.map(b=>b.dir).sort(),'all legal roots');assert.ok(Object.values(r.scores).every(Number.isFinite));
  const m=rules.moveBoardPlain(board,r.best);assert.ok(m.moved,'illegal root decision');
  const record={move:moves,score,best:r.best,depth:r.depth,scores:r.scores,nodes:r.nodes,time:r.time,flags:flags.map(k=>!!r[k])};
  tail.push({...record,board:board.slice()});if(tail.length>24)tail.shift();
  if(flags.some(k=>r[k]))interventions.push({...record,board:board.slice(),random:random.snapshot(),riskGap:r.riskGap});
  for(const k of flags)counts[k]+=+!!r[k];depths[r.depth]=(depths[r.depth]||0)+1;
  board=m.board;score+=m.gain;moves++;const spawn=addTile(board,random);spawnMass+=spawn.value;spawnPotential+=spawn.value*Math.log2(spawn.value);
  assert.equal(mass(board),spawnMass);assert.equal(potential(board)-spawnPotential,score);
  lines.push(JSON.stringify({...record,spawn,random:random.snapshot()}));times.push(r.time);nodes+=r.nodes||0;
  if(moves%4000===0)console.log(JSON.stringify({progress:start.id,variant,moves,score}));
 }
 assert.equal(random.snapshot().draws,start.random.draws+2*moves);
 const raw=Buffer.from(lines.join('\n')+(lines.length?'\n':'')),gzip=zlib.gzipSync(raw);fs.mkdirSync(path.dirname(logFile),{recursive:true});fs.writeFileSync(logFile,gzip);
 return {checkpoint:start.id,split:start.split,strength:spec.strength,start,startScore:start.game.score,startMoves:start.game.moveCount,
  additionalMoves:moves,totalMoves:start.game.moveCount+moves,score,scoreGain:score-start.game.score,maxTile:Math.max(...board),terminal:true,stopReason:'no legal moves',
  finalBoard:board,finalRandom:random.snapshot(),spawnMass,spawnPotential,depths,counts,nodes,meanMs:mean(times),p50Ms:pct(times,.5),p95Ms:pct(times,.95),searchMs:times.reduce((s,x)=>s+x,0),wallMs:performance.now()-wall,
  log:path.relative(root,logFile),logSHA256:hash(gzip),decisionsSHA256:hash(raw),tail,interventions};
}
function summary(rows){const moves=rows.map(r=>r.additionalMoves).sort((a,b)=>a-b);return {games:rows.length,uniqueStarts:new Set(rows.map(r=>r.checkpoint)).size,complete:rows.length>0&&rows.every(r=>r.terminal),
 meanAdditionalMoves:mean(moves),medianAdditionalMoves:pct(moves,.5),p25AdditionalMoves:pct(moves,.25),bottomQuartileMean:mean(moves.slice(0,Math.ceil(moves.length/4))),earlyDeaths:rows.filter(r=>r.additionalMoves<1000).length,earlyDeathRate:mean(rows.map(r=>+(r.additionalMoves<1000))),
 meanScore:mean(rows.map(r=>r.score)),medianScore:pct(rows.map(r=>r.score),.5),reached16384:rows.filter(r=>r.maxTile>=16384).length,reached32768:rows.filter(r=>r.maxTile>=32768).length,
 reached16384Rate:mean(rows.map(r=>+(r.maxTile>=16384))),reached32768Rate:mean(rows.map(r=>+(r.maxTile>=32768)))};}
function acceptance(rows,candidate=rows.some(r=>r.variant==='rawNoMerge')?'rawNoMerge':'fallback'){
 const own=rows.filter(r=>r.variant===candidate),n=new Set(own.map(r=>r.checkpoint)).size;
 const allComplete=n>=20&&own.length>=20&&own.every(r=>r.terminal&&r.split==='independent-v117');
 const against={};for(const v of ['stable','v116']){
  const other=rows.filter(r=>r.variant===v),paired=own.length===other.length&&own.every(a=>other.some(b=>a.checkpoint===b.checkpoint&&a.repeat===b.repeat&&JSON.stringify(a.start)===JSON.stringify(b.start)));
  const a=summary(own),b=summary(other),rat=x=>b[x]?a[x]/b[x]:a[x]?Infinity:1;
  const checks={paired,mean:rat('meanAdditionalMoves')>=1.05,median:rat('medianAdditionalMoves')>=.98,lowerQuartile:rat('bottomQuartileMean')>=.98,earlyDeath:a.earlyDeathRate<=b.earlyDeathRate,score:rat('meanScore')>=1,tile16384:a.reached16384Rate>=b.reached16384Rate,tile32768:a.reached32768Rate>=b.reached32768Rate};
  against[v]={checks,passed:allComplete&&Object.values(checks).every(Boolean),ratios:{mean:rat('meanAdditionalMoves'),median:rat('medianAdditionalMoves'),lowerQuartile:rat('bottomQuartileMean'),score:rat('meanScore')},candidate:a,baseline:b};
 }
 return {passed:allComplete&&Object.values(against).every(x=>x.passed),uniqueStarts:n,allComplete,against};
}
async function pauseCheckpoint(phase,count){
 if(process.env.CHECKPOINT_PAUSE!=='1')return;const p=path.join(root,'docs/V11_7_CHECKPOINT_REQUEST.json');write(p,{date:new Date().toISOString(),phase,count});console.log('Checkpoint pause '+phase+' '+count);while(fs.existsSync(p))await new Promise(r=>setTimeout(r,1000));
}
function outputPath(file){const p=path.resolve(root,file);if(!fs.existsSync(p)||process.env.RESUME==='1')return p;return p.replace(/\.json$/,'.rerun-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');}
async function benchmark({starts,selected,repeats,output}){
 const p=outputPath(output),runId=path.basename(p,'.json'),logDir=path.join(root,'docs/raw-v117',runId),cs={};
 const signatures=Object.fromEntries(selected.map(v=>[v,{...variants[v],HTMLSHA256:fileHash(variants[v].version==='current'?(process.env.CURRENT_HTML||'2048-ai.html'):'tests/fixtures/'+variants[v].version+'.html')}]));
 let report={date:new Date().toISOString(),node:process.version,protocol:{termination:'no legal moves',pairedBoardAndPRNG:true,poolSize:4,order:'sequential alternating variants by start and repeat',repeats,selected,startHash:hash(JSON.stringify(starts))},signatures,rows:[],complete:false};
 if(process.env.RESUME==='1'&&fs.existsSync(p)){report=JSON.parse(fs.readFileSync(p));assert.deepEqual(report.signatures,signatures);assert.equal(report.protocol.startHash,hash(JSON.stringify(starts)));assert.equal(report.protocol.repeats,repeats);}
 write(p,report);
 try{
  for(const v of selected)cs[v]=await client(variants[v].version,{coordinator:true,poolSize:4});
  const warm=require('../tests/fixtures/positions.json').slice(0,2);
  for(const v of selected)for(const board of warm)await cs[v].request({type:'analyze',board,strength:variants[v].strength,policyOptions:variants[v].policyOptions});
  for(let repeat=0;repeat<repeats;repeat++)for(let i=0;i<starts.length;i++)for(const v of (i+repeat)%2?selected.slice().reverse():selected){
   if(report.rows.some(r=>r.checkpoint===starts[i].id&&r.variant===v&&r.repeat===repeat))continue;
   const row={variant:v,repeat,...await play(cs[v],starts[i],v,path.join(logDir,`${starts[i].id}-${v}-r${repeat}.jsonl.gz`))};report.rows.push(row);
   report.summary=Object.fromEntries(selected.map(v=>[v,summary(report.rows.filter(r=>r.variant===v))]));write(p,report);
   if(report.rows.length%30===0)await pauseCheckpoint(runId,report.rows.length);
   console.log(JSON.stringify({completed:report.rows.length,expected:starts.length*selected.length*repeats,start:row.checkpoint,variant:v,repeat,moves:row.additionalMoves,score:row.score,maxTile:row.maxTile,wallMs:Math.round(row.wallMs)}));
  }
 }finally{for(const c of Object.values(cs))await c.close();}
 report.complete=true;if((selected.includes('fallback')||selected.includes('rawNoMerge'))&&selected.includes('stable')&&selected.includes('v116'))report.acceptance=acceptance(report.rows);write(p,report);return report;
}
module.exports={base,variants,mean,pct,hash,fileHash,write,mass,potential,addTile,play,summary,acceptance,benchmark,pauseCheckpoint};
if(require.main===module)(async()=>{
 const suite=process.argv[2]||'development';let starts,selected,repeats,output;
 if(suite==='development'){starts=require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>({...s,split:'known-development'}));selected=['stable','v116','rescue','promotion','combined','fallback','fallbackRescue'];repeats=1;output='docs/V11_7_DEVELOPMENT.json';}
 else if(suite==='validation'){const freeze=require('../docs/V11_7_FREEZE.json');process.env.CURRENT_HTML=process.env.CURRENT_HTML||freeze.htmlFile;assert.equal(fileHash(process.env.CURRENT_HTML),freeze.htmlSHA256);starts=require('../tests/fixtures/late-game-v117/manifest.json').checkpoints;assert.equal(starts.length,20);selected=['stable','v116',freeze.candidate];repeats=2;output='docs/V11_7_VALIDATION.json';}
 else if(suite==='other'){const protocol=require('../docs/V11_7_OTHER_PROTOCOL.json');starts=require('../tests/fixtures/late-game/manifest.json').checkpoints.filter(s=>protocol.startIDs.includes(s.id)).map(s=>({...s,split:'known-development'}));selected=['v11.6-fast','current-fast','v11.6-strong','current-strong','v11.6-extreme','current-extreme'];repeats=3;output='docs/V11_7_OTHER_MODES.json';}
 else if(suite==='release'){starts=require('../tests/fixtures/late-game-v117/manifest.json').checkpoints;selected=['release'];repeats=1;output='docs/V11_7_RELEASE.json';}
 else throw new Error('Unknown suite');
 if(process.env.VARIANTS)selected=process.env.VARIANTS.split(',');if(process.env.REPEATS)repeats=Number(process.env.REPEATS);if(process.env.STARTS)starts=starts.filter(s=>process.env.STARTS.split(',').includes(s.id));
 await benchmark({starts,selected,repeats,output:process.env.OUTPUT||output});
})().catch(e=>{console.error(e);process.exitCode=1;});

// V9.4: entry-only finite-horizon survival projection. Never used by scoring.
// Proof scope and prior art: docs/research/THEORY.md and PRIOR_ART.md.
function survivalRanks(board,h){
  const counts=new Uint8Array(32),map=new Uint8Array(32);map[1]=1;map[2]=2;
  for(const r of board)counts[r]++;
  let previous=2,mapped=2,prefix=counts[1]*2+counts[2]*4,mappedPrefix=prefix;
  for(let r=3;r<32;r++)if(counts[r]){
    const massBound=Math.floor(Math.log2(prefix+4*h));
    const bound=Math.min(previous+h,massBound);
    let next;
    if(r>bound){
      const mappedBound=Math.min(mapped+h,Math.floor(Math.log2(mappedPrefix+4*h)));
      next=Math.max(mapped+1,mappedBound+1);
    }else next=mapped+(r-previous);
    map[r]=next;prefix+=counts[r]*2**r;mappedPrefix+=counts[r]*2**next;previous=r;mapped=next;
  }
  return Array.from(board,r=>map[r]);
}
function projectSurvival(board,h){
  if(!Array.isArray(board)||board.length!==16)throw new Error('Expected 16 tile values');
  if(!Number.isInteger(h)||h<1||h>12)throw new RangeError('WASM horizon must be 1..12');
  const ranks=board.map(v=>{
    if(v===0)return 0;const r=Math.log2(v);
    if(!Number.isInteger(r)||r<1||r>31)throw new RangeError('Tiles must be 0 or powers of two from 2 to 2^31');return r;
  });
  const compact=survivalRanks(ranks,h);
  const mass=compact.reduce((s,r)=>s+(r?2**r:0),0)+4*h;
  // Guard BOTH the entry representation and the inherited saturation boundary.
  if(compact.some(r=>r>=15)||mass>=65536)return {eligible:false,reason:'No certified safe 4-bit projection'};
  let lo=0,hi=0;for(let i=0;i<8;i++){lo|=compact[i]<<(4*i);hi|=compact[i+8]<<(4*i);}
  return {eligible:true,lo:lo>>>0,hi:hi>>>0,ranks:compact,changed:compact.some((r,i)=>r!==ranks[i]),maxRank:Math.max(...compact),massBound:mass};
}

// Owns the complete decision. Root workers speak directly through MessagePorts;
// no search round, risk check, or verifier waits for a DOM paint or animation.
(()=>{
  'use strict';
  const {legalRootBranches,inverseTransformDir,countEmpties,moveBoardPlain,config}=Game2048;
  const DIRS=['up','left','right','down'];
  const INVERSE_DIRS=Array.from({length:8},(_,t)=>Object.fromEntries(DIRS.map(d=>[d,inverseTransformDir(d,t)])));
  // Compare transformed views first; allocate only the winning root board.
  // Inverse index maps preserve the original transform order and tie handling.
  const ROOT_MAPS=Array.from({length:8},(_,t)=>{
    const map=new Uint8Array(16);for(let i=0;i<16;i++)map[Game2048.transformCoord(i,t)]=i;return map;
  });
  function canonicalRoot(src){
    let best=0;
    for(let t=1;t<8;t++)for(let i=0;i<16;i++){
      const a=src[ROOT_MAPS[t][i]],b=src[ROOT_MAPS[best][i]];
      if(a===b)continue;if(a>b)best=t;break;
    }
    const board=new Array(16);for(let i=0;i<16;i++)board[i]=src[ROOT_MAPS[best][i]];
    return {board,t:best};
  }
  let slots=[],job=null,pending=null,cache=null;
  const send=x=>postMessage(x);
  const scoresFor=j=>Object.fromEntries(j.branches.map(b=>[b.dir,j.lastComplete.find(r=>r.dir===b.dir).score]));
  // Stable canonical order: ties must never depend on worker arrival order.
  const bestOf=s=>DIRS.filter(d=>Number.isFinite(s[d])).reduce((a,d)=>a===null||s[d]>s[a]?d:a,null);
  const orderedScores=s=>DIRS.filter(d=>Number.isFinite(s[d])).sort((a,b)=>s[b]-s[a]||DIRS.indexOf(a)-DIRS.indexOf(b));
  const relativeGap=s=>{const o=orderedScores(s);if(o.length<2)return Infinity;const top=s[o[0]];return Math.max(0,(top-s[o[1]])/Math.max(1,Math.abs(top)));};
  function policyChoice(j,scores){
    const order=orderedScores(scores);if(!order.length)return null;
    if(j.cfg?.mergePreference===false)return order[0];
    const top=scores[order[0]],den=Math.max(1,Math.abs(top)),limit=j.cfg?.profile==='god'?GOD_TIE_GAP:0.0005;
    let pick=j.branches.find(b=>b.dir===order[0]);
    for(const d of order){const gap=(top-scores[d])/den,br=j.branches.find(b=>b.dir===d);if(gap>=0&&gap<=limit&&br&&br.gain>pick.gain)pick=br;}
    return pick?.dir||order[0];
  }
  const GOD_MAX_DEPTH=6,GOD_CROWD_EMPTIES=7,GOD_BASE_DEPTH=5,GOD_TIE_GAP=0.00005;
  const useV102Core=(strength,baseDepth,forceJS,allV102)=>!forceJS&&allV102&&(strength==='fast'||strength==='strong'||strength==='extreme'||strength==='god'||baseDepth<=4);
  const verifierSpec=(cfg,lastDepth)=>cfg.v102&&cfg.profile==='fast'?{type:'v102',depth:4}
    :cfg.v102&&cfg.profile==='god'?{type:'exact',depth:Math.min(6,Math.max(5,(cfg.coreDepth||4)+2))}
    :{type:'exact',depth:cfg.v102?Math.max(5,(cfg.coreDepth??(cfg.baseDepth-1))+1):lastDepth+1};
  // Use a conservative six-spawn bound for every value-core profile.
  // Never use this eligibility check for the older risk/compatibility kernels.
  function valueCoreEligible(board){
    if(board.length!==16)return false;let mass=0;
    for(const v of board){if(v!==0&&!(Number.isInteger(v)&&v>=2&&v<=32768&&(v&(v-1))===0))return false;mass+=v;}
    return mass+24<65536;
  }
  function begin(){
    if(job||!pending||!slots.length||slots.some(s=>!s.ready||s.busy))return;
    const m=pending;pending=null;
    const canon=canonicalRoot(m.board);
    // V11.7: known boolean experiment options are isolated in the cache.
    // Keep the input V11.6 God policy after every new candidate failed.
    // Rollback is an explicit experiment, not an unvalidated new default.
    const policy={policyConsensus:m.strength==='god',terminalRescue:m.strength==='god',actualConsensusPromotion:false,mergePreference:true,fallbackConsensus:false,counterfactual:false,counterfactualConfirm:true,counterfactualTail:true,counterfactualScreen:true,counterfactualMemo:false,learnedSurvival:false,learnedConsensus:true,learnedGuard:false,learnedTrajectory:false,trajectoryPromotion:false,trajectoryEscape:false,trajectoryAssetGuard:false};
    if(m.strength==='god'&&m.policyOptions)for(const k of Object.keys(policy))if(typeof m.policyOptions[k]==='boolean')policy[k]=m.policyOptions[k];
    const key=m.strength+':'+Object.values(policy).map(Number).join('')+':'+canon.board.join(',');
    if(cache&&cache.key===key){const r={...cache.value,id:m.id,revision:m.revision,cached:true,time:0,nodes:0};return deliver(r,canon.t);}
    const rootEmpties=countEmpties(canon.board),rootMax=Math.max(...canon.board);
    const branches=legalRootBranches(canon.board);
    // Reuse the already enumerated roots without changing config outputs.
    // God keeps the extreme risk budget and adds its late-game policy here.
    const c=config(canon.board,m.strength==='god'?'extreme':m.strength,branches);
    // V11.5: God is survival-first. It intentionally inherits the proven
    // extreme budget/risk profile instead of forcing d5/d6 on nearly every move.
    c.rootEmpties=rootEmpties;c.rootMax=rootMax;
    Object.assign(c,policy);
    // V10.1 fast late-game refinement lives above the frozen rule policy.
    // The light profile's inherited search and risk policy is unchanged.
    if(m.strength==='fast'){
      const e=rootEmpties;
      if(e<=1){c.budget=18;c.maxDepth=Math.max(c.maxDepth,9);c.riskNodes=140000;c.verifyBudget=24;}
      else if(e<=3){c.budget=14;c.maxDepth=Math.max(c.maxDepth,9);c.riskNodes=140000;c.verifyBudget=24;}
      else if(e<=5){c.budget=10;c.maxDepth=Math.max(c.maxDepth,9);c.riskNodes=140000;}
    }
    const eligible=valueCoreEligible(canon.board);
    c.wideValue=c.forceJS&&eligible&&slots.every(s=>s.wasm)&&useV102Core(m.strength,c.baseDepth,false,slots.every(s=>s.v102));
    if(c.wideValue)c.forceJS=false;
    if(!eligible||slots.some(s=>!s.wasm))c.forceJS=true;
    // Strong now also completes native d5 at <=2 empty cells. Its independent
    // survival/verifier layer remains in place, as do unavailable/wide fallbacks.
    c.v102=useV102Core(m.strength,c.baseDepth,c.forceJS,slots.every(s=>s.v102));
    c.profile=m.strength==='god'?'extreme':m.strength;
    c.coreDepth=c.wideValue&&(m.strength==='extreme'||m.strength==='god')?6
      :m.strength==='god'?(rootEmpties<=2?5:4)
      :m.strength==='fast'?3:(m.strength==='strong'||m.strength==='extreme')&&rootEmpties<=2?5:4;
    // JS is a slower compatibility engine: secure a complete result before
    // spending its existing fallback allowance on progressively deeper rounds.
    // The ordinary WASM quality floor and budget are unchanged.
    if(c.forceJS){c.baseDepth=2;c.budget=c.fallbackBudget;c.maxDepth=Math.min(c.maxDepth,6);}
    if(branches.length<2){return deliver({id:m.id,revision:m.revision,best:branches[0]?.dir||null,scores:branches.length?{[branches[0].dir]:0}:{},depth:0,nodes:0,time:0,parallel:0,engine:'forced'},canon.t);}
    job={id:m.id,revision:m.revision,key,transform:canon.t,cfg:c,branches,rootBoard:canon.board,depth:c.baseDepth,
      phase:'search',started:performance.now(),nodes:0,riskNodes:0,verifyNodes:0,cacheHits:0,discardedNodes:0,discardedRounds:0,
      lastComplete:null,riskResult:null,riskFallback:false,verified:false,overrideBest:null,tieBest:null,tieAdjusted:false,tieGap:0,riskGap:0,recovery:false,spentBudget:0,
      ceilingStage:0,ceilingBase:null,ceilingBest5:null,ceilingRefined:false,ceilingConsensus:false,ceilingRejected:false,ceilingGap:0};
    searchRound();
  }
  function round(phase,tasks){job.phase=phase;job.results={};job.queue=tasks;job.expected=tasks.length;dispatch();}
  function valueWords(board){
    let lo=0,hi=0;for(let i=0;i<16;i++){const r=board[i]===0?0:31-Math.clz32(board[i]);if(i<8)lo|=r<<(4*i);else hi|=r<<(4*(i-8));}return [lo>>>0,hi>>>0];
  }
  function searchRound(){
    const j=job;
    // Pack each complete legal root once; reuse it across d4/d5/d6.
    // cfg.v102 has already certified all root values and six-spawn mass.
    if(j.cfg.v102)for(const b of j.branches)b.valueWords??=valueWords(b.board);
    j.roundCosts=slots.map(()=>0);
    j.roundBudget=j.lastComplete?Math.max(1,j.cfg.budget-j.spentBudget):0;
    round('search',j.branches.map(b=>({...b,type:j.cfg.v102?'v102':'exact',round:j.cfg.v102?'v102d'+j.cfg.coreDepth:'d'+j.depth,depth:j.cfg.v102?j.cfg.coreDepth:j.depth,cfg:j.cfg})));
  }
  function dispatch(){
    if(!job)return begin();
    const j=job;
    for(const slot of slots){
      if(!j.queue.length)break;
      if(!slot.ready||slot.busy)continue;
      const task=j.queue.shift();
      task.hardBudget=task.type==='riskall'?0:j.phase==='verify'?(j.projectedRisk?j.projectVerifyBudget:j.cfg.verifyBudget):j.roundBudget;
      slot.busy=true;slot.id=j.id;
      // Value tasks do not use the legacy search configuration or merge gain.
      // Avoid cloning the entire config into every native root request.
      const message=task.type==='v102'?{type:task.type,id:j.id,round:task.round,dir:task.dir,lo:task.valueWords?.[0],hi:task.valueWords?.[1],depth:task.depth,hardBudget:task.hardBudget,
        ...(task.valueWords?{}:{board:task.board})}:{...task,id:j.id};
      slot.port.postMessage(message);
    }
  }
  function receive(slot,r){
    if(r.type==='ready'){slot.ready=true;slot.wasm=r.wasm;slot.v102=!!r.v102;return begin();}
    slot.busy=false;
    if(!job||r.id!==job.id){dispatch();begin();return;}
    if(r.error){send({type:'error',id:job.id,message:r.error});job=null;return;}
    const j=job;
    if(j.phase==='risk'){riskComplete(r);return;}
    if(j.phase==='plan'){planComplete(r);return;}
    if(j.phase==='plan-screen'){planScreenComplete(r);return;}
    if(j.phase==='learned-proof'){learnedProofComplete(r);return;}
    if(r.round!==(j.phase==='verify'?'verify':j.cfg.v102?'v102d'+j.cfg.coreDepth:'d'+j.depth))return;
    if(j.phase==='search')j.roundCosts[slots.indexOf(slot)]+=r.time||0;
    j.results[r.dir]=r;dispatch();
    if(Object.keys(j.results).length!==j.expected)return;
    const rs=j.branches.map(b=>j.results[b.dir]).filter(Boolean),n=rs.reduce((s,x)=>s+(x.nodes||0),0);
    j.cacheHits=(j.cacheHits||0)+rs.reduce((s,x)=>s+(x.cacheHits||0),0);
    if(j.phase==='verify'){
      j.verifyNodes+=n;
      if(rs.every(x=>x.ok&&Number.isFinite(x.score))){
        const base=rs.find(r=>r.dir===j.verifyBase),safe=rs.find(r=>r.dir===j.verifySafe);
        if(base&&safe&&safe.score>base.score){
          j.verifiedScores=Object.fromEntries(rs.map(x=>[x.dir,x.score]));
          j.overrideBest=j.verifySafe;j.verified=true;
        }
      }
      finish();return;
    }
    j.nodes+=n;
    // Charge the longest compute lane, including sequential tasks on small
    // pools. Message delivery and coordinator scheduling consume no chess budget.
    j.spentBudget+=Math.max(...j.roundCosts);
    if(rs.some(x=>!x.ok||!Number.isFinite(x.score))){
      j.discardedNodes+=n;j.discardedRounds++;
      if(j.ceilingStage&&j.ceilingBase){restoreCeilingBase();tieBreak();riskStart();return;}
      if(j.lastComplete){riskStart();return;}
      // Large tiles / unavailable WASM: restart every root at the same attainable
      // depth. Never compare mixed scales or silently leave autoplay stuck.
      if(!j.recovery){j.recovery=true;j.depth=1;searchRound();return;}
      send({type:'error',id:j.id,message:'搜索未能完成，请切换模式后重试。'});job=null;return;
    }
    j.lastComplete=rs;
    if(j.cfg.v102){
      j.depth=j.cfg.coreDepth;
      if(ceilingRefine())return;
      tieBreak();riskStart();return;
    }
    if(j.recovery||j.depth>=j.cfg.maxDepth||j.spentBudget>=j.cfg.budget-1){riskStart();return;}
    j.depth++;searchRound();
  }

  // V11.5 survival refinement: keep ordinary play unchanged. Only an 8192 or
  // 16384 board with 3-4 empty cells and a genuinely
  // ambiguous d4 ranking may spend extra work. A changed d5 choice must also
  // win at d6; disagreement restores the complete d4 result. This avoids the
  // known A->B->A depth oscillation without taxing the common path.
  function restoreCeilingBase(){
    const j=job,b=j.ceilingBase;if(!b)return;
    j.lastComplete=b.complete;j.cfg.coreDepth=b.depth;j.depth=b.depth;j.ceilingStage=0;j.ceilingRejected=true;
  }
  function ceilingRefine(){
    const j=job;
    if(j.ceilingStage===5){
      const scores=scoresFor(j),pick=bestOf(scores);j.ceilingBest5=pick;
      j.ceilingPolicy5=(j.cfg.policyConsensus||j.cfg.actualConsensusPromotion)?policyChoice(j,scores):undefined;
      const scoreAgrees=pick===j.ceilingBase.best,policyAgrees=!j.cfg.policyConsensus||j.ceilingPolicy5===j.ceilingBase.policyBest;
      if(scoreAgrees&&policyAgrees){j.ceilingConsensus=true;j.ceilingStage=0;return false;}
      // Preserve the original score-consensus requirement. The new guard only
      // adds checks; it never skips a d6 round the old policy would require.
      j.policyOnlyCheck=scoreAgrees&&j.cfg.policyConsensus;j.policyRound5=j.lastComplete;
      j.ceilingStage=6;j.cfg.coreDepth=6;searchRound();return true;
    }
    if(j.ceilingStage===6){
      const scores=scoresFor(j),pick=bestOf(scores),policy=(j.policyOnlyCheck||j.cfg.actualConsensusPromotion||j.cfg.fallbackConsensus)?policyChoice(j,scores):undefined;
      // Ablation candidate: full d5/d6 actual-policy agreement. Disabled by default.
      if(j.cfg.actualConsensusPromotion&&!j.policyOnlyCheck&&policy===j.ceilingPolicy5){
        j.actualConsensusPromoted=true;j.ceilingStage=0;return false;
      }
      if(pick===j.ceilingBest5&&(!j.policyOnlyCheck||policy===j.ceilingPolicy5)){
        // For the additional policy check, retain the old complete d5 values
        // and verifier depth. d6 is evidence, not a new scoring scale.
        if(j.policyOnlyCheck){j.lastComplete=j.policyRound5;j.cfg.coreDepth=5;j.depth=5;j.policyConfirmed=true;}
        j.ceilingConsensus=true;j.ceilingStage=0;return false;
      }
      // A policy-only d6 rejection cannot justify d4 unless d4/d6 raw AND
      // merge-stabilized choices agree. Otherwise retain the old complete d5.
      // This is inconclusive evidence, never a positive consensus certificate.
      if(j.cfg.fallbackConsensus&&j.policyOnlyCheck&&
        !(pick===j.ceilingBase.best&&policy===j.ceilingBase.policyBest)){
        j.lastComplete=j.policyRound5;j.cfg.coreDepth=5;j.depth=5;j.ceilingStage=0;
        j.policyFallbackRetained=true;j.ceilingEvidenceRejected=true;return false;
      }
      restoreCeilingBase();return false;
    }
    if(j.cfg.profile!=='extreme'||j.cfg.wideValue||j.cfg.forceJS||j.cfg.coreDepth!==4)return false;
    const e=j.cfg.rootEmpties,max=j.cfg.rootMax;if((max!==8192&&max!==16384)||e<3||e>4)return false;
    const scores=scoresFor(j),gap=relativeGap(scores);if(!(gap<=0.0005))return false;
    j.ceilingBase={complete:j.lastComplete,depth:j.cfg.coreDepth,best:bestOf(scores),policyBest:j.cfg.policyConsensus?policyChoice(j,scores):undefined};j.ceilingGap=gap;j.ceilingRefined=true;
    j.ceilingStage=5;j.cfg.coreDepth=5;searchRound();return true;
  }
  function mobility(b){
    // A move is possible iff a neighboring pair can slide or merge. A merge
    // separated by zeros already has a sliding pair, so no compression is needed.
    let mask=0;
    for(let row=0;row<16&&(mask&3)!==3;row+=4)for(let col=0;col<3;col++){
      const a=b[row+col],z=b[row+col+1];
      if(a){if(!z)mask|=2;else if(a===z)mask|=3;}else if(z)mask|=1;
    }
    for(let i=0;i<12&&(mask&12)!==12;i++){
      const a=b[i],z=b[i+4];
      if(a){if(!z)mask|=8;else if(a===z)mask|=12;}else if(z)mask|=4;
    }
    return (mask&1)+((mask>>1)&1)+((mask>>2)&1)+((mask>>3)&1);
  }
  function fragility(src,dir,branches){
    const reused=branches?.find(b=>b.dir===dir);
    const b=reused?reused.board.slice():moveBoardPlain(src,dir).board,empty=[];for(let i=0;i<16;i++)if(!b[i])empty.push(i);
    let dead=0,forced=0,tight=0,minMoves=4;
    for(const i of empty)for(let kind=0;kind<2;kind++){const v=kind?4:2,p=kind?.1:.9;b[i]=v;const n=mobility(b),q=p/empty.length;b[i]=0;minMoves=Math.min(minMoves,n);if(!n)dead+=q;if(n<=1)forced+=q;if(n<=2)tight+=q;}
    return {dead,forced,tight,minMoves};
  }
  // When the high-speed core sees an almost exact tie, prefer the move that
  // creates more immediate merge value. The 0.05% gate keeps this a stability
  // rule rather than a short-sighted score bonus.
  function tieBreak(){
    const j=job,scores=scoresFor(j),order=orderedScores(scores);if(j.cfg?.mergePreference===false||order.length<2)return;
    const top=scores[order[0]],den=Math.max(1,Math.abs(top));
    // V11.4: God already owns the deepest effective complete value result. The
    // legacy 0.05% merge preference was designed to stabilize shallower modes,
    // but on God it can overwrite d6 hundreds of score points for a one-ply gain.
    // Keep that stabilizer only for true numerical near-ties; legacy profiles
    // retain their historical 0.05% gate byte-for-policy.
    const limit=j.cfg?.profile==='god'?GOD_TIE_GAP:0.0005;
    const near=order.filter(d=>{const g=(top-scores[d])/den;return g>=0&&g<=limit;});if(near.length<2)return;
    const base=j.branches.find(x=>x.dir===order[0]);let pick=base;
    for(const d of near){const br=j.branches.find(x=>x.dir===d);if(br&&(!pick||br.gain>pick.gain))pick=br;}
    if(base&&pick&&pick.dir!==base.dir){j.tieBest=pick.dir;j.tieAdjusted=true;j.tieGap=(top-scores[pick.dir])/den;}
  }
  function riskStart(){
    const j=job,e=j.cfg.rootEmpties??countEmpties(j.rootBoard),base=j.tieBest||bestOf(scoresFor(j));
    if(j.cfg.forceJS||j.cfg.wideValue){
      // Preserve every normal search round. Only spend unused compatibility time.
      const wide=j.rootBoard.some(v=>v>=32768)||j.branches.some(b=>b.board.some(v=>v>=32768));
      if(!wide||!slots.every(s=>s.wasm)){finish();return;}
      j.projectedRisk=true;
      if(j.cfg.budget-j.spentBudget<8){j.riskSkipped='budget';finish();return;}
    }
    const f=fragility(j.rootBoard,base,j.branches);
    const god=j.cfg.profile==='god';
    if(!(e<=1||(e<=3&&j.branches.length<=2)||f.dead>0||(god?f.forced>=.03:f.forced>=.06)||(god?f.tight>=.30:f.tight>=.45)||(god?f.minMoves<=2:f.minMoves<=1))){finish();return;}
    riskRound(j.cfg.riskH);
  }
  function riskRound(h){
    const j=job,remaining=j.cfg.budget-j.spentBudget;
    j.activeRiskH=h;
    if(j.projectedRisk&&remaining<8){j.riskSkipped='budget';finish();return;}
    // Survival WASM has a node cap, not a wall-clock interrupt. Keep this new
    // optional phase small; the existing budget remains a soft compute budget.
    const nodeLimit=j.projectedRisk?Math.min(j.cfg.riskNodes,120000,Math.floor(remaining*4000)):j.cfg.riskNodes;
    let board=j.rootBoard;
    if(j.projectedRisk){
      const start=performance.now();
      try{j.activeProjection=projectSurvival(board,h);}catch(e){j.activeProjection={eligible:false};}
      j.spentBudget+=performance.now()-start;
      if(!j.activeProjection.eligible){riskComplete({ok:false,best:null,survivals:null,nodes:0,time:0,projectionRejected:true});return;}
      board=j.activeProjection.ranks.map(r=>r?2**r:0);
    }
    round('risk',[{type:'riskall',round:'risk',board,horizon:h,nodeLimit,baseline:j.tieBest||bestOf(scoresFor(j)),minGap:j.cfg.riskGap,proofNodes:j.cfg.proofNodes,proofMs:j.cfg.proofMs}]);
  }
  function riskComplete(r){
    const j=job;j.riskNodes+=r.nodes||0;
    if(j.projectedRisk){
      // Inherited workers may return partial probabilities after abort. Discard
      // them at the coordinator boundary before making any policy decision.
      r={...r,projected:!!j.activeProjection?.changed,maxProjectedRank:j.activeProjection?.maxRank};
      if(!r.ok){r.best=null;r.survivals=null;}
      j.spentBudget+=r.time||0;j.riskResult=r;
    }
    if((!r.ok||!r.best||!r.survivals)&&j.cfg.riskH>6&&!j.riskFallback){j.riskFallback=true;riskRound(6);return;}
    j.riskResult=r;
    if(!r.ok||!r.best||!r.survivals){finish();return;}
    const base=j.tieBest||bestOf(scoresFor(j)),cur=r.survivals[base],alt=r.survivals[r.best];
    if(!Number.isFinite(cur)||!Number.isFinite(alt)||base===r.best){finish();return;}
    j.riskGap=alt-cur;
    const valueTie=j.cfg.terminalRescue&&j.cfg.v102&&!j.cfg.forceJS&&!j.cfg.wideValue&&!j.projectedRisk
      &&j.lastComplete.length===j.branches.length&&j.lastComplete.every(x=>x.score===Math.fround(0.000001))
      &&j.branches.some(b=>b.dir===r.best)&&j.branches.every(b=>Number.isFinite(r.survivals[b.dir])&&r.survivals[b.dir]>=0&&r.survivals[b.dir]<=1+1e-9)
      &&j.rootBoard.reduce((s,v)=>s+v,0)+4*(j.activeRiskH||j.cfg.riskH)<65536;
    if(valueTie&&j.riskGap>1e-12){
      // The value engine has returned its terminal floor for EVERY legal root.
      // It provides no ranking evidence here. A fully completed survival round
      // can still distinguish nonzero chances of living through H more moves.
      // Preserve all normal verifier rules outside this terminal-floor tie.
      j.overrideBest=r.best;j.terminalRescued=true;finish();return;
    }
    if(j.riskGap<j.cfg.riskGap){finish();return;}
    if(j.projectedRisk){
      const remaining=j.cfg.budget-j.spentBudget;
      if(remaining<4){j.riskSkipped='verifier-budget';finish();return;}
      j.projectVerifyBudget=Math.min(j.cfg.verifyBudget,remaining/Math.ceil(2/slots.length));
    }
    j.verifyBase=base;j.verifySafe=r.best;
    const c=j.cfg,late=countEmpties(j.rootBoard)<=5;
    const vc={...c,sampleCap:Math.max(5,c.sampleCap),exactPlies:Math.max(2,c.exactPlies),exactWhenEmpty:Math.max(5,c.exactWhenEmpty),probCut:Math.min(c.probCut,late?2e-5:5e-5),ttBits:Math.max(15,c.ttBits)};
    // Risk overrides still require an independent, deeper legacy verifier.
    // Extreme d5 therefore receives a d6 check; fast retains d3 -> d4.
    const vs=verifierSpec(j.cfg,j.lastComplete[0].depth);
    round('verify',j.branches.filter(b=>b.dir===base||b.dir===r.best).map(b=>({...b,type:vs.type,round:'verify',depth:vs.depth,cfg:vc})));
  }
  let learnedModel=null;
  function learnedApply(allowed){
    const j=job,scores=scoresFor(j);
    j.learned=LearnedSurvival2048.choose(j.learnedAnalysis,j.learnedBaseline,scores,{consensus:j.cfg.learnedConsensus,allowed});
    if(j.learned.changed){j.overrideBest=j.learned.best;j.learnedChanged=true;j.baselineVerified=j.verified;j.verified=false;j.verifiedScores=undefined;j.terminalRescued=false;}
  }
  function learnedStart(){
    const j=job,c=j.cfg;
    if(j.learnedDone||(!c.learnedSurvival&&!(c.learnedGuard&&c.counterfactual))||!c.v102||c.forceJS||c.rootMax<8192||c.rootEmpties>5||j.branches.length<2)return false;
    j.learnedDone=true;j.learnedStarted=performance.now();
    learnedModel??=LearnedSurvival2048.defaultModel();
    if(!learnedModel.available){j.learnedReason='trained model unavailable';return false;}
    j.learnedAnalysis=learnedModel.analyze(j.branches);
    if(!c.learnedSurvival){j.learnedGuardReady=!!j.learnedAnalysis.ok;return false;}
    j.learnedBaseline=j.overrideBest||j.tieBest||bestOf(scoresFor(j));
    const baseFragility=fragility(j.rootBoard,j.learnedBaseline,j.branches);
    j.learnedAllowed=j.branches.filter(b=>fragility(j.rootBoard,b.dir,j.branches).dead<=baseFragility.dead+1e-12).map(b=>b.dir);
    const r=j.riskResult;
    if(r?.ok&&r.survivals&&!r.proofCertified){const p=r.survivals;j.learnedAllowed=j.learnedAllowed.filter(d=>Number.isFinite(p[d])&&p[d]>=p[j.learnedBaseline]-1e-12);}
    const proposal=LearnedSurvival2048.choose(j.learnedAnalysis,j.learnedBaseline,scoresFor(j),{consensus:c.learnedConsensus,allowed:j.learnedAllowed});
    if(proposal.changed&&r?.proofCertified){
      round('learned-proof',j.branches.map(b=>({type:'candidate-proof',round:'learned-proof',board:j.rootBoard,dir:b.dir,horizon:j.activeRiskH,nodeLimit:4096})));return true;
    }
    learnedApply(j.learnedAllowed);return false;
  }
  function learnedProofComplete(r){
    const j=job;if(r.round!=='learned-proof'||!j.branches.some(b=>b.dir===r.dir))return;
    j.results[r.dir]=r;dispatch();if(Object.keys(j.results).length!==j.expected)return;
    j.learnedProofNodes=j.branches.reduce((n,b)=>n+(j.results[b.dir].nodes||0),0);
    const allowed=j.learnedAllowed.filter(d=>d===j.learnedBaseline||j.results[d].certified===true);
    learnedApply(allowed);finish();
  }
  function planStart(){
    const j=job,c=j.cfg;
    if(j.plannerDone||!c.counterfactual||!c.v102||c.forceJS||c.rootMax<8192||c.rootEmpties>4||j.branches.length<2)return false;
    if(c.learnedGuard&&!j.learnedAnalysis?.ok){j.plannerDone=true;j.learnedGuardSkipped=true;return false;}
    const scores=scoresFor(j),baseline=j.overrideBest||j.tieBest||bestOf(scores),gap=relativeGap(scores);
    if(c.learnedGuard){
      const guard=LearnedSurvival2048.guard(j.learnedAnalysis,baseline,j.branches.map(b=>b.dir));j.learnedGuard=guard;
      // All model roots and original scores have completed. If every alternative
      // already fails a required gate, no future rollout can select one.
      const den=Math.max(1,Math.abs(scores[baseline]));
      if(!guard.complete||!guard.allowed.some(d=>d!==baseline&&(scores[baseline]-scores[d])/den<=Counterfactual2048.SETTINGS.maxValueGap)){
        j.plannerDone=true;j.learnedGuardScreened=true;return false;
      }
    }
    const f=fragility(j.rootBoard,baseline,j.branches);
    if(gap>0.003&&f.dead===0&&f.forced<0.1)return false;
    const settings=Counterfactual2048.SETTINGS;
    if(!j.branches.every(b=>b.board.reduce((s,v)=>s+v,0)+4*(settings.horizon+settings.policyDepth)<65536))return false;
    const seed=Counterfactual2048.seed(j.rootBoard);
    j.plannerBaseline=baseline;j.plannerSeed=seed;j.plannerDone=true;j.plannerTimes=[];j.plannerStarted=performance.now();
    const tasks=j.branches.map(b=>({...b,type:'counterfactual',round:'plan',options:{...settings,seed,captureEndpoints:c.learnedTrajectory,memo:c.counterfactualMemo},rootBoard:j.rootBoard,proofH:j.riskResult?.proofCertified?j.activeRiskH:0}));
    if(j.cfg.counterfactualScreen){j.plannerTasks=tasks;round('plan-screen',[{...tasks.find(t=>t.dir===baseline),round:'plan-screen'}]);}
    else round('plan',tasks);return true;
  }
  function planScreenComplete(r){
    const j=job;if(r.round!=='plan-screen'||r.dir!==j.plannerBaseline)return;
    j.plannerTimes.push(r.time||0);
    if(!r.ok){j.planning={complete:false,changed:false,reason:'discarded incomplete baseline screen'};j.plannerNodes=r.nodes||0;finish();return;}
    if(!j.cfg.trajectoryPromotion&&r.horizon===Counterfactual2048.SETTINGS.horizon&&r.samples===Counterfactual2048.SETTINGS.samples&&r.lives?.length===r.samples&&r.lives.every(x=>x===r.horizon)){
      // Every baseline sample reaches the bounded survival ceiling. NO
      // alternative can meet the strictly positive mean-improvement gate.
      // Keep the already complete main result; do not rank partial samples.
      j.plannerScreened=true;j.plannerNodes=r.nodes||0;
      j.plannerResults={[r.dir]:{...r,endpoints:undefined}};j.planning={complete:false,changed:false,screened:true,reason:'complete baseline at sampled survival ceiling'};finish();return;
    }
    const tasks=j.plannerTasks.filter(t=>t.dir!==j.plannerBaseline);
    round('plan',tasks);j.results[j.plannerBaseline]=r;j.expected=j.branches.length;
  }
  function planComplete(r){
    const j=job;if(r.round!=='plan'||!j.branches.some(b=>b.dir===r.dir))return;
    j.results[r.dir]=r;j.plannerTimes.push(r.time||0);dispatch();
    if(Object.keys(j.results).length!==j.expected)return;
    const scores=scoresFor(j),dirs=j.branches.map(b=>b.dir);
    const full=dirs.every(d=>j.results[d].ok&&j.results[d].lives?.length===16);
    // A complete short-term risk result must not be contradicted by a new
    // sampled planner. Proof-only probabilities cannot justify an alternative.
    const baseDeath=fragility(j.rootBoard,j.plannerBaseline,j.branches).dead;
    let allowed=dirs.filter(d=>fragility(j.rootBoard,d,j.branches).dead<=baseDeath+1e-12);
    if(j.riskResult?.ok&&j.riskResult.survivals){const p=j.riskResult.survivals,base=p[j.plannerBaseline];allowed=allowed.filter(d=>d===j.plannerBaseline||(j.riskResult.proofCertified?j.results[d].shortCertified:Number.isFinite(p[d])&&p[d]>=base-1e-12));}
    if(full){
      if(j.cfg.learnedGuard){
        const before=Counterfactual2048.choose(j.results,j.plannerBaseline,scores,{confirmation:j.cfg.counterfactualConfirm,tailGuard:j.cfg.counterfactualTail,allowed});
        const guard=LearnedSurvival2048.guard(j.learnedAnalysis,j.plannerBaseline,dirs);j.learnedGuard=guard;
        allowed=allowed.filter(d=>guard.allowed.includes(d));
        const after=Counterfactual2048.choose(j.results,j.plannerBaseline,scores,{confirmation:j.cfg.counterfactualConfirm,tailGuard:j.cfg.counterfactualTail,allowed});
        j.learnedGuardVeto=before.changed&&before.best!==after.best;
      }
      // The pure selector is also embedded in the coordinator by the build.
      j.planning=Counterfactual2048.choose(j.results,j.plannerBaseline,scores,{confirmation:j.cfg.counterfactualConfirm,tailGuard:j.cfg.counterfactualTail,allowed});
      if(j.cfg.learnedTrajectory&&j.planning.changed){
        learnedModel??=LearnedSurvival2048.defaultModel();
        j.trajectory=LearnedSurvival2048.trajectoryGuard(learnedModel,j.results,j.plannerBaseline,j.planning.best);
        j.trajectory.modelId=learnedModel.modelId;
        j.trajectory.endpoints=Object.fromEntries([j.plannerBaseline,j.planning.best].map(d=>[d,j.results[d].endpoints]));
        if(!j.trajectory.complete||!j.trajectory.allowed){
          j.trajectoryVeto=true;
          // Cheap continuations are a weaker witness once the first large asset
          // has formed. This independent stage rule retains the long-route veto;
          // it is an empirical candidate, never a mathematical safety claim.
          const mature=j.cfg.trajectoryAssetGuard&&j.cfg.rootMax>=16384;
          if(mature&&j.cfg.trajectoryEscape&&j.trajectory.complete){j.trajectoryStageHeld=true;j.trajectory.escapeRejected='mature tile stage retains completed long-route veto';}
          const escape=j.cfg.trajectoryEscape&&j.trajectory.complete&&!mature?Counterfactual2048.strongEscape(j.results,j.plannerBaseline,j.planning.best):null;
          if(escape?.passed){j.trajectoryEscaped=true;j.trajectory.escapeOverride=escape;}
          else j.planning={...j.planning,best:j.plannerBaseline,changed:false,confirmed:false,veto:'endpoint survival spectrum'};
        }
      }
      if(j.cfg.learnedTrajectory&&j.cfg.trajectoryPromotion&&!j.planning.changed){
        learnedModel??=LearnedSurvival2048.defaultModel();
        j.longPlanning=LearnedSurvival2048.trajectoryChoose(learnedModel,j.results,j.plannerBaseline,scores,allowed);
        if(j.longPlanning.changed){j.planning=j.longPlanning;j.trajectory=j.longPlanning.guard;j.trajectory.modelId=learnedModel.modelId;j.trajectory.endpoints=Object.fromEntries([j.plannerBaseline,j.planning.best].map(d=>[d,j.results[d].endpoints]));j.trajectoryPromoted=true;}
      }
      if(j.planning.changed){j.overrideBest=j.planning.best;j.plannerChanged=true;j.baselineVerified=j.verified;j.verified=false;j.baselineTerminalRescued=!!j.terminalRescued;j.terminalRescued=false;}
    }else j.planning={complete:false,changed:false,reason:'discarded incomplete planning round'};
    j.plannerResults=Object.fromEntries(dirs.map(d=>[d,{...j.results[d],id:undefined,round:undefined,dir:undefined,endpoints:undefined}]));
    j.plannerNodes=dirs.reduce((s,d)=>s+(j.results[d].nodes||0),0);finish();
  }
  function finish(){
    if(learnedStart())return;
    if(planStart())return;
    const j=job,scores=scoresFor(j),result={id:j.id,revision:j.revision,best:j.overrideBest||j.tieBest||bestOf(scores),scores,
      depth:j.lastComplete.reduce((a,x)=>Math.max(a,x.depth||0),0),nodes:j.nodes+j.riskNodes+j.verifyNodes+(j.plannerNodes||0)+(j.learnedProofNodes||0),time:performance.now()-j.started,
      mainNodes:j.nodes,riskNodes:j.riskNodes,verifyNodes:j.verifyNodes,cacheHits:j.cacheHits||0,
      parallel:Math.min(slots.length,j.branches.length),engine:j.cfg.v102?'v10.5-wasm-expectimax':j.lastComplete.every(x=>x.engine==='wasm64')?'wasm64-v10':'js-v10',
      riskChecked:!!j.riskResult?.ok,riskAborted:!!j.riskResult&&!j.riskResult.ok,riskFallback:j.riskFallback,
      wideValueCore:!!j.cfg.wideValue,projectedRisk:!!j.projectedRisk,projectionApplied:!!j.riskResult?.projected,projectionRejected:!!j.riskResult?.projectionRejected,
      maxProjectedRank:j.riskResult?.maxProjectedRank,riskSkipped:j.riskSkipped,proofCertified:!!j.riskResult?.proofCertified,
      proofNodes:j.riskResult?.proofNodes||0,proofMs:j.riskResult?.proofMs||0,
      verified:j.verified,verifiedScores:j.verifiedScores,tieAdjusted:j.tieAdjusted,tieGap:j.tieGap,tieLimit:j.cfg?.profile==='god'?GOD_TIE_GAP:0.0005,riskGap:j.riskGap,discardedNodes:j.discardedNodes,discardedRounds:j.discardedRounds,recovered:j.recovery,
      ceilingRefined:j.ceilingRefined,ceilingConsensus:j.ceilingConsensus,ceilingRejected:j.ceilingRejected,ceilingGap:j.ceilingGap,
      terminalRescued:!!j.terminalRescued,rescueHorizon:j.terminalRescued?(j.activeRiskH||j.cfg.riskH):undefined,
      learnedGuardChecked:!!j.learnedGuard?.complete,learnedGuardVeto:!!j.learnedGuardVeto,learnedGuardScreened:!!j.learnedGuardScreened,learnedGuardSkipped:!!j.learnedGuardSkipped,learnedChecked:!!j.learned?.complete,learnedChanged:!!j.learnedChanged,learnedConsensus:!!j.learned?.consensus,learned:j.learned,learnedMs:j.learnedStarted?performance.now()-j.learnedStarted:0,learnedReason:j.learnedReason,
      trajectoryChecked:!!j.trajectory?.complete,trajectoryVeto:!!j.trajectoryVeto,trajectoryPromoted:!!j.trajectoryPromoted,trajectoryEscaped:!!j.trajectoryEscaped,trajectoryStageHeld:!!j.trajectoryStageHeld,trajectory:j.trajectory,plannerScreened:!!j.plannerScreened,plannerChecked:!!j.planning?.complete,plannerChanged:!!j.plannerChanged,plannerConfirmed:!!j.planning?.confirmed,plannerMs:j.plannerStarted?performance.now()-j.plannerStarted:0,plannerNodes:j.plannerNodes||0,planning:j.planning,plannerResults:j.plannerResults,plannerSeed:j.plannerSeed,
      policyConsensusGuard:!!j.cfg.policyConsensus,policyConfirmed:!!j.policyConfirmed,
      actualConsensusPromoted:!!j.actualConsensusPromoted,policyFallbackRetained:!!j.policyFallbackRetained,ceilingEvidenceRejected:!!j.ceilingEvidenceRejected};
    cache={key:j.key,value:result};job=null;deliver(result,j.transform);begin();
  }
  function deliver(r,t){
    const map=s=>s&&Object.fromEntries(Object.entries(s).map(([d,v])=>[INVERSE_DIRS[t][d],v]));
    send({type:'result',...r,best:r.best?INVERSE_DIRS[t][r.best]:null,scores:map(r.scores),verifiedScores:map(r.verifiedScores),plannerResults:map(r.plannerResults),trajectory:r.trajectory?{...r.trajectory,baseline:INVERSE_DIRS[t][r.trajectory.baseline],alternative:INVERSE_DIRS[t][r.trajectory.alternative],endpointScores:map(r.trajectory.endpointScores),endpoints:map(r.trajectory.endpoints)}:undefined,learned:r.learned?{...r.learned,best:INVERSE_DIRS[t][r.learned.best],baseline:INVERSE_DIRS[t][r.learned.baseline],summary:map(r.learned.summary),evidence:map(r.learned.evidence)}:undefined,planning:r.planning?{...r.planning,best:INVERSE_DIRS[t][r.planning.best],baseline:INVERSE_DIRS[t][r.planning.baseline],summary:map(r.planning.summary),evidence:map(r.planning.evidence)}:undefined});
  }
  onmessage=e=>{
    const m=e.data;
    if(m.type==='init'){
      slots=m.ports.map(port=>{const slot={port,busy:false,ready:false};port.onmessage=e=>receive(slot,e.data);return slot;});return;
    }
    if(m.type==='cancel'){pending=null;job=null;return;}
    if(m.type==='analyze'){pending=m;job=null;begin();}
  };
})();

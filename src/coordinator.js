// Owns the complete decision. Root workers speak directly through MessagePorts;
// no search round, risk check, or verifier waits for a DOM paint or animation.
(()=>{
  'use strict';
  const {legalRootBranches,canonicalAI,inverseTransformDir,countEmpties,moveBoardPlain,config}=Game2048;
  const DIRS=['up','left','right','down'];
  let slots=[],job=null,pending=null,cache=null;
  const send=x=>postMessage(x);
  const scoresFor=j=>Object.fromEntries(j.branches.map(b=>[b.dir,j.lastComplete.find(r=>r.dir===b.dir).score]));
  // Stable canonical order: ties must never depend on worker arrival order.
  const bestOf=s=>DIRS.filter(d=>Number.isFinite(s[d])).reduce((a,d)=>a===null||s[d]>s[a]?d:a,null);
  function begin(){
    if(job||!pending||!slots.length||slots.some(s=>!s.ready||s.busy))return;
    const m=pending;pending=null;
    const canon=canonicalAI(m.board),key=m.strength+':'+canon.board.join(',');
    if(cache&&cache.key===key){const r={...cache.value,id:m.id,revision:m.revision,cached:true,time:0,nodes:0};return deliver(r,canon.t);}
    const c=config(m.board,m.strength),branches=legalRootBranches(canon.board);
    if(slots.some(s=>!s.wasm))c.forceJS=true;
    // JS is a slower compatibility engine: secure a complete result before
    // spending its existing fallback allowance on progressively deeper rounds.
    // The ordinary WASM quality floor and budget are unchanged.
    if(c.forceJS){c.baseDepth=2;c.budget=c.fallbackBudget;c.maxDepth=Math.min(c.maxDepth,6);}
    if(branches.length<2){return deliver({id:m.id,revision:m.revision,best:branches[0]?.dir||null,scores:branches.length?{[branches[0].dir]:0}:{},depth:0,nodes:0,time:0,parallel:0,engine:'forced'},canon.t);}
    job={id:m.id,revision:m.revision,key,transform:canon.t,cfg:c,branches,rootBoard:canon.board,depth:c.baseDepth,
      phase:'search',started:performance.now(),nodes:0,riskNodes:0,verifyNodes:0,discardedNodes:0,discardedRounds:0,
      lastComplete:null,riskResult:null,riskFallback:false,verified:false,overrideBest:null,riskGap:0,recovery:false,spentBudget:0};
    searchRound();
  }
  function round(phase,tasks){job.phase=phase;job.results={};job.queue=tasks;job.expected=tasks.length;dispatch();}
  function searchRound(){
    const j=job;
    j.roundCosts=slots.map(()=>0);
    j.roundBudget=j.lastComplete?Math.max(1,j.cfg.budget-j.spentBudget):0;
    round('search',j.branches.map(b=>({...b,type:'exact',round:'d'+j.depth,depth:j.depth,cfg:j.cfg})));
  }
  function dispatch(){
    if(!job)return begin();
    const j=job;
    for(const slot of slots){
      if(!j.queue.length)break;
      if(!slot.ready||slot.busy)continue;
      const task=j.queue.shift();
      task.hardBudget=task.type==='riskall'?0:j.phase==='verify'?j.cfg.verifyBudget:j.roundBudget;
      slot.busy=true;slot.id=j.id;
      slot.port.postMessage({...task,id:j.id});
    }
  }
  function receive(slot,r){
    if(r.type==='ready'){slot.ready=true;slot.wasm=r.wasm;return begin();}
    slot.busy=false;
    if(!job||r.id!==job.id){dispatch();begin();return;}
    if(r.error){send({type:'error',id:job.id,message:r.error});job=null;return;}
    const j=job;
    if(j.phase==='risk'){riskComplete(r);return;}
    if(r.round!==(j.phase==='verify'?'verify':'d'+j.depth))return;
    if(j.phase==='search')j.roundCosts[slots.indexOf(slot)]+=r.time||0;
    j.results[r.dir]=r;dispatch();
    if(Object.keys(j.results).length!==j.expected)return;
    const rs=j.branches.map(b=>j.results[b.dir]).filter(Boolean),n=rs.reduce((s,x)=>s+(x.nodes||0),0);
    if(j.phase==='verify'){
      j.verifyNodes+=n;
      if(rs.every(x=>x.ok&&Number.isFinite(x.score))){
        const base=rs.find(r=>r.dir===j.verifyBase),safe=rs.find(r=>r.dir===j.verifySafe);
        if(base&&safe&&safe.score>base.score){j.overrideBest=j.verifySafe;j.verified=true;j.verifiedScores=Object.fromEntries(rs.map(x=>[x.dir,x.score]));}
      }
      finish();return;
    }
    j.nodes+=n;
    // Charge the longest compute lane, including sequential tasks on small
    // pools. Message delivery and coordinator scheduling consume no chess budget.
    j.spentBudget+=Math.max(...j.roundCosts);
    if(rs.some(x=>!x.ok||!Number.isFinite(x.score))){
      j.discardedNodes+=n;j.discardedRounds++;
      if(j.lastComplete){riskStart();return;}
      // Large tiles / unavailable WASM: restart every root at the same attainable
      // depth. Never compare mixed scales or silently leave autoplay stuck.
      if(!j.recovery){j.recovery=true;j.depth=1;searchRound();return;}
      send({type:'error',id:j.id,message:'搜索未能完成，请切换模式后重试。'});job=null;return;
    }
    j.lastComplete=rs;
    if(j.recovery||j.depth>=j.cfg.maxDepth||j.spentBudget>=j.cfg.budget-1){riskStart();return;}
    j.depth++;searchRound();
  }
  function mobility(b){
    let n=0;
    for(const d of DIRS){
      let possible=false;
      for(const line of Game2048.LINES[d]){
        let empty=false,prior=0;
        for(const i of line){const v=b[i];if(!v){empty=true;continue;}if(empty||prior===v){possible=true;break;}prior=v;}
        if(possible)break;
      }
      if(possible)n++;
    }
    return n;
  }
  function fragility(src,dir){
    const b=moveBoardPlain(src,dir).board,empty=[];for(let i=0;i<16;i++)if(!b[i])empty.push(i);
    let dead=0,forced=0,tight=0,minMoves=4;
    for(const i of empty)for(const [v,p] of [[2,.9],[4,.1]]){b[i]=v;const n=mobility(b),q=p/empty.length;b[i]=0;minMoves=Math.min(minMoves,n);if(!n)dead+=q;if(n<=1)forced+=q;if(n<=2)tight+=q;}
    return {dead,forced,tight,minMoves};
  }
  function riskStart(){
    const j=job,e=countEmpties(j.rootBoard),base=bestOf(scoresFor(j));
    if(j.cfg.forceJS){finish();return;}
    const f=fragility(j.rootBoard,base);
    if(!(e<=1||(e<=3&&j.branches.length<=2)||f.dead>0||f.forced>=.06||f.tight>=.45||f.minMoves<=1)){finish();return;}
    riskRound(j.cfg.riskH);
  }
  function riskRound(h){round('risk',[{type:'riskall',round:'risk',board:job.rootBoard,horizon:h,nodeLimit:job.cfg.riskNodes}]);}
  function riskComplete(r){
    const j=job;j.riskNodes+=r.nodes||0;
    if((!r.ok||!r.best||!r.survivals)&&j.cfg.riskH>6&&!j.riskFallback){j.riskFallback=true;riskRound(6);return;}
    j.riskResult=r;
    if(!r.ok||!r.best||!r.survivals){finish();return;}
    const base=bestOf(scoresFor(j)),cur=r.survivals[base],alt=r.survivals[r.best];
    if(!Number.isFinite(cur)||!Number.isFinite(alt)||base===r.best){finish();return;}
    j.riskGap=alt-cur;
    if(j.riskGap<j.cfg.riskGap){finish();return;}
    j.verifyBase=base;j.verifySafe=r.best;
    const c=j.cfg,late=countEmpties(j.rootBoard)<=5;
    const vc={...c,sampleCap:Math.max(5,c.sampleCap),exactPlies:Math.max(2,c.exactPlies),exactWhenEmpty:Math.max(5,c.exactWhenEmpty),probCut:Math.min(c.probCut,late?2e-5:5e-5),ttBits:Math.max(15,c.ttBits)};
    round('verify',j.branches.filter(b=>b.dir===base||b.dir===r.best).map(b=>({...b,type:'exact',round:'verify',depth:j.lastComplete[0].depth+1,cfg:vc})));
  }
  function finish(){
    const j=job,scores=scoresFor(j),result={id:j.id,revision:j.revision,best:j.overrideBest||bestOf(scores),scores,
      depth:j.lastComplete[0].depth,nodes:j.nodes+j.riskNodes+j.verifyNodes,time:performance.now()-j.started,
      parallel:Math.min(slots.length,j.branches.length),engine:j.lastComplete.every(x=>x.engine==='wasm64')?'wasm64-v9.3':'js-v9.3',
      riskChecked:!!j.riskResult?.ok,riskAborted:!!j.riskResult&&!j.riskResult.ok,riskFallback:j.riskFallback,
      verified:j.verified,verifiedScores:j.verifiedScores,riskGap:j.riskGap,discardedNodes:j.discardedNodes,discardedRounds:j.discardedRounds,recovered:j.recovery};
    cache={key:j.key,value:result};job=null;deliver(result,j.transform);begin();
  }
  function deliver(r,t){
    const map=s=>s&&Object.fromEntries(Object.entries(s).map(([d,v])=>[inverseTransformDir(d,t),v]));
    send({type:'result',...r,best:r.best?inverseTransformDir(r.best,t):null,scores:map(r.scores),verifiedScores:map(r.verifiedScores)});
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

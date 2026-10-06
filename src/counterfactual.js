// V11.8: complete, paired counterfactual continuations. No access to game RNG.
'use strict';
const Counterfactual2048=(()=>{
  const DIRS=['up','left','right','down'];
  const LINES={up:[[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15]],
    left:[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]],
    right:[[3,2,1,0],[7,6,5,4],[11,10,9,8],[15,14,13,12]],
    down:[[12,8,4,0],[13,9,5,1],[14,10,6,2],[15,11,7,3]]};
  const SETTINGS=Object.freeze({horizon:96,samples:16,policyDepth:2,maxValueGap:.003,minMeanGain:1,minTailGain:1});
  function mix(x){x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return (x^(x>>>16))>>>0;}
  function seed(board){let x=0x1182048;for(let i=0;i<16;i++)x=mix(x^mix(board[i]+Math.imul(i+1,0x9e3779b9)));return x;}
  function uniform(s,path,step,kind){return mix(s^Math.imul(path+1,0x9e3779b9)^Math.imul(step+1,0x85ebca6b)^Math.imul(kind+1,0xc2b2ae35))/4294967296;}
  function ranks(board,horizon,depth){
    if(!Array.isArray(board)||board.length!==16||!Number.isInteger(horizon)||horizon<1||horizon>128||!Number.isInteger(depth)||depth<2||depth>3)return null;
    let mass=0;const out=new Uint8Array(16);
    for(let i=0;i<16;i++){const v=board[i];if(v!==0&&!(Number.isInteger(v)&&v>=2&&v<=32768&&(v&(v-1))===0))return null;mass+=v;out[i]=v?31-Math.clz32(v):0;}
    // Covers EVERY simulated birth and EVERY continuation value-core horizon.
    // Rank-15 merges can never overflow under this strict total-mass bound.
    return mass+4*(horizon+depth)<65536?out:null;
  }
  function move(src,dir){
    const dst=new Uint8Array(16),line=new Uint8Array(4);let gain=0;
    for(const ids of LINES[dir]){let n=0,k=0;for(let i=0;i<4;i++)if(src[ids[i]])line[n++]=src[ids[i]];
      for(let i=0;i<n;i++){let r=line[i];if(i+1<n&&r===line[i+1]){r++;gain+=2**r;i++;}dst[ids[k++]]=r;}}
    for(let i=0;i<16;i++)if(src[i]!==dst[i])return {board:dst,gain};return null;
  }
  function words(board){let lo=0,hi=0;for(let i=0;i<16;i++){if(board[i]>15)throw new RangeError('Unrepresentable simulation tile');if(i<8)lo|=board[i]<<(4*i);else hi|=board[i]<<(4*(i-8));}return [lo>>>0,hi>>>0];}
  function stats(lives){const sorted=Array.from(lives).sort((a,b)=>a-b),n=lives.length,k=Math.max(1,Math.ceil(n/4));return {mean:sorted.reduce((a,b)=>a+b,0)/n,tail:sorted.slice(0,k).reduce((a,b)=>a+b,0)/k,deaths:sorted.filter(x=>x<SETTINGS.horizon).length};}
  function run(board,options,score){
    const {horizon,samples,policyDepth}=options;
    const start=ranks(board,horizon,policyDepth);
    if(!start||!Number.isInteger(samples)||samples<8||samples>64||samples%2||!Number.isInteger(options.seed)||options.seed<0||options.seed>0xffffffff)return {ok:false,lives:null,reason:'invalid or uncertified simulation input'};
    const lives=[],merges=[],minSpaces=[],terminalScores=[],endpoints=[];let searches=0;
    try{
      for(let p=0;p<samples;p++){
        let b=start.slice(),life=horizon,merged=0,minSpace=16,lastScore=0,endpoint=null;
        for(let step=0;step<horizon;step++){
          const empty=[];for(let i=0;i<16;i++)if(!b[i])empty.push(i);
          if(!empty.length)throw new Error('No birth cell in a legal afterstate');
          b[empty[Math.floor(uniform(options.seed,p,step,0)*empty.length)]]=uniform(options.seed,p,step,1)<.9?1:2;
          minSpace=Math.min(minSpace,empty.length-1);
          let best=null,bestValue=-Infinity;
          // Complete same-depth comparison of ALL legal continuation actions.
          for(const d of DIRS){const m=move(b,d);if(!m)continue;const value=score(words(m.board),policyDepth);searches++;
            if(!Number.isFinite(value))throw new Error('Incomplete continuation score');
            if(value>bestValue||(value===bestValue&&m.gain>(best?.gain||0))){best=m;bestValue=value;}}
          if(options.captureEndpoints&&(step===horizon-1||!best))endpoint={board:Array.from(b,r=>r?2**r:0),terminal:!best};
          if(!best){life=step+1;break;}
          b=best.board;merged+=best.gain;lastScore=bestValue;
        }
        lives.push(life);merges.push(merged);minSpaces.push(minSpace);terminalScores.push(lastScore);if(options.captureEndpoints)endpoints.push(endpoint);
      }
      return {ok:true,lives,merges,minSpaces,terminalScores,searches,horizon,samples,policyDepth,seed:options.seed,...(options.captureEndpoints?{endpoints}:{})};
    }catch(error){return {ok:false,lives:null,searches,reason:String(error.message||error)};}
  }
  function improve(a,b,tailGuard){
    const x=stats(a),y=stats(b),diff=a.map((v,i)=>v-b[i]),mean=diff.reduce((s,v)=>s+v,0)/diff.length;
    const variance=diff.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,diff.length-1),se=Math.sqrt(variance/diff.length);
    return {passed:mean>=SETTINGS.minMeanGain&&mean>=1.5*se&&x.deaths<=y.deaths&&(!tailGuard||x.tail-y.tail>=SETTINGS.minTailGain),meanGain:mean,tailGain:x.tail-y.tail,pairedSE:se,alternative:x,baseline:y};
  }
  function choose(results,baseline,scores,{confirmation=true,tailGuard=true,allowed=null}={}){
    const dirs=DIRS.filter(d=>Object.hasOwn(scores,d)),valid=dirs.length>=2&&dirs.includes(baseline)&&dirs.every(d=>Number.isFinite(scores[d])&&results[d]?.ok&&results[d].horizon===SETTINGS.horizon&&results[d].samples===SETTINGS.samples&&results[d].lives?.length===SETTINGS.samples&&results[d].lives.every(x=>Number.isInteger(x)&&x>=1&&x<=SETTINGS.horizon));
    if(!valid)return {best:baseline,changed:false,complete:false,reason:'discarded incomplete planning round'};
    const reference=results[baseline].lives,half=SETTINGS.samples/2,den=Math.max(1,Math.abs(scores[baseline]));
    const candidates=[],evidence={};
    for(const d of dirs){if(d===baseline||(allowed&&!allowed.includes(d))||(scores[baseline]-scores[d])/den>SETTINGS.maxValueGap)continue;
      const a=results[d].lives,b=reference;
      const explore=improve(a.slice(0,half),b.slice(0,half),tailGuard),confirm=improve(a.slice(half),b.slice(half),tailGuard);
      evidence[d]={explore,confirm};if(explore.passed&&(!confirmation||confirm.passed))candidates.push(d);}
    candidates.sort((a,b)=>stats(results[b].lives).tail-stats(results[a].lives).tail||stats(results[b].lives).mean-stats(results[a].lives).mean||DIRS.indexOf(a)-DIRS.indexOf(b));
    const best=candidates[0]||baseline;return {best,changed:best!==baseline,complete:true,confirmed:best!==baseline&&confirmation,evidence,baseline,summary:Object.fromEntries(dirs.map(d=>[d,stats(results[d].lives)]))};
  }
  function strongEscape(results,baseline,alternative){
    const dirs=[baseline,alternative],n=SETTINGS.samples/2,H=SETTINGS.horizon;
    const complete=baseline!==alternative&&dirs.every(d=>results[d]?.ok&&results[d].horizon===H&&results[d].samples===n*2&&results[d].lives?.length===n*2&&results[d].lives.every(x=>Number.isInteger(x)&&x>=1&&x<=H));
    if(!complete)return {complete:false,passed:false};
    const banks=[];for(let bank=0;bank<2;bank++){
      const a=results[alternative].lives.slice(bank*n,bank*n+n),b=results[baseline].lives.slice(bank*n,bank*n+n),e=improve(a,b,true),diff=a.map((v,i)=>v-b[i]);
      const sum=diff.reduce((s,v)=>s+v,0),worst=Math.min(...diff),passed=e.passed&&sum>=H&&e.tailGain>=H/n&&worst>=-H/n&&e.alternative.deaths<e.baseline.deaths;
      banks.push({...e,totalLifeGain:sum,worstPairedGain:worst,passed});
    }
    return {complete:true,passed:banks.every(b=>b.passed),banks,rule:'both banks gain at least one horizon in total, improve low tail by H/bank size, reduce sampled deaths and bound every paired loss by H/bank size'};
  }
  return {SETTINGS,DIRS,seed,uniform,ranks,move,words,stats,run,choose,strongEscape};
})();
if(typeof module!=='undefined')module.exports=Counterfactual2048;

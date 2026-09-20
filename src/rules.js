// Shared, DOM-free game rules and search policy. Values are tile values, not ranks.
'use strict';
const Game2048=(()=>{
    const LINES={
      left:[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]],right:[[3,2,1,0],[7,6,5,4],[11,10,9,8],[15,14,13,12]],
      up:[[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15]],down:[[12,8,4,0],[13,9,5,1],[14,10,6,2],[15,11,7,3]]
    };
    function moveBoardDetailed(src,dir){
      const out=Array(16).fill(0),motions=[],merged=[],lines=LINES[dir],vals=new Array(4),from=new Int8Array(4);let moved=false,gain=0;
      for(let k=0;k<4;k++){
        const ids=lines[k];let n=0;for(let j=0;j<4;j++){const idx=ids[j],v=src[idx];if(v){vals[n]=v;from[n++]=idx}}let slot=0;
        for(let i=0;i<n;i++){const dest=ids[slot],v=vals[i];if(i+1<n&&v===vals[i+1]){const value=v*2;out[dest]=value;gain+=value;merged.push(dest);motions.push({from:from[i],to:dest,value:v},{from:from[i+1],to:dest,value:v});i++;slot++}else{out[dest]=v;motions.push({from:from[i],to:dest,value:v});slot++}}
      }
      for(let i=0;i<16;i++)if(out[i]!==src[i]){moved=true;break}
      return{board:out,moved,gain,merged,motions};
    }
    function moveBoardPlain(src,dir){
      const out=Array(16).fill(0),lines=LINES[dir],vals=new Array(4);let moved=false,gain=0;
      for(let k=0;k<4;k++){const ids=lines[k];let n=0;for(let j=0;j<4;j++){const v=src[ids[j]];if(v)vals[n++]=v}let slot=0;for(let i=0;i<n;i++){const dest=ids[slot],v=vals[i];if(i+1<n&&v===vals[i+1]){const nv=v*2;out[dest]=nv;gain+=nv;i++;slot++}else{out[dest]=v;slot++}}}
      for(let i=0;i<16;i++)if(out[i]!==src[i]){moved=true;break}return{board:out,moved,gain};
    }
    function transformCoord(i,t){const r=(i/4)|0,c=i&3;let rr=r,cc=c;switch(t){case 1:rr=c;cc=3-r;break;case 2:rr=3-r;cc=3-c;break;case 3:rr=3-c;cc=r;break;case 4:rr=r;cc=3-c;break;case 5:rr=3-c;cc=3-r;break;case 6:rr=3-r;cc=c;break;case 7:rr=c;cc=r;break}return rr*4+cc}
    function transformBoard(src,t){const out=Array(16);for(let i=0;i<16;i++)out[transformCoord(i,t)]=src[i];return out}
    function transformDir(dir,t){const vec={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]}[dir],a=transformCoord(5,t),b=transformCoord((1+vec[0])*4+(1+vec[1]),t),dr=((b/4)|0)-((a/4)|0),dc=(b&3)-(a&3);return dr<0?'up':dr>0?'down':dc<0?'left':'right'}
    function inverseTransformDir(dir,t){for(const d of ['up','left','right','down'])if(transformDir(d,t)===dir)return d;return dir}
    function canonicalAI(src){let best=null,bestT=0;for(let t=0;t<8;t++){const b=transformBoard(src,t);if(!best){best=b;bestT=t;continue}let better=false;for(let i=0;i<16;i++){if(b[i]===best[i])continue;better=b[i]>best[i];break}if(better){best=b;bestT=t}}return{board:best,t:bestT}}
    function countEmpties(src){let n=0;for(let i=0;i<16;i++)if(!src[i])n++;return n}
    function config(board,strength){
      const empties=countEmpties(board),late=empties<=5;
      // V9.1 keeps V9's proven fast search semantics. The new change is compute
      // reallocation: cap low-value early/mid refinements, then spend a little more
      // only after the board becomes genuinely crowded.
      const common={forceJS:board.some(v=>v>=32768)||legalRootBranches(board).some(b=>b.board.some(v=>v>=32768)),sampleCap:4,exactPlies:1,exactWhenEmpty:3,probCut:late?1.8e-4:3e-4,phase:late?1:0,ttBits:15,cacheMinDepth:1,overflowBonus:2000000};
      const stageCap=empties>=7?5:empties===6?6:empties===5?7:null;
      if(strength==='fast'){
        // Fast keeps the V9 main line. Only true late game gets a small budget bump;
        // the rejected global "<=7 empties => d4" rule stays rejected.
        const baseDepth=empties<=2?5:empties<=5?4:3;
        const budget=empties<=1?10:empties<=3?8:6;
        return{...common,baseDepth,budget,fallbackBudget:48,maxDepth:8,riskH:6,riskNodes:120000,riskGap:.018,verifyBudget:20};
      }
      if(strength==='extreme'){
        const baseDepth=empties<=2?5:4,modeMax=11,maxDepth=stageCap?Math.min(modeMax,stageCap):modeMax;
        return{...common,baseDepth,budget:58,fallbackBudget:480,maxDepth,riskH:7,riskNodes:300000,riskGap:.012,verifyBudget:72};
      }
      // Strong keeps d4 as its quality floor, but no longer burns the whole 22ms
      // budget chasing d8/d9/d10 while the board is still open. The saved average
      // compute is re-invested once empties <= 4, where deeper horizon matters more.
      const modeMax=10,maxDepth=stageCap?Math.min(modeMax,stageCap):modeMax;
      const budget=empties<=2?32:empties<=4?28:22;
      return{...common,baseDepth:empties<=2?5:4,budget,fallbackBudget:180,maxDepth,riskH:6,riskNodes:180000,riskGap:.015,verifyBudget:36};
    }
    function legalRootBranches(src){
      const out=[];for(const d of ['up','left','right','down']){const m=moveBoardPlain(src,d);if(m.moved)out.push({dir:d,board:m.board,gain:m.gain})}return out;
    }

return {LINES,moveBoardPlain,moveBoardDetailed,transformCoord,transformBoard,transformDir,inverseTransformDir,canonicalAI,countEmpties,config,legalRootBranches};
})();
if(typeof module!=='undefined')module.exports=Game2048;

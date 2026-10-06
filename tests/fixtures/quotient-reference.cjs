'use strict';
// Research candidate. Ranks, not tile values. No production engine imports this.
function canonicalize(board,h,mode='combined'){
  if(!Number.isInteger(h)||h<0||h>64)throw new RangeError('h must be 0..64');
  if(!['raw','gap','combined','unsafe'].includes(mode))throw new Error('Unknown mode');
  if(!board.length||board.length>16||board.some(r=>!Number.isInteger(r)||r<0||r>31))throw new RangeError('Use 1..16 cells with ranks 0..31');
  if(mode==='raw')return Array.from(board);
  const counts=new Uint8Array(32),map=new Uint8Array(32);map[1]=1;map[2]=2;
  for(const r of board)counts[r]++;
  let previous=2,mapped=2,prefix=counts[1]*2+counts[2]*4,mappedPrefix=prefix;
  for(let r=3;r<32;r++)if(counts[r]){
    const massBound=Math.floor(Math.log2(prefix+4*h));
    const bound=mode==='gap'?previous+h:Math.min(previous+h,massBound);
    let next;
    if(mode==='unsafe')next=mapped+1;
    else if(r>bound){
      const mappedBound=mode==='gap'?mapped+h:Math.min(mapped+h,Math.floor(Math.log2(mappedPrefix+4*h)));
      next=Math.max(mapped+1,mappedBound+1);
    }else next=mapped+(r-previous);
    map[r]=next;prefix+=counts[r]*2**r;mappedPrefix+=counts[r]*2**next;previous=r;mapped=next;
  }
  return Array.from(board,r=>map[r]);
}
// Pure reference mover supports rectangular boards and has no rank saturation.
function move(board,dir,width=4){
  const height=board.length/width,out=Array(board.length).fill(0);
  if(!Number.isInteger(height)||!['up','left','right','down'].includes(dir))throw new Error('Invalid board/direction');
  const horizontal=dir==='left'||dir==='right',count=horizontal?height:width,length=horizontal?width:height;
  for(let k=0;k<count;k++){
    const ids=[];for(let j=0;j<length;j++){const p=dir==='right'||dir==='down'?length-1-j:j;ids.push(horizontal?k*width+p:p*width+k);}
    const values=ids.map(i=>board[i]).filter(Boolean);let slot=0;
    for(let j=0;j<values.length;j++){if(values[j]===values[j+1]){out[ids[slot++]]=values[j]+1;j++;}else out[ids[slot++]]=values[j];}
  }
  return out.some((r,i)=>r!==board[i])?out:null;
}
const dirs=['up','left','right','down'];
function solver(width=4){
  const cache=new Map();
  function survive(b,h){
    const key=h+':'+b.join(',');if(cache.has(key))return cache.get(key);
    const moves=dirs.map(d=>move(b,d,width)).filter(Boolean);
    if(!moves.length)return 0;if(h===0)return 1;
    let best=0;for(const af of moves){const empty=af.flatMap((r,i)=>r?[]:[i]);let v=0;
      for(const p of empty){const b2=af.slice(),b4=af.slice();b2[p]=1;b4[p]=2;v+=.9/empty.length*survive(b2,h-1)+.1/empty.length*survive(b4,h-1);}
      if(v>best)best=v;
    }cache.set(key,best);return best;
  }
  function actionValues(b,h){return dirs.map(d=>{const af=move(b,d,width);if(!af)return -1;const empty=af.flatMap((r,i)=>r?[]:[i]);let value=0;
    for(const p of empty){const x=af.slice(),y=af.slice();x[p]=1;y[p]=2;value+=.9/empty.length*survive(x,h-1)+.1/empty.length*survive(y,h-1);}return value;});}
  return {survive,actionValues,clear:()=>cache.clear()};
}
module.exports={canonicalize,move,solver,dirs};

// Real-thread sandbox: each engine runs in its own worker thread, so timings
// reflect true parallel wall clock instead of one serialized event loop.
const {Worker,MessageChannel}=require('worker_threads');
const PREAMBLE=`
const WT=require('worker_threads');
globalThis.MessageChannel=WT.MessageChannel;
globalThis.postMessage=d=>WT.parentPort.postMessage(d);
globalThis.onmessage=null;
WT.parentPort.onmessage=e=>{if(typeof globalThis.onmessage==='function')globalThis.onmessage({data:e.data});};
`;
function makeWorker(src){
  const w=new Worker(PREAMBLE+src,{eval:true});
  const handlers=[];
  w.on('message',d=>{const hs=handlers.slice();for(const h of hs)h({data:d});});
  const out={};
  Object.defineProperty(out,'onmessage',{set(f){handlers.length=0;if(f)handlers.push(f);},get(){return handlers[0]||null;}});
  const send=d=>{
    const list=[];
    const walk=v=>{if(!v||typeof v!=='object')return;if(v.constructor&&/MessagePort/.test(v.constructor.name)){list.push(v);return;}for(const k in v)walk(v[k]);};
    walk(d);
    try{w.postMessage(d,list);}catch(e){w.postMessage(d);}
  };
  return {postMessage:send,out,terminate:()=>w.terminate()};
}
function chan(){return new MessageChannel();}
module.exports={makeWorker,chan};

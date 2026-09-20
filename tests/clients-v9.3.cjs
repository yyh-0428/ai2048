'use strict';
const fs=require('node:fs'),path=require('node:path');
const {MessageChannel}=require('node:worker_threads');
const {root,thread,scripts}=require('./harness.cjs');
function sources(version){
  const html=fs.readFileSync(path.join(root,version==='9.2'?'tests/fixtures/v9.2.html':'2048-ai.html'),'utf8');
  return {worker:scripts(html).worker,coordinator:html.match(/<script id="ai-coordinator-source" type="text\/plain">([\s\S]*?)<\/script>/)[1]};
}
async function client(version,{coordinator=false,poolSize=4}={}){
  const s=sources(version),workers=[],pending=new Map();let serial=0,ready;
  const main=thread(coordinator?s.coordinator:s.worker+"\nPromise.all([WASM_READY,SURVIVAL_READY]).then(()=>postMessage({type:'test-ready'}));");workers.push(main);
  const initialized=new Promise(resolve=>{ready=resolve;if(coordinator)resolve();});
  main.on('message',r=>{if(r.type==='test-ready')return ready();const p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error||r.type==='error'?p.reject(new Error(r.error||r.message)):p.resolve(r);});
  main.on('error',error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();});
  if(coordinator){const ports=[];for(let i=0;i<poolSize;i++){const w=thread(s.worker),{port1,port2}=new MessageChannel();workers.push(w);ports.push(port1);w.postMessage({type:'connect',port:port2},[port2]);}main.postMessage({type:'init',ports},ports);}
  await initialized;
  return {request(task){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Request timed out'));},30000);pending.set(id,{resolve,reject,timer});main.postMessage({...task,id,revision:id});});},
    async close(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Client closed'));}pending.clear();await Promise.all(workers.map(w=>w.terminate()));}};
}
module.exports={client,sources};

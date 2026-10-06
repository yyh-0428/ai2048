const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,rules,rng,engine,thread}=require('./harness.cjs');
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8'),dirs=['up','left','right','down'];
const pack=b=>b.reduce((p,v,i)=>(p[i>>3]=(p[i>>3]|((v?Math.log2(v):0)<<((i&7)*4)))>>>0,p),[0,0]);
const unpack=p=>Array.from({length:16},(_,i)=>{const v=(p[i>>3]>>>((i&7)*4))&15;return v?2**v:0});
const trap=[2,4,64,4,512,32,256,8,4,256,1024,4,2,2,4,2048];
function call(w,m){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('worker timeout')),10000);w.once('message',r=>{clearTimeout(t);resolve(r)});w.postMessage(m);});}
test('proof bitboards: 20000 moves match independent rules, including rank-15 saturation',async()=>{
 const e=engine(worker);await e.ready;const p=e.safety(),random=rng(81);
 for(let n=0;n<5000;n++){const b=Array.from({length:16},()=>random()<.3?0:2**(1+Math.floor(random()*15)));for(let d=0;d<4;d++)assert.deepEqual(Array.from(unpack(p.move(...pack(b),d))),rules.moveBoardPlain(b,dirs[d]).board.map(v=>Math.min(v,32768)));}
});
test('certificates are one-sided: match independent full Survival, including horizon and warm-cache reuse',async()=>{
 const e=engine(worker);await e.ready;const p=e.safety(),random=rng(638),boards=[trap];let positives=0,unknown=0;
 for(let n=0;n<100;n++)boards.push(Array.from({length:16},()=>random()<.12?0:2**(1+Math.floor(random()*7))));
 for(const b of boards)for(const h of [1,2,3,4]){
  const r=await e.wasmRiskAll(b,h,1000000);assert.equal(r.ok,true);
  for(let d=0;d<4;d++){const q=p.certify(...pack(b),d,h,20000,0);if(q.certified){positives++;assert.ok(r.survivals[dirs[d]]>=1-1e-12);for(let lower=1;lower<h;lower++)assert.equal(p.certify(...pack(b),d,lower,20000,0).certified,true);}else unknown++;}
 }
 assert.ok(positives>50);assert.ok(unknown>50);
 const r=await e.wasmRiskAll(trap,6,1000000);assert.ok(r.survivals.left<.99);assert.equal(p.certify(...pack(trap),1,6,100000,0).certified,false);
});
test('proof budget exhaustion, terminal and illegal directions can never certify',async()=>{
 const e=engine(worker);await e.ready;const p=e.safety();
 assert.equal(p.certify(...pack(trap),1,6,0,0).certified,false);
 const dead=[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2,4,2];
 for(let d=0;d<4;d++)assert.equal(p.certify(...pack(dead),d,6,5000,0).certified,false);
 assert.equal(p.certify(0,0,0,6,5000,0).certified,false);
});
test('production worker: successful proof skips risk; unknown or tiny gap uses unchanged WASM',async()=>{
 const w=thread(worker);try{
  const safe=[2,4,...Array(14).fill(0)];
  let r=await call(w,{type:'riskall',board:safe,horizon:6,nodeLimit:120000,baseline:'right',minGap:.018});assert.equal(r.proofCertified,true);assert.equal(r.best,'right');assert.equal(r.survivals.right,1);
  r=await call(w,{type:'riskall',board:trap,horizon:6,nodeLimit:300000,baseline:'left',minGap:.018});assert.equal(r.proofCertified,false);assert.equal(r.ok,true);assert.equal(r.best,'right');assert.ok(r.survivals.right-r.survivals.left>.05);
  r=await call(w,{type:'riskall',board:safe,horizon:6,nodeLimit:100,baseline:'right',minGap:0});assert.equal(r.proofNodes,0);assert.equal(r.proofCertified,false);assert.equal(r.ok,false);
 }finally{await w.terminate();}
});
test('empty-space bound counts all 65536 occupancy masks exactly',async()=>{
 const e=engine(worker);await e.ready;const p=e.safety();
 for(let mask=0;mask<65536;mask++){const b=Array.from({length:16},(_,i)=>mask&(1<<i)?2**(1+i%15):0);assert.equal(p.empties(...pack(b)),b.filter(v=>!v).length);}
});
test('invalid horizons and 32768+ merges cannot create a certificate',async()=>{
 const e=engine(worker);await e.ready;const p=e.safety(),b=[32768,32768,...Array(14).fill(0)];
 assert.equal(p.certify(...pack(b),1,6,10000,0).certified,false);
 for(const h of [-1,0,8,NaN,Infinity])assert.equal(p.certify(...pack(trap),1,h,1000,0).certified,false);
 for(const d of [-1,4,NaN])assert.equal(p.certify(...pack(trap),d,6,1000,0).certified,false);
});
test('forced certificate-table collisions are checked against the full board',()=>{
 const vm=require('vm'),c={performance,Math:Object.assign(Object.create(Math),{imul:()=>0})};vm.createContext(c);
 vm.runInContext(worker.slice(worker.indexOf('function createSafetyProof(){'),worker.indexOf('let SAFETY=null'))+';globalThis.p=createSafetyProof()',c);
 const safe=[2,4,...Array(14).fill(0)];assert.equal(c.p.certify(...pack(safe),2,6,10000,0).certified,true);
 assert.equal(c.p.certify(...pack(trap),1,6,100000,0).certified,false);
});
test('production WASM and rule body remain frozen apart from optional root reuse',()=>{
 const html=fs.readFileSync(path.join(root,'tests/fixtures/v9.2.html'),'utf8');
 for(const name of ['WASM_B64','SURVIVAL_WASM_B64']){const re=new RegExp('const '+name+"='([^']+)'");assert.deepEqual(Buffer.from(worker.match(re)[1],'base64'),Buffer.from(html.match(re)[1],'base64'));}
 const current=fs.readFileSync(path.join(root,'src/rules.js'),'utf8')
   .replace('config(board,strength,branches=null)','config(board,strength)')
   .replace('(branches||legalRootBranches(board)).some','legalRootBranches(board).some');
 assert.ok(html.includes(current));
});
test('proof initialization failure falls back to the original risk engine',async()=>{
 const source=worker.replace('function createSafetyProof(){',"function createSafetyProof(){throw new Error('simulated allocation failure');");
 const w=thread(source);try{const r=await call(w,{type:'riskall',board:trap,horizon:6,nodeLimit:300000,baseline:'left',minGap:.018});assert.equal(r.error,undefined);assert.equal(r.proofCertified,false);assert.equal(r.ok,true);assert.equal(r.best,'right');}finally{await w.terminate();}
});

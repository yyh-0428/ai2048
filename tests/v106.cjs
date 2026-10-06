'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {root,rules,engine}=require('./harness.cjs'),{client}=require('./clients-v10.cjs');
const worker=fs.readFileSync(root+'/src/worker.js','utf8');
function eligibility(){const c={Game2048:rules,performance,postMessage(){},onmessage:null};vm.createContext(c);let s=fs.readFileSync(root+'/src/coordinator.js','utf8'),i=s.lastIndexOf('})();');vm.runInContext(s.slice(0,i)+'globalThis.eligible=valueCoreEligible;'+s.slice(i),c);vm.runInContext(worker+'\nglobalThis.packValue=packValue4;',c);return c;}
test('rank-15 value entry requires a strict mass/horizon certificate; legacy packing unchanged',()=>{
 const c=eligibility(),safe=[32768,16,8,4,2048,64,4,2,128,16,8,0,32,8,4,0];
 assert.equal(c.eligible(safe),true);assert.ok(c.packValue(safe,6));
 for(const b of [[32768,32768,...Array(14).fill(0)],[65536,...Array(15).fill(0)],[16384,16384,16384,16384,...Array(12).fill(0)],Array(16)]){assert.equal(c.eligible(b),false);assert.equal(c.packValue(b,6),null);}
 const near=[32768,16384,8192,4096,2048,1024,512,256,128,64,16,8,4,4,2,4];assert.equal(near.reduce((a,b)=>a+b,0),65510);assert.ok(c.packValue(near,6));near[14]*=2;assert.equal(c.packValue(near,6),null);assert.equal(c.eligible(near),false);
 assert.equal(c.packValue(safe,7),null);
 const e=engine(worker);assert.equal(e.pack4(safe),null);
});
test('safe 32768 uses value WASM while 65536 and possible overflow stay on exact JS',async()=>{
 const c=await client('current',{coordinator:true});
 try{const safe=[32768,16,8,4,2048,64,4,2,128,16,8,0,32,8,4,0];
  let r=await c.request({type:'analyze',board:safe,strength:'extreme'});assert.equal(r.wideValueCore,true);assert.ok(r.engine.includes('wasm-expectimax'));assert.equal(r.depth,6);assert.ok(rules.moveBoardPlain(safe,r.best).moved);
  for(const b of [[...safe.slice(0,1),32768,...safe.slice(2)],[65536,...safe.slice(1)]]){r=await c.request({type:'analyze',board:b,strength:'extreme'});assert.equal(r.wideValueCore,false);assert.ok(r.engine.startsWith('js'));assert.ok(Object.values(r.scores).every(Number.isFinite));assert.ok(rules.moveBoardPlain(b,r.best).moved);}
 }finally{await c.close();}
});

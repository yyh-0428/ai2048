const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {root}=require('./harness.cjs');

function rng(seed){let x=seed>>>0;return()=>((x=Math.imul(x,1664525)+1013904223>>>0)>>>0);}

test('V10.3 optimized spawn enumeration is score/node/cache equivalent to archived V10.2 core',async()=>{
  const oldBytes=fs.readFileSync(path.join(root,'archive/v10.2-core/v102_ai.wasm'));
  const newBytes=fs.readFileSync(path.join(root,'v102_ai.wasm'));
  assert.notDeepEqual(newBytes,oldBytes,'optimized scorer should be a distinct build');
  const [{instance:oldI},{instance:newI}]=await Promise.all([
    WebAssembly.instantiate(oldBytes,{}),WebAssembly.instantiate(newBytes,{})
  ]);
  const a=oldI.exports,b=newI.exports;a.v102_init();b.v102_init();
  const random=rng(0x1032048);
  for(let i=0;i<256;i++){
    let lo=0,hi=0;
    for(let n=0;n<8;n++){
      const r1=(random()>>>28)%15,r2=(random()>>>28)%15;
      lo=(lo|(r1<<(n*4)))>>>0;hi=(hi|(r2<<(n*4)))>>>0;
    }
    for(const depth of [3,4]){
      const sa=a.v102_score_depth(lo,hi,depth),na=a.v102_nodes()>>>0,ha=a.v102_cache_hits()>>>0;
      const sb=b.v102_score_depth(lo,hi,depth),nb=b.v102_nodes()>>>0,hb=b.v102_cache_hits()>>>0;
      assert.equal(sb,sa,`score differs at sample ${i} d${depth}`);
      assert.equal(nb,na,`node count differs at sample ${i} d${depth}`);
      assert.equal(hb,ha,`cache hits differ at sample ${i} d${depth}`);
    }
  }
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {root}=require('./harness.cjs');

function encode(board){
  let bits=0n;
  for(let i=0;i<16;i++){
    const v=board[i];
    const rank=v?Math.log2(v):0;
    assert.ok(Number.isInteger(rank)&&rank>=0&&rank<=15);
    bits|=BigInt(rank)<<(4n*BigInt(i));
  }
  return [Number(bits&0xffffffffn)>>>0,Number((bits>>32n)&0xffffffffn)>>>0];
}

test('V10.3 active scorer bytes, exports and deterministic d3/d4 evaluation',async()=>{
  const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
  const match=worker.match(/const V102_WASM_B64='([^']+)'/);
  assert.ok(match,'embedded V10.3 active scorer is present');
  const embedded=Buffer.from(match[1],'base64');
  const external=fs.readFileSync(path.join(root,'v102_ai.wasm'));
  assert.deepEqual(embedded,external,'source worker embeds the shipped v102_ai.wasm byte-for-byte');
  const {instance}=await WebAssembly.instantiate(external,{});
  const e=instance.exports;
  for(const name of ['v102_init','v102_score','v102_score_depth','v102_nodes','v102_cache_hits'])assert.equal(typeof e[name],'function');
  e.v102_init();
  const [lo,hi]=encode([1024,512,128,4,256,64,32,8,16,8,2,0,4,2,0,0]);
  const a=e.v102_score(lo,hi),b=e.v102_score(lo,hi),d4=e.v102_score_depth(lo,hi,4);
  assert.ok(Number.isFinite(a)&&a>0);
  assert.equal(a,b);
  assert.ok(Number.isFinite(d4)&&d4>0);
  assert.ok(e.v102_nodes()>0);
});

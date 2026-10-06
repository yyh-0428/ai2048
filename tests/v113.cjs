'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {client}=require('./clients-v10.cjs'),{root,rules}=require('./harness.cjs');

const HARD_STARTS=[
 [2,32,64,128,4,256,512,1024,8,4096,8192,2048,16,64,32,4],
 [4,2,8,16,32,64,128,256,512,1024,8192,4096,16,8,4,2],
 [8192,4096,2048,1024,512,256,128,64,32,16,8,4,2,4,8,16]
];
const SAFE_32768=[32768,16,8,4,2048,64,4,2,128,16,8,0,32,8,4,0];
const CHANGE=[16,8,8,4,128,64,4,0,512,8,2,2,16384,2,0,0];

test('V11.3 God preserves V11.2 decisions and numeric V102 scores below rank 15',async()=>{
  const old=await client('v11.2',{coordinator:true}),cur=await client('v11.3',{coordinator:true});
  try{
    for(const board of HARD_STARTS){
      const a=await old.request({type:'analyze',board,strength:'god'});
      const b=await cur.request({type:'analyze',board,strength:'god'});
      assert.equal(b.best,a.best);assert.equal(b.depth,a.depth);assert.deepEqual(b.scores,a.scores);
      assert.equal(b.mainNodes,a.mainNodes);assert.equal(b.riskNodes,a.riskNodes);assert.equal(b.proofNodes,a.proofNodes);
    }
  }finally{await old.close();await cur.close();}
});

test('V11.3 God restores the certified rank-15 value core and keeps unsafe overflow on JS',async()=>{
  const c=await client('v11.3',{coordinator:true});
  try{
    let r=await c.request({type:'analyze',board:SAFE_32768,strength:'god'});
    assert.equal(r.wideValueCore,true);assert.ok(r.engine.includes('wasm-expectimax'));assert.equal(r.depth,6);assert.ok(rules.moveBoardPlain(SAFE_32768,r.best).moved);
    for(const board of [[32768,32768,...Array(14).fill(0)],[65536,...SAFE_32768.slice(1)]]){
      r=await c.request({type:'analyze',board,strength:'god'});
      assert.equal(r.wideValueCore,false);assert.ok(r.engine.startsWith('js'));assert.ok(rules.moveBoardPlain(board,r.best).moved);
    }
  }finally{await c.close();}
});

test('God uses full d6 directly; V10.7 ceiling refinement remains isolated to extreme',async()=>{
  const c=await client('v11.3',{coordinator:true});
  try{
    const god=await c.request({type:'analyze',board:CHANGE,strength:'god'});
    assert.equal(god.depth,6);assert.equal(god.ceilingRefined,false);assert.ok(rules.moveBoardPlain(CHANGE,god.best).moved);
    const extreme=await c.request({type:'analyze',board:CHANGE,strength:'extreme'});
    assert.equal(extreme.ceilingRefined,true);assert.equal(extreme.ceilingConsensus,true);assert.equal(extreme.best,'up');
  }finally{await c.close();}
});

test('built V11.3 UI exposes four profiles and defaults new installs to God',()=>{
  const html=fs.readFileSync(root+'/tests/fixtures/v11.3.html','utf8');
  assert.match(html,/2048 · AI V11\.3/);assert.match(html,/data-strength="god"/);assert.match(html,/神级 · 深度残局精算/);
  assert.match(html,/storageGet\('refined2048-strength','god'\)/);
});

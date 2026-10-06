'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {client}=require('./clients-v10.cjs'),{rules}=require('./harness.cjs');
const CHANGE=[16,8,8,4,128,64,4,0,512,8,2,2,16384,2,0,0];
const OSCILLATE=[4,0,0,2,16,4,2,0,8,32,64,32,32,128,512,16384];
const ORDINARY=[128,64,16,4,4,4,2,2,2,0,0,2,0,0,0,0];

test('V10.7 leaves the ordinary V10.6 extreme decision path numerically unchanged',async()=>{
  const old=await client('v10.6/2048-ai',{coordinator:true}),cur=await client('current',{coordinator:true});
  try{
    const a=await old.request({type:'analyze',board:ORDINARY,strength:'extreme'});
    const b=await cur.request({type:'analyze',board:ORDINARY,strength:'extreme'});
    assert.equal(b.ceilingRefined,false);assert.equal(a.best,b.best);assert.equal(a.depth,b.depth);assert.deepEqual(a.scores,b.scores);
  }finally{await old.close();await cur.close();}
});

test('an ambiguous 16384 transition may accept a deeper consensus choice',async()=>{
  const old=await client('v10.6/2048-ai',{coordinator:true}),cur=await client('current',{coordinator:true});
  try{
    const a=await old.request({type:'analyze',board:CHANGE,strength:'extreme'});
    const b=await cur.request({type:'analyze',board:CHANGE,strength:'extreme'});
    assert.equal(a.depth,4);assert.equal(a.best,'left');
    assert.equal(b.ceilingRefined,true);assert.equal(b.ceilingConsensus,true);assert.equal(b.ceilingRejected,false);
    assert.equal(b.best,'up');assert.equal(b.depth,5);assert.ok(b.ceilingGap<=0.0005);assert.ok(rules.moveBoardPlain(CHANGE,b.best).moved);
  }finally{await old.close();await cur.close();}
});

test('d4/d5/d6 ranking oscillation is rejected and restores the complete d4 result',async()=>{
  const old=await client('v10.6/2048-ai',{coordinator:true}),cur=await client('current',{coordinator:true});
  try{
    const a=await old.request({type:'analyze',board:OSCILLATE,strength:'extreme'});
    const b=await cur.request({type:'analyze',board:OSCILLATE,strength:'extreme'});
    assert.equal(b.ceilingRefined,true);assert.equal(b.ceilingConsensus,false);assert.equal(b.ceilingRejected,true);
    assert.equal(b.depth,4);assert.equal(b.best,a.best);assert.deepEqual(b.scores,a.scores);
  }finally{await old.close();await cur.close();}
});

test('ceiling refinement is extreme-only',async()=>{
  const cur=await client('current',{coordinator:true});
  try{const r=await cur.request({type:'analyze',board:CHANGE,strength:'fast'});assert.equal(r.ceilingRefined,false);assert.equal(r.depth,3);}
  finally{await cur.close();}
});

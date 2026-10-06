'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {client}=require('./clients-v10.cjs'),{root,rules}=require('./harness.cjs');

const CEILING_8192=[4,2,4,2,8,4,2,4,16,2,0,0,8192,8,2,0];
const BOARDS=[
 CEILING_8192,
 [2,2,8,64,8,4,16,256,2,8,32,512,0,16,128,8192],
 [2,0,4,64,0,2,32,256,0,0,64,512,4,2,128,8192],
 [2,32,64,128,4,256,512,1024,8,4096,8192,2048,16,64,32,4]
];

test('V11.5 God aliases the survival-first extreme policy exactly',async()=>{
  const c=await client('v11.5',{coordinator:true});
  try{
    for(const board of BOARDS){
      const a=await c.request({type:'analyze',board,strength:'extreme'});
      const b=await c.request({type:'analyze',board,strength:'god'});
      assert.equal(b.best,a.best);assert.equal(b.depth,a.depth);assert.deepEqual(b.scores,a.scores);
      assert.equal(b.ceilingRefined,a.ceilingRefined);assert.equal(b.ceilingConsensus,a.ceilingConsensus);
      assert.equal(b.tieLimit,a.tieLimit);if(b.best)assert.ok(rules.moveBoardPlain(board,b.best).moved);
    }
  }finally{await c.close();}
});

test('V11.5 extends guarded d4/d5/d6 ceiling consensus to 8192',async()=>{
  const old=await client('v11.4',{coordinator:true}),cur=await client('v11.5',{coordinator:true});
  try{
    const a=await old.request({type:'analyze',board:CEILING_8192,strength:'extreme'});
    const b=await cur.request({type:'analyze',board:CEILING_8192,strength:'extreme'});
    assert.equal(a.ceilingRefined,false);assert.equal(a.depth,4);
    assert.equal(b.ceilingRefined,true);assert.equal(b.ceilingConsensus,true);assert.equal(b.ceilingRejected,false);
    assert.ok(b.depth>=5);assert.equal(b.best,'up');assert.ok(rules.moveBoardPlain(CEILING_8192,b.best).moved);
  }finally{await old.close();await cur.close();}
});

test('archived V11.5 UI identifies the survival-first release',()=>{
  const html=fs.readFileSync(root+'/tests/fixtures/v11.5.html','utf8');
  assert.match(html,/2048 · AI V11\.5/);assert.match(html,/V11\.5 · 全程本地计算/);
  assert.match(html,/神级 · 生存优先临界精算/);
});

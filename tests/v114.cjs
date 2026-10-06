'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {client}=require('./clients-v10.cjs'),{root,rules}=require('./harness.cjs');

const BOARDS=[
 [2,2,8,64,8,4,16,256,2,8,32,512,0,16,128,8192],
 [2,0,4,64,0,2,32,256,0,0,64,512,4,2,128,8192],
 [2,32,64,128,4,256,512,1024,8,4096,8192,2048,16,64,32,4]
];

// On this board V11.3's d6 raw ranking is down > right by 0.02084%, but the
// inherited 0.05% merge preference overwrites it and chooses right.
const WIDE_OLD_TIE=BOARDS[0];
// This is a genuinely tiny d6 tie (0.000809%): V11.4 should retain the old
// merge stabilizer here rather than making numerical noise decide the move.
const TRUE_TIE=BOARDS[1];

test('V11.4 leaves fast/strong/extreme decisions and numeric scores identical to V11.3',async()=>{
  const old=await client('v11.3',{coordinator:true}),cur=await client('v11.4',{coordinator:true});
  try{
    for(const strength of ['fast','strong','extreme'])for(const board of BOARDS){
      const a=await old.request({type:'analyze',board,strength});
      const b=await cur.request({type:'analyze',board,strength});
      assert.equal(b.best,a.best,`${strength} best`);assert.equal(b.depth,a.depth,`${strength} depth`);
      assert.deepEqual(b.scores,a.scores,`${strength} scores`);
    }
  }finally{await old.close();await cur.close();}
});

test('God gives completed d6 score authority outside the new 0.005% true-tie gate',async()=>{
  const old=await client('v11.3',{coordinator:true}),cur=await client('v11.4',{coordinator:true});
  try{
    const a=await old.request({type:'analyze',board:WIDE_OLD_TIE,strength:'god'});
    const b=await cur.request({type:'analyze',board:WIDE_OLD_TIE,strength:'god'});
    assert.deepEqual(b.scores,a.scores);assert.equal(b.depth,6);assert.equal(b.tieLimit,0.00005);
    assert.equal(a.tieAdjusted,true);assert.equal(a.best,'right');
    assert.equal(b.tieAdjusted,false);assert.equal(b.best,'down');
    assert.ok(b.scores.down>b.scores.right);assert.ok(rules.moveBoardPlain(WIDE_OLD_TIE,b.best).moved);
  }finally{await old.close();await cur.close();}
});

test('God still stabilizes genuine numerical near-ties with immediate merge value',async()=>{
  const old=await client('v11.3',{coordinator:true}),cur=await client('v11.4',{coordinator:true});
  try{
    const a=await old.request({type:'analyze',board:TRUE_TIE,strength:'god'});
    const b=await cur.request({type:'analyze',board:TRUE_TIE,strength:'god'});
    assert.deepEqual(b.scores,a.scores);assert.equal(b.tieAdjusted,true);assert.equal(b.best,a.best);assert.equal(b.best,'up');
    assert.ok(b.tieGap>0&&b.tieGap<0.00005);
  }finally{await old.close();await cur.close();}
});

test('built V11.4 UI and package metadata identify the new release',()=>{
  const html=fs.readFileSync(root+'/tests/fixtures/v11.4.html','utf8');
  assert.match(html,/2048 · AI V11\.4/);assert.match(html,/V11\.4 · 全程本地计算/);
});

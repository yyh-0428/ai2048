'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {uiHarness,rules,rng}=require('./harness.cjs');
const {client}=require('./clients-v10.cjs');
const maxTile=b=>Math.max(...b);
async function normalAutoplay(target=1000){
 const h=uiHarness({realWorkers:true});h.context.Math=Object.assign(Object.create(Math),{random:rng(10001)});h.hook.newGame(true);h.hook.setStrength('fast');
 let previous=Array.from(h.hook.state().board),score=0,moves=0,proofs=0,risks=0,verified=0;
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`autoplay did not reach ${target} moves`)),60000);
  h.hook.listen(r=>{try{const expected=rules.moveBoardPlain(previous,r.best);assert.equal(expected.moved,true);const s=h.hook.state(),actual=Array.from(s.board);assert.equal(s.moveCount,++moves);score+=expected.gain;assert.equal(s.score,score);const changed=actual.flatMap((v,i)=>v===expected.board[i]?[]:[i]);assert.equal(changed.length,1);assert.equal(expected.board[changed[0]],0);assert.ok([2,4].includes(actual[changed[0]]));proofs+=!!r.proofCertified;risks+=!!r.riskChecked;verified+=!!r.verified;previous=actual;if(moves===target){h.hook.toggleAuto();clearTimeout(timer);resolve();}}catch(e){clearTimeout(timer);reject(e);}});h.hook.toggleAuto();});
  return {moves,score,maxTile:maxTile(previous),proofs,risks,verified};
 }finally{await h.close();}
}
function spawn(board,random){const empty=[];for(let i=0;i<16;i++)if(!board[i])empty.push(i);if(!empty.length)return false;board[empty[Math.floor(random()*empty.length)]]=random()<.9?2:4;return true;}
async function wideRun(limit=120){
 const c=await client('current',{coordinator:true}),random=rng(10002);let board=[0,2,2,4,2,16,4,2,64,16,4,2,2**31,64,16,4],moves=0,score=0,projected=0,proofs=0,risks=0,verified=0,skipped=0;
 try{while(moves<limit&&rules.legalRootBranches(board).length){const r=await c.request({type:'analyze',board,strength:'fast'});const m=rules.moveBoardPlain(board,r.best);assert.equal(m.moved,true);assert.ok(Object.values(r.scores).every(Number.isFinite));score+=m.gain;board=m.board.slice();spawn(board,random);moves++;projected+=!!r.projectionApplied;proofs+=!!r.proofCertified;risks+=!!r.riskChecked;verified+=!!r.verified;skipped+=!!r.riskSkipped;}
  return {moves,score,maxTile:maxTile(board),projected,proofs,risks,verified,skipped,terminal:!rules.legalRootBranches(board).length};
 }finally{await c.close();}
}
(async()=>{const result={date:new Date().toISOString(),normal:await normalAutoplay(),wide:await wideRun()};fs.writeFileSync(path.join(__dirname,'../docs/v10-stress.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {root,rules}=require('../tests/harness.cjs'),{randomStream}=require('./late-game.cjs');
const {addTile,mass,potential,hash,write}=require('./evaluate-v117.cjs');
function replay(row,collect=false){
 const zipped=fs.readFileSync(path.join(root,row.log));assert.equal(hash(zipped),row.logSHA256);
 const raw=zlib.gunzipSync(zipped);assert.equal(hash(raw),row.decisionsSHA256);
 const records=raw.toString().trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
 let board=row.start.game.board.slice(),score=row.start.game.score,spawnMass=row.start.reachability.spawnMass,spawnPotential=row.start.reachability.spawnPotential;
 const random=randomStream(row.start.random.seed,row.start.random.state,row.start.random.draws),states=[];
 for(let i=0;i<records.length;i++){
  const r=records[i],legal=rules.legalRootBranches(board);assert.equal(r.move,i);assert.equal(r.score,score);assert.ok(legal.length);assert.deepEqual(Object.keys(r.scores).sort(),legal.map(b=>b.dir).sort());assert.ok(Object.values(r.scores).every(Number.isFinite));
  if(collect)states.push({board:board.slice(),random:random.snapshot(),...r,empties:rules.countEmpties(board),legal:legal.length});
  const m=rules.moveBoardPlain(board,r.best);assert.ok(m.moved);board=m.board;score+=m.gain;const spawn=addTile(board,random);assert.deepEqual(spawn,r.spawn);assert.deepEqual(random.snapshot(),r.random);
  spawnMass+=spawn.value;spawnPotential+=spawn.value*Math.log2(spawn.value);assert.equal(mass(board),spawnMass);assert.equal(potential(board)-spawnPotential,score);
 }
 assert.equal(records.length,row.additionalMoves);assert.equal(score,row.score);assert.deepEqual(board,row.finalBoard);assert.deepEqual(random.snapshot(),row.finalRandom);assert.equal(rules.legalRootBranches(board).length,0);assert.equal(spawnMass,row.spawnMass);assert.equal(spawnPotential,row.spawnPotential);
 return {checkpoint:row.checkpoint,variant:row.variant,repeat:row.repeat,moves:records.length,passed:true,...(collect?{states}:{})};
}
module.exports={replay};
if(require.main===module){
 const files=process.argv.slice(2).length?process.argv.slice(2):['docs/V11_7_DEVELOPMENT.json','docs/V11_7_MERGE_ABLATION.json','docs/V11_7_RETAIN5_ABLATION.json','docs/V11_7_VALIDATION.json','docs/V11_7_OTHER_MODES.json','docs/V11_7_RELEASE.json'];
 const result={date:new Date().toISOString(),reports:[],passed:true,records:0,moves:0};
 for(const f of files){const j=JSON.parse(fs.readFileSync(path.join(root,f)));assert.equal(j.complete,true);const rows=j.rows.map(r=>replay(r));result.reports.push({file:f,rows});result.records+=rows.length;result.moves+=rows.reduce((s,r)=>s+r.moves,0);}
 write(path.join(root,'docs/V11_7_REPLAY.json'),result);console.log(JSON.stringify({...result,reports:result.reports.map(r=>({file:r.file,games:r.rows.length}))}));
}

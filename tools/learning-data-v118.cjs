'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {root,rules}=require('../tests/harness.cjs'),{hash,write}=require('./evaluate-v117.cjs');
const source=path.resolve(process.argv[2]||path.join(root,'../2048-ai-v11.7')),selected=[];
for(const file of ['V11_7_DEVELOPMENT.json','V11_7_VALIDATION.json']){
 const report=JSON.parse(fs.readFileSync(path.join(source,'docs',file)));assert.ok(report.complete);
 for(const row of report.rows)if(row.repeat===0&&['stable','v116'].includes(row.variant))selected.push({...row,sourceReport:file,sourceRoot:source});
}
for(const file of (process.env.DEVELOPMENT_REPORTS||'').split(',').filter(Boolean)){
 const report=JSON.parse(fs.readFileSync(path.join(root,file)));assert.ok(report.complete,'Only complete development experiments enter learning');
 for(const row of report.rows)if(row.repeat===0&&['cf','learned','guarded','hybrid'].includes(row.variant)){
  assert.ok(row.split.startsWith('known-'),'Independent validation may never be used in training');
  selected.push({...row,sourceReport:file,sourceRoot:root});
 }
}
const examples=new Map(),sources=[];let moves=0;
for(const row of selected){
 assert.ok(row.start.random.seed<18001,'fresh validation seeds must never enter training');
 const gzip=fs.readFileSync(path.join(row.sourceRoot,row.log));assert.equal(hash(gzip),row.logSHA256);
 const raw=zlib.gunzipSync(gzip);assert.equal(hash(raw),row.decisionsSHA256);const records=raw.toString().trim().split('\n');assert.equal(records.length,row.additionalMoves);
 let board=row.start.game.board.slice(),score=row.start.game.score;
 for(let i=0;i<records.length;i++){
  const record=JSON.parse(records[i]);assert.equal(record.score,score);
  const remaining=records.length-i;
  if((i%16===0||(remaining<=256&&i%4===0))&&Math.max(...board)<=32768){
   const b=rules.canonicalAI(board).board,key=row.start.random.seed+':'+b.join(','),prior=examples.get(key);
   // Escape potential: preserve a real long-lived continuation if any of the
   // teachers demonstrated one. A bad teacher cannot erase that evidence.
   if(!prior||remaining>prior.remaining)examples.set(key,{board:b,remaining,seed:row.start.random.seed,teacher:row.variant});
  }
  const m=rules.moveBoardPlain(board,record.best);assert.ok(m.moved);board=m.board;score+=m.gain;assert.equal(board[record.spawn.index],0);board[record.spawn.index]=record.spawn.value;
 }
 assert.deepEqual(board,row.finalBoard);assert.equal(score,row.score);moves+=records.length;
 sources.push({report:row.sourceReport,checkpoint:row.checkpoint,teacher:row.variant,moves:row.additionalMoves,logSHA256:row.logSHA256});
}
const rows=[...examples.values()],raw=Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),out=root+'/models/v118-learning-data.jsonl.gz';
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,zlib.gzipSync(raw,{level:9}));
write(root+'/docs/V11_8_LEARNING_DATA.json',{date:new Date().toISOString(),source:'actual V11.7 r0 terminal logs plus explicitly selected known V11.8 development logs; training evidence, not V11.8 independent validation outcomes',teachers:[...new Set(selected.map(r=>r.variant))],sources,
 moves,examples:rows.length,seedClusters:new Set(rows.map(r=>r.seed)).size,split:'held-out seed clusters where seed modulo 5 = 0; fresh 18001+ excluded',labels:'remaining legal actions to actual terminal; per-seed canonical duplicates keep maximum demonstrated remaining lifetime',dataSHA256:hash(fs.readFileSync(out)),rawSHA256:hash(raw)});
console.log(JSON.stringify({examples:rows.length,seedClusters:new Set(rows.map(r=>r.seed)).size,moves,data:out}));

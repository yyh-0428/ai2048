'use strict';
// Development evidence only: evaluate the frozen critic at every actual CF swap.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {root,rules}=require('../tests/harness.cjs');
const {write,fileHash}=require('./evaluate-v117.cjs');
const learned=require('../src/learned-survival.js'),model=learned.defaultModel();
assert.ok(model.available);
const input=require('../docs/V11_8_DEVELOPMENT.json'),rows=[];
for(const game of input.rows.filter(r=>r.variant==='cf'))for(const change of game.changes){
 const analysis=model.analyze(rules.legalRootBranches(change.board));
 const guard=learned.guard(analysis,change.planning.baseline,Object.keys(change.scores));
 rows.push({checkpoint:game.checkpoint,move:change.move,score:change.score,board:change.board,
  baseline:change.planning.baseline,cf:change.best,modelId:analysis.modelId,guard,allowed:guard.allowed.includes(change.best),analysis,
  actualWholeGame:{additionalMoves:game.additionalMoves,score:game.score,maxTile:game.maxTile}});
}
write(root+'/docs/V11_8_GUARD_ON_KNOWN_SWAPS.json',{date:new Date().toISOString(),kind:'known development diagnosis; not an independent outcome test',
 modelSHA256:fileHash('models/v118-survival.json'),inputSHA256:fileHash('docs/V11_8_DEVELOPMENT.json'),rows});
console.log(JSON.stringify({swaps:rows.length,vetoed:rows.filter(r=>!r.allowed).length,perStart:Object.fromEntries([...new Set(rows.map(r=>r.checkpoint))].map(id=>[id,rows.filter(r=>r.checkpoint===id).map(r=>({move:r.move,allowed:r.allowed,baseline:r.baseline,cf:r.cf}))]))}));

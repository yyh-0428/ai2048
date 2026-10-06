'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {root,rules}=require('../tests/harness.cjs'),cf=require('../src/counterfactual.js'),{randomStream}=require('./late-game.cjs');
const learned=require('../src/learned-survival.js');
const {write,hash,addTile,mass,potential}=require('./evaluate-v117.cjs');
const models=new Map(['models/v118-r1-survival.json','models/v118-survival.json'].map(f=>{const m=JSON.parse(fs.readFileSync(root+'/'+f));return [m.id,learned.create(m)];}));
function closeNumbers(a,b){
 if(typeof a==='number'){assert.ok(Number.isFinite(a)&&Number.isFinite(b));assert.ok(Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b)));return;}
 if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(a))closeNumbers(a[k],b[k]);return;}assert.equal(a,b);
}
function lines(row){const gzip=fs.readFileSync(root+'/'+row.log);assert.equal(hash(gzip),row.logSHA256);const raw=zlib.gunzipSync(gzip);assert.equal(hash(raw),row.decisionsSHA256);return raw.toString().trim().split('\n').map(JSON.parse);}
function replay(row){
 let board=row.start.game.board.slice(),score=row.start.game.score;const random=randomStream(row.start.random.seed,row.start.random.state,row.start.random.draws),records=lines(row);
 assert.equal(records.length,row.additionalMoves);
 for(let i=0;i<records.length;i++){
  const r=records[i],legal=rules.legalRootBranches(board);assert.equal(r.move,i);assert.equal(r.score,score);assert.deepEqual(Object.keys(r.scores).sort(),legal.map(b=>b.dir).sort());assert.ok(Object.values(r.scores).every(Number.isFinite));
  const m=legal.find(b=>b.dir===r.best);assert.ok(m);
  if(r.plannerResults){
   if(r.planning?.screened){assert.equal(r.plannerChanged,false);const all=Object.values(r.plannerResults);assert.equal(all.length,1);assert.ok(all[0].ok&&all[0].lives.length===16&&all[0].lives.every(x=>x===96));}
   else if(r.plannerChecked){assert.deepEqual(Object.keys(r.plannerResults).sort(),legal.map(b=>b.dir).sort());for(const x of Object.values(r.plannerResults)){assert.ok(x.ok);assert.equal(x.lives.length,16);assert.ok(x.lives.every(v=>Number.isInteger(v)&&v>=1&&v<=x.horizon));}}
   if(r.plannerChanged){assert.ok(r.planning?.complete);assert.equal(r.planning.best,r.best);}
  }
  if(r.trajectory){
   const t=r.trajectory,model=models.get(t.modelId);assert.ok(model?.available,'Known trained model must exist');assert.ok(t.complete);
   const pair={};for(const d of [t.baseline,t.alternative]){
    assert.ok(r.plannerResults[d]?.ok);const ends=t.endpoints[d];assert.equal(ends.length,16);
    for(const e of ends){assert.equal(e.board.length,16);assert.equal(e.terminal,rules.legalRootBranches(e.board).length===0);}
    pair[d]={...r.plannerResults[d],endpoints:ends};
   }
   const guard=learned.trajectoryGuard(model,pair,t.baseline,t.alternative);assert.ok(guard.complete);assert.equal(guard.allowed,t.allowed);closeNumbers(guard.evidence,t.evidence);closeNumbers(guard.endpointScores,t.endpointScores);
   if(r.trajectoryEscaped){const e=cf.strongEscape(r.plannerResults,t.baseline,t.alternative);assert.ok(e.complete&&e.passed);assert.equal(t.allowed,false);assert.equal(r.trajectoryVeto,true);assert.equal(r.plannerChanged,true);closeNumbers(e,t.escapeOverride);}
   else if(r.plannerChanged)assert.ok(t.allowed,'A completed soft veto requires recorded strong escape evidence');
   if(r.trajectoryStageHeld){assert.ok(Math.max(...board)>=16384);assert.equal(t.allowed,false);assert.equal(r.trajectoryEscaped,false);assert.equal(r.plannerChanged,false);assert.equal(r.best,t.baseline);}
  }
  if(r.learnedChanged){
   assert.ok(r.learned?.complete);const model=models.get(r.learned.modelId);assert.ok(model?.available);const actual=model.analyze(legal);assert.ok(actual.ok);closeNumbers(actual.results,r.learned.summary);
  }
  board=m.board;score+=m.gain;assert.deepEqual(addTile(board,random),r.spawn);assert.deepEqual(random.snapshot(),r.random);
 }
 assert.deepEqual(board,row.finalBoard);assert.equal(score,row.score);assert.deepEqual(random.snapshot(),row.finalRandom);assert.equal(rules.legalRootBranches(board).length,0);assert.equal(mass(board),row.spawnMass);assert.equal(potential(board)-row.spawnPotential,score);
 return {checkpoint:row.checkpoint,variant:row.variant,moves:records.length,passed:true};
}
function prefix(s){
 const reach=s.reachability,gzip=fs.readFileSync(root+'/'+reach.prefixLog),raw=zlib.gunzipSync(gzip);assert.equal(hash(gzip),reach.prefixLogSHA256);assert.equal(hash(raw),reach.prefixSHA256);
 const random=randomStream(s.random.seed);let board=Array(16).fill(0),score=0,moves=0;for(const spawn of reach.initial)assert.deepEqual(addTile(board,random),spawn);
 for(const line of raw.toString().trim().split('\n')){const r=JSON.parse(line);assert.equal(r.move,moves);const legal=rules.legalRootBranches(board);assert.deepEqual(Object.keys(r.scores).sort(),legal.map(b=>b.dir).sort());assert.ok(Object.values(r.scores).every(Number.isFinite));const m=legal.find(b=>b.dir===r.best);assert.ok(m);board=m.board;score+=m.gain;moves++;assert.deepEqual(addTile(board,random),r.spawn);assert.deepEqual(random.snapshot(),r.random);}
 assert.deepEqual(board,s.game.board);assert.equal(score,s.game.score);assert.equal(moves,s.game.moveCount);assert.deepEqual(random.snapshot(),s.random);return {id:s.id,moves,passed:true};
}
module.exports={replay,prefix,lines};
if(require.main===module){const reports=process.argv.slice(2).length?process.argv.slice(2):['PILOT_A','PILOT_B','DEVELOPMENT','LEARNED_DEVELOPMENT','GUARDED_DEVELOPMENT','FEEDBACK_DEVELOPMENT','SPECTRUM_DEVELOPMENT','ARBITRATED_DEVELOPMENT','PHASED_DEVELOPMENT','ABLATION','VALIDATION','OTHER_MODES'].map(s=>'docs/V11_8_'+s+'.json');const records=[];
 for(const file of reports){const j=JSON.parse(fs.readFileSync(path.resolve(root,file)));assert.ok(j.complete);for(const row of j.rows)records.push({report:file,...replay(row)});}
 const manifest=fs.existsSync(root+'/tests/fixtures/late-game-v118/manifest.json')?require('../tests/fixtures/late-game-v118/manifest.json'):{checkpoints:[],rejected:[]};
 const prefixes=manifest.checkpoints.map(prefix),rejectedPrefixes=manifest.rejected.map(r=>prefix({id:'seed-'+r.seed+' rejected',game:{board:r.board,score:r.score,moveCount:r.moveCount},random:r.random,reachability:r.reachability}));
 write(root+'/docs/V11_8_REPLAY.json',{date:new Date().toISOString(),passed:true,records,moves:records.reduce((s,r)=>s+r.moves,0),prefixes,rejectedPrefixes,trainedEndpointPredictionsRecomputed:true,strongEscapeEvidenceRecomputed:true});console.log('Replayed '+records.length+' terminal games and '+prefixes.length+' accepted / '+rejectedPrefixes.length+' rejected source prefixes.');
}

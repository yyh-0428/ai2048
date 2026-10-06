'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{root}=require('../tests/harness.cjs');
const {write,fileHash}=require('./evaluate-v117.cjs'),{acceptance,variants}=require('./evaluate-v118.cjs');
(async()=>{
assert.ok(!fs.existsSync(root+'/docs/V11_8_FREEZE.json'),'Never replace a pre-validation freeze');assert.ok(!fs.existsSync(root+'/tests/fixtures/late-game-v118/manifest.json'),'Freeze before seeing fresh corpus');
write(root+'/docs/V11_8_FREEZE_WAITING.json',{date:new Date().toISOString(),reason:'Wait for prespecified known-only phase arbitration; performance default already settled; no fresh samples exist.'});
const phased=root+'/docs/V11_8_PHASED_DEVELOPMENT.json';while(!fs.existsSync(phased)||!JSON.parse(fs.readFileSync(phased)).complete)await new Promise(r=>setTimeout(r,2000));
const reference=require('../docs/V11_8_DEVELOPMENT.json').rows.filter(r=>['original','stable'].includes(r.variant));
const files=['docs/V11_8_FEEDBACK_DEVELOPMENT.json','docs/V11_8_SPECTRUM_DEVELOPMENT.json','docs/V11_8_ARBITRATED_DEVELOPMENT.json','docs/V11_8_PHASED_DEVELOPMENT.json'],candidates=[];
for(const file of files){const j=JSON.parse(fs.readFileSync(root+'/'+file));assert.ok(j.complete);
 for(const name of (file.includes('FEEDBACK')?['guarded']:file.includes('PHASED')?['phased']:file.includes('ARBITRATED')?['arbitrated']:['trajectory','spectrum'])){
  const rows=j.rows.filter(r=>r.variant===name);assert.equal(rows.length,8);
  const assessment=acceptance([...reference,...rows],name,1),checks=Object.values(assessment.against).flatMap(a=>Object.entries(a.checks).filter(([k])=>!['pairedMedian','pairedWins','noSinglePeak'].includes(k)).map(([,v])=>v));
  const stability=Math.min(...Object.values(assessment.against).flatMap(a=>[a.candidate.medianAdditionalMoves/a.baseline.medianAdditionalMoves,a.candidate.bottomQuartileMean/a.baseline.bottomQuartileMean]));
  const meanGain=Math.min(...Object.values(assessment.against).map(a=>a.candidate.meanAdditionalMoves/a.baseline.meanAdditionalMoves));
  candidates.push({name,file,assessment,failed:checks.filter(x=>!x).length,stability,meanGain});
 }
}
candidates.sort((a,b)=>a.failed-b.failed||b.stability-a.stability||b.meanGain-a.meanGain||a.name.localeCompare(b.name));
const chosen=candidates[0],output=root+'/docs/V11_8_FREEZE.json';assert.ok(!fs.existsSync(output),'Never replace a pre-validation freeze');assert.ok(!fs.existsSync(root+'/tests/fixtures/late-game-v118/manifest.json'),'Freeze before seeing fresh corpus');
// Build again after measured performance defaults and final visible controls.
// No simulation is running at this point; freezing stale embedded source is an error.
const built=require('node:child_process').spawnSync(process.execPath,['tools/build.mjs'],{cwd:root,stdio:'inherit'});assert.equal(built.status,0);
// The published engine includes all candidates. Exactly this setting is tested.
const html='tests/fixtures/v118-validation.html';assert.ok(!fs.existsSync(root+'/'+html));fs.copyFileSync(root+'/2048-ai.html',root+'/'+html);
const source=['src/rules.js','src/worker.js','src/coordinator.js','src/counterfactual.js','src/learned-survival.js','models/v118-survival.json','models/v118-learning-data.jsonl.gz','v102_ai.wasm','survival_v9_1.wasm'];
write(output,{date:new Date().toISOString(),candidate:chosen.name,policyOptions:variants[chosen.name].policyOptions,html,htmlSHA256:fileHash(html),protocolSHA256:fileHash('docs/V11_8_PROTOCOL.json'),
 sourceSHA256:Object.fromEntries(source.map(p=>[p,fileHash(p)])),comparatorsSHA256:Object.fromEntries(['original','stable'].map(v=>[v,fileHash('tests/fixtures/'+variants[v].version+'.html')])),modelId:require('../models/v118-survival.json').id,selection:candidates,
 rule:'Known-start selection only; exactly one candidate frozen before any fresh corpus/outcome. Independent20unique starts x2repeats and all gates decide default activation. No tuning or reselection using those outcomes.'});
console.log(JSON.stringify({candidate:chosen.name,failedKnownGates:chosen.failed,htmlSHA256:fileHash(html)}));
})().catch(e=>{console.error(e);process.exitCode=1;});

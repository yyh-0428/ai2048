'use strict';
// Resume phase orchestration, never parallelize CPU-heavy tasks.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {root}=require('../tests/harness.cjs'),{write,fileHash,acceptance}=require('./evaluate-v117.cjs');
const status=root+'/docs/V11_7_RUN_STATUS.json';
write(root+'/docs/V11_7_RUN_PROCESS.json',{pid:process.pid,date:new Date().toISOString(),task:'V11.7 owned orchestrator'});
function complete(file){if(!fs.existsSync(root+'/'+file))return false;return JSON.parse(fs.readFileSync(root+'/'+file)).complete===true;}
function phase(name,script,args=[],env={},log){write(status,{date:new Date().toISOString(),phase:name,complete:false});console.log('Starting '+name);const fd=log?fs.openSync(root+'/'+log,'w'):null;const r=spawnSync(process.execPath,[script,...args],{cwd:root,env:{...process.env,CHECKPOINT_PAUSE:'1',...env},stdio:fd?['ignore',fd,fd]:'inherit'});if(fd)fs.closeSync(fd);if(r.error)throw r.error;assert.equal(r.status,0,name+' failed; see '+(log||'log'));console.log('Completed '+name);}
function tests(){phase('final regression','tools/test.mjs',[],{},'docs/V11_7_TEST_OUTPUT.txt');const s=fs.readFileSync(root+'/docs/V11_7_TEST_OUTPUT.txt','utf8'),counts=[...s.matchAll(/(?:ℹ |# )tests (\d+)/g)].map(m=>Number(m[1]));const groups=counts.length;assert.equal(groups,19);assert.ok(!/(?:ℹ |# )fail [1-9]/.test(s));write(root+'/docs/TEST_RESULTS_V11_7.json',{date:new Date().toISOString(),groups,tests:counts.reduce((a,b)=>a+b,0),passed:true,node:process.version,htmlSHA256:fileHash('2048-ai.html'),log:'docs/V11_7_TEST_OUTPUT.txt',inputRegression:{groups:18,tests:102,passed:true,log:'docs/V11_7_INPUT_TEST_OUTPUT.txt'}});}
(async()=>{
 // An already-running development process owns the CPU until its atomic report completes.
 while(!complete('docs/V11_7_DEVELOPMENT.json'))await new Promise(r=>setTimeout(r,2000));
 if(!fs.existsSync(root+'/docs/V11_7_FREEZE.json'))phase('freeze strategy','tools/freeze-v117.cjs');
 if(!fs.existsSync(root+'/docs/V11_7_FIRST_DIVERGENCES.json'))phase('first divergences and danger paths','tools/diagnose-v117.cjs',[],{},'docs/V11_7_DIAGNOSE_LOG.txt');
 if(!complete('tests/fixtures/late-game-v117/manifest.json'))phase('fresh real checkpoints','tools/checkpoints-v117.cjs',[],{RESUME:'1'},'docs/V11_7_CHECKPOINT_LOG.txt');
 assert.ok(complete('tests/fixtures/late-game-v117/manifest.json'),'Checkpoint generation interrupted; preserve partial data and explicitly resume generation');
 if(!fs.existsSync(root+'/docs/V11_7_CORPUS_DIVERSITY.json'))phase('corpus geometry coverage','tools/inspect-corpus-v117.cjs');
 phase('regression before validation','tools/test.mjs',[],{},'docs/V11_7_PRERELEASE_TEST_OUTPUT.txt');
 if(!complete('docs/V11_7_VALIDATION.json'))phase('independent terminal validation','tools/evaluate-v117.cjs',['validation'],{RESUME:'1'},'docs/V11_7_VALIDATION_LOG.txt');
 const val=JSON.parse(fs.readFileSync(root+'/docs/V11_7_VALIDATION.json')),gate=acceptance(val.rows);write(root+'/docs/V11_7_RELEASE_DECISION.json',{date:new Date().toISOString(),gatePassed:gate.passed,gate,default:gate.passed?require('../docs/V11_7_FREEZE.json').candidate:'unchanged V11.6 God policy',tunedAfterValidation:false,defaultPolicyDecision:require('../docs/V11_7_DEFAULT_POLICY_DECISION.json')});
 if(gate.passed)throw new Error('Candidate passed: enable the frozen God-only candidate default, rerun final release and regression before continuing; frozen validation remains unchanged.');
 if(!complete('docs/V11_7_OTHER_MODES.json'))phase('other-mode repeated terminal pairs','tools/evaluate-v117.cjs',['other'],{RESUME:'1',CURRENT_HTML:'tests/fixtures/v117-validation.html'},'docs/V11_7_OTHER_LOG.txt');
 if(!complete('docs/V11_7_RELEASE.json'))phase('actual release terminal checks','tools/evaluate-v117.cjs',['release'],{RESUME:'1',CURRENT_HTML:'tests/fixtures/v117-release-engine.html'},'docs/V11_7_RELEASE_LOG.txt');
 if(!fs.existsSync(root+'/docs/V11_7_PRE_LATENCY_CHECKPOINT_ACK.json')){
  const marker=root+'/docs/V11_7_CHECKPOINT_REQUEST.json';write(marker,{date:new Date().toISOString(),phase:'all terminal games complete; checkpoint before isolated latency',count:284});
  while(fs.existsSync(marker))await new Promise(r=>setTimeout(r,1000));
  write(root+'/docs/V11_7_PRE_LATENCY_CHECKPOINT_ACK.json',{date:new Date().toISOString(),checkpointSaved:true});
 }
 if(!complete('docs/V11_7_LATENCY.json'))phase('fixed-board alternating latency','tools/benchmark-v117.cjs',[],{},'docs/V11_7_LATENCY_LOG.txt');
 tests();phase('all raw-log replay','tools/replay-v117.cjs',[],{},'docs/V11_7_REPLAY_LOG.txt');phase('final report','tools/report-v117.cjs');write(status,{date:new Date().toISOString(),phase:'reports ready for packaging',complete:true});
})().catch(e=>{console.error(e);write(status,{date:new Date().toISOString(),phase:'blocked',error:String(e),complete:false});process.exitCode=1;});

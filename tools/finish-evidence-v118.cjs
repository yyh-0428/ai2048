'use strict';
// Each child exits before the next starts. No independent CPU-heavy workloads overlap.
const fs=require('node:fs'),{spawn}=require('node:child_process'),{root}=require('../tests/harness.cjs');
async function task(args,env={}){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:root,env:{...process.env,...env},stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(args.join(' ')+' exited '+code)));});}
(async()=>{
 const f=root+'/docs/V11_8_VALIDATION.json';while(!fs.existsSync(f)||!JSON.parse(fs.readFileSync(f)).complete)await new Promise(r=>setTimeout(r,2000));
 await task(['tools/benchmark-v118.cjs']);
 await task(['tools/evaluate-v118.cjs','development'],{CURRENT_HTML:'tests/fixtures/v118-validation.html',VARIANTS:'noTail,noConfirm,learnedNoConsensus,hybrid',OUTPUT:'docs/V11_8_ABLATION.json'});
 await task(['tools/evaluate-v118.cjs','other'],{CURRENT_HTML:'tests/fixtures/v118-validation.html',OUTPUT:'docs/V11_8_OTHER_MODES.json'});
 await task(['tools/replay-v118.cjs']);
})().catch(e=>{console.error(e);process.exitCode=1;});

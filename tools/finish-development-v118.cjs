'use strict';
// No CPU workloads overlap: finish development, verify, benchmark, then freeze.
const fs=require('node:fs'),{spawn}=require('node:child_process'),{root}=require('../tests/harness.cjs');
async function task(command,args,env={}){await new Promise((resolve,reject)=>{const p=spawn(command,args,{cwd:root,env:{...process.env,...env},stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(command+' exited '+code)));});}
(async()=>{
 const f=root+'/docs/V11_8_SPECTRUM_DEVELOPMENT.json';while(!fs.existsSync(f)||!JSON.parse(fs.readFileSync(f)).complete)await new Promise(r=>setTimeout(r,2000));
 await task(process.execPath,['tools/build.mjs']);
 for(const f of ['tests/v118.cjs','tests/learned-v118.cjs'])await task(process.execPath,['--test','--test-concurrency=1',f]);
 const frozen='tests/fixtures/v118-arbitrated-development.html';if(fs.existsSync(root+'/'+frozen))throw Error('Never overwrite a frozen build');fs.copyFileSync(root+'/2048-ai.html',root+'/'+frozen);
 await task(process.execPath,['tools/evaluate-v118.cjs','development'],{CURRENT_HTML:frozen,VARIANTS:'arbitrated',OUTPUT:'docs/V11_8_ARBITRATED_DEVELOPMENT.json'});
 await task(process.execPath,['tools/benchmark-memo-v118.cjs']);
 // Only the matched-board measurements decide memo's final default; the
 // independently checked score/lifetime/endpoint equality preserves strategy.
 const latency=require('../docs/V11_8_MEMO_LATENCY.json');
 if(!latency.clearSpeedup){const p=root+'/src/coordinator.js',s=fs.readFileSync(p,'utf8');if(!s.includes('counterfactualMemo:true'))throw Error('Memo default marker absent');fs.writeFileSync(p,s.replace('counterfactualMemo:true','counterfactualMemo:false'));await task(process.execPath,['tools/build.mjs']);}
 await task(process.execPath,['tools/freeze-v118.cjs']);
 await task(process.execPath,['tools/checkpoints-v118.cjs']);
 await task(process.execPath,['tools/evaluate-v118.cjs','validation'],{CURRENT_HTML:'tests/fixtures/v118-validation.html'});
})().catch(e=>{console.error(e);process.exitCode=1;});

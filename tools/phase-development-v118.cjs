'use strict';
const fs=require('node:fs'),{spawn}=require('node:child_process'),{root}=require('../tests/harness.cjs');
async function task(args,env={}){await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:root,env:{...process.env,...env},stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(args.join(' ')+' exited '+code)));});}
(async()=>{
 const waiting=root+'/docs/V11_8_FREEZE_WAITING.json';while(!fs.existsSync(waiting))await new Promise(r=>setTimeout(r,2000));
 if(fs.existsSync(root+'/docs/V11_8_FREEZE.json')||fs.existsSync(root+'/tests/fixtures/late-game-v118/manifest.json'))throw Error('Phase development must precede all fresh data');
 if(!require('../docs/V11_8_ARBITRATED_DEVELOPMENT.json').complete||!require('../docs/V11_8_MEMO_LATENCY.json').complete)throw Error('Previous CPU workloads must finish');
 await task(['tools/build.mjs']);for(const file of ['tests/v118.cjs','tests/learned-v118.cjs'])await task(['--test','--test-concurrency=1',file]);
 const frozen='tests/fixtures/v118-phased-development.html';if(fs.existsSync(root+'/'+frozen))throw Error('Never overwrite a frozen build');fs.copyFileSync(root+'/2048-ai.html',root+'/'+frozen);
 await task(['tools/evaluate-v118.cjs','development'],{CURRENT_HTML:frozen,VARIANTS:'phased',OUTPUT:'docs/V11_8_PHASED_DEVELOPMENT.json'});
})().catch(e=>{console.error(e);process.exitCode=1;});

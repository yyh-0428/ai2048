'use strict';
// Sequential development feedback only. Never reads independent 18001+ outcomes.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {root}=require('../tests/harness.cjs');
async function task(command,args,env={}){
 await new Promise((resolve,reject)=>{const p=spawn(command,args,{cwd:root,env:{...process.env,...env},stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(command+' exited '+code)));});
}
(async()=>{
 const file=root+'/docs/V11_8_GUARDED_DEVELOPMENT.json';
 while(!fs.existsSync(file)||!JSON.parse(fs.readFileSync(file)).complete)await new Promise(r=>setTimeout(r,2000));
 const inputs=['docs/V11_8_DEVELOPMENT.json','docs/V11_8_LEARNED_DEVELOPMENT.json','docs/V11_8_GUARDED_DEVELOPMENT.json'];
 await task(process.execPath,['tools/learning-data-v118.cjs'],{DEVELOPMENT_REPORTS:inputs.join(',')});
 await task('python3',['tools/train-survival-v118.py']);
 await task(process.execPath,['tools/build.mjs']);
 for(const file of ['tests/learned-v118.cjs','tests/v118.cjs'])await task(process.execPath,['--test','--test-concurrency=1',file]);
 const frozen='tests/fixtures/v118-feedback-development.html';assertAbsent(frozen);fs.copyFileSync(root+'/2048-ai.html',root+'/'+frozen);
 await task(process.execPath,['tools/evaluate-v118.cjs','development'],{CURRENT_HTML:frozen,VARIANTS:'learned,guarded',OUTPUT:'docs/V11_8_FEEDBACK_DEVELOPMENT.json'});
})().catch(e=>{console.error(e);process.exitCode=1;});
function assertAbsent(file){if(fs.existsSync(path.join(root,file)))throw Error('Never overwrite a frozen development build');}

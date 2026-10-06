'use strict';
const fs=require('node:fs'),{spawn}=require('node:child_process');
const {root}=require('../tests/harness.cjs');
async function phase(cmd,args){await new Promise((resolve,reject)=>{const child=spawn(cmd,args,{cwd:root,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(cmd+' exited '+code)));});}
(async()=>{
 for(;;){const file=root+'/docs/V11_8_DEVELOPMENT.json';if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file)).complete)break;await new Promise(r=>setTimeout(r,2000));}
 console.log('Development has ended; training starts with no simultaneous game/CPU benchmark.');
 await phase(process.execPath,['tools/learning-data-v118.cjs']);await phase('python3',['tools/train-survival-v118.py']);
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
// Reproducible, compiler-free specialization of the shipped V10.4 module.
// Only the two constants in min(depth, 4) become min(depth, 6).
// The pinned input hash + unique instruction sequence prevent patching other builds.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const input=fs.readFileSync(path.join(root,'tests/fixtures/v10.4/v102_ai.wasm'));
const hash=crypto.createHash('sha256').update(input).digest('hex');
if(hash!=='4a7516d0202211705e3a98dc55f5b35af2969da2be2147cf27eda7d724aec758')throw Error('Unexpected reference core');
const pattern=Buffer.from('410420044104481b','hex'),at=input.indexOf(pattern);
if(at<0||input.indexOf(pattern,at+1)>=0)throw Error('Depth clamp must be unique');
input[at+1]=6;input[at+5]=6;
if(!WebAssembly.validate(input))throw Error('Invalid specialized module');
fs.writeFileSync(path.join(root,'v102_ai.wasm'),input);
console.log('Built d2–d6 core from pinned V10.4 module (two constant operands only).');

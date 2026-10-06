'use strict';
// Exact reconstruction and rerun of the withdrawn development experiment.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root}=require('../tests/harness.cjs'),{fileHash,benchmark}=require('./evaluate-v117.cjs');
const protocol=require('../docs/V11_7_RETAIN5_PROTOCOL.json'),freeze=require('../docs/V11_7_FREEZE.json');
const source=fs.readFileSync(path.join(root,freeze.htmlFile),'utf8');
const before='j.actualConsensusPromoted=true;j.ceilingStage=0;return false;';
const after='j.lastComplete=j.policyRound5;j.cfg.coreDepth=5;j.depth=5;j.actualConsensusPromoted=true;j.ceilingStage=0;return false;';
assert.equal(fileHash(freeze.htmlFile),freeze.htmlSHA256);assert.equal(source.split(before).length,2);
const reconstructed=source.replace(before,after),target=path.join(root,protocol.htmlFile);
if(!fs.existsSync(target))fs.writeFileSync(target,reconstructed);
assert.equal(fs.readFileSync(target,'utf8'),reconstructed);assert.equal(fileHash(protocol.htmlFile),protocol.htmlSHA256);
if(process.argv.includes('--check-only')){console.log('Frozen retain5 source reconstruction passed');}
else{
 process.env.CURRENT_HTML=protocol.htmlFile;
 const starts=require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>({...s,split:'known-development'}));
 benchmark({starts,selected:['retain5Promotion'],repeats:1,output:process.env.OUTPUT||'docs/V11_7_RETAIN5_ABLATION.json'}).catch(e=>{console.error(e);process.exitCode=1;});
}

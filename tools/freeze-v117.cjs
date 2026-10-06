'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {root}=require('../tests/harness.cjs'),{fileHash,write,base}=require('./evaluate-v117.cjs');
const dev=require('../docs/V11_7_DEVELOPMENT.json');assert.equal(dev.complete,true);assert.equal(dev.rows.length,56);
const file='tests/fixtures/v117-validation.html';assert.ok(!fs.existsSync(path.join(root,'docs/V11_7_FREEZE.json')),'Already frozen');fs.copyFileSync(path.join(root,'2048-ai.html'),path.join(root,file));
const freeze={date:new Date().toISOString(),htmlFile:file,htmlSHA256:fileHash(file),developmentHTML:'tests/fixtures/v117-development.html',developmentHTMLSHA256:fileHash('tests/fixtures/v117-development.html'),candidate:'fallback',options:{...base,policyConsensus:true,fallbackConsensus:true},
 rationale:'Dual-agreement fallback addresses the four first regressions but does not recover all later choices. Promotion and rescue combination have negative development ablations. No tuning after this freeze.',
 protocolSHA256:fileHash('docs/V11_7_PROTOCOL.json'),independentCorpus:'tests/fixtures/late-game-v117/manifest.json',defaultUntilAcceptance:'stable V11.5 policy'};
write(path.join(root,'docs/V11_7_FREEZE.json'),freeze);console.log(JSON.stringify(freeze));

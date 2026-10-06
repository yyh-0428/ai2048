'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {rules}=require('./harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'..','src','coordinator.js'),'utf8');
function setup(){const c={Game2048:rules,performance,postMessage(){},onmessage:null};vm.createContext(c);const i=source.lastIndexOf('})();');vm.runInContext(source.slice(0,i)+`globalThis.hook={tieBreak,useV102Core,verifierSpec,job:()=>job,set(j){job=j;}};`+source.slice(i),c);return c.hook;}
test('V10.4 near-tie policy is deterministic and merge-aware',()=>{
 const h=setup(), branches=[{dir:'up',gain:0},{dir:'left',gain:32},{dir:'right',gain:4}];
 h.set({branches,lastComplete:[{dir:'up',score:1000},{dir:'left',score:999.8},{dir:'right',score:900}],tieBest:null,tieAdjusted:false,tieGap:0});
 h.tieBreak(); assert.equal(h.job().tieBest,'left');
});

test('native selection fulfills strong/extreme d5 and preserves compatibility fallbacks',()=>{
 const h=setup();
 assert.equal(h.useV102Core('fast',5,false,true),true);
 assert.equal(h.useV102Core('strong',4,false,true),true);
 assert.equal(h.useV102Core('extreme',4,false,true),true);
 assert.equal(h.useV102Core('strong',5,false,true),true);
 assert.equal(h.useV102Core('extreme',5,false,true),true);
 assert.equal(h.useV102Core('strong',4,true,true),false);
 assert.equal(h.useV102Core('strong',4,false,false),false);
});

test('V10.4 repaired verifier is independent for strong/extreme but preserves fast d3->d4',()=>{
 const h=setup();
 for(const [cfg,last,type,depth] of [
   [{v102:true,profile:'fast',baseDepth:3},3,'v102',4],
   [{v102:true,profile:'strong',baseDepth:4},4,'exact',5],
   [{v102:true,profile:'extreme',baseDepth:4},4,'exact',5],
   [{v102:true,profile:'extreme',baseDepth:5,coreDepth:5},5,'exact',6],
   [{v102:false,profile:'extreme',baseDepth:5},6,'exact',7]
 ]){const v=h.verifierSpec(cfg,last);assert.equal(v.type,type);assert.equal(v.depth,depth);}
});

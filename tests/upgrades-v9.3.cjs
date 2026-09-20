'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,engine,rules,rng}=require('./harness.cjs');
const {sources,client}=require('./clients-v9.3.cjs');
const corpus=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/positions.json')));
function exposed(source){return engine(source.replace('return {analyze,analyzeRoot,analyzeExact,clearTT};','return {analyze,analyzeRoot,analyzeExact,clearTT,begin,maxNode,chanceNode,evaluate,toRanks,moveBoard};'));}
test('production WASM kernels and ordinary policy remain byte-identical to 9.2',()=>{
  const old=sources('9.2').worker,now=sources('9.3').worker;
  for(const name of ['WASM_B64','SURVIVAL_WASM_B64']){const re=new RegExp(`const ${name}='([^']+)'`);assert.equal(old.match(re)[1],now.match(re)[1]);}
  const oldRules=sources('9.2').coordinator.split('// Owns the complete decision.')[0];
  assert.equal(oldRules.trim(),fs.readFileSync(path.join(root,'src/rules.js'),'utf8').trim());
});
test('exact leaf memo withstands eviction, changed budgets and ranks above 31',async()=>{
  const a=exposed(sources('9.2').worker),b=exposed(sources('9.3').worker);await Promise.all([a.ready,b.ready]);
  const x=a.legacy(),y=b.legacy(),cfg={...rules.config(corpus[0],'fast'),budget:30000};x.begin(cfg);y.begin(cfg);
  const random=rng(930),states=[];
  for(let n=0;n<18000;n++){
    const board=Uint8Array.from({length:16},()=>Math.floor(random()*40));if(n%7===0)board[0]=board[15]=32;
    assert.equal(y.evaluate(board),x.evaluate(board));if(n%97===0)states.push(board);
  }
  x.begin({...cfg,phase:1,probCut:0});y.begin({...cfg,phase:1,probCut:0});
  for(const board of states.reverse()){assert.equal(y.evaluate(board),x.evaluate(board));assert.equal(y.evaluate(board),x.evaluate(board));}
});
test('reversible spawn restores input after success and a nested deadline exception',async()=>{
  const e=exposed(sources('9.3').worker);await e.ready;const js=e.legacy(),cfg={...rules.config(corpus[0],'fast'),budget:30000};
  const board=Uint8Array.from([15,10,8,4,9,7,5,2,6,4,2,0,3,1,0,0]),before=Array.from(board);
  js.begin(cfg);js.chanceNode(board,2,1,0);assert.deepEqual(Array.from(board),before);
  js.begin({...cfg,budget:-1});assert.throws(()=>js.chanceNode(board,5,1,0),e=>e===1);assert.deepEqual(Array.from(board),before);
  js.begin(cfg);assert.ok(Number.isFinite(js.chanceNode(board,2,1,0)));assert.deepEqual(Array.from(board),before);
});
test('real workers: exact scores and logical nodes match at d1–d5 across all modes',async()=>{
  const a=await client('9.2'),b=await client('9.3');
  try{for(const mode of ['fast','strong','extreme'])for(const depth of [1,2,3,4,5])for(const original of [corpus[41],corpus[121],corpus.at(-1)]){
    const board=original.slice();board[board.indexOf(Math.max(...board))]=32768;
    const cfg={...rules.config(board,mode),forceJS:true,fallbackBudget:30000};
    for(const branch of rules.legalRootBranches(rules.canonicalAI(board).board)){
      const task={...branch,type:'exact',round:'equivalence',depth,cfg,hardBudget:0};
      const x=await a.request(task),y=await b.request(task);assert.equal(x.ok,true);assert.equal(y.ok,true);assert.equal(y.score,x.score);assert.equal(y.nodes,x.nodes);
    }
  }}finally{await a.close();await b.close();}
});

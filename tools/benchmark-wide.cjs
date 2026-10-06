'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs');
const corpus=require('../tests/fixtures/positions.json');
const variants=['v10.5/2048-ai','current'];
const pct=(a,p)=>{a=[...a].sort((a,b)=>a-b);const x=(a.length-1)*p,i=Math.floor(x);return a[i]+(a[Math.ceil(x)]-a[i])*(x-i)};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const boards=[];for(const value of [32768,65536,2**20,2**31])for(const i of [41,121,201]){const b=corpus[i].slice();b[b.indexOf(Math.max(...b))]=value;boards.push(b)}
(async()=>{
 const result={date:new Date().toISOString(),node:process.version,protocol:'sequential alternating A/B, same boards, same depth/config; no concurrent benchmark',fixed:[],decisions:[]};
 let cs=[];for(const v of variants)cs.push(await client(v));
 const tasks=[];for(const board of boards)for(const br of rules.legalRootBranches(board))tasks.push({...br,type:'exact',round:'fixed',depth:5,cfg:{...rules.config(board,'extreme'),forceJS:true,fallbackBudget:30000},hardBudget:0});
 try{for(const t of tasks.slice(0,8))for(const c of cs)await c.request(t);
 for(let pass=0;pass<3;pass++)for(let i=0;i<tasks.length;i++){const pair=[];for(const v of (i+pass)%2?[1,0]:[0,1])pair[v]=await cs[v].request(tasks[i]);const [a,b]=pair;assert.ok(a.ok&&b.ok);assert.equal(a.score,b.score);assert.equal(a.nodes,b.nodes);assert.equal(a.leafHits,b.leafHits);assert.equal(a.leafMisses,b.leafMisses);result.fixed.push({pass,index:i,oldMs:a.time,newMs:b.time,nodes:a.nodes});}
 }finally{for(const c of cs)await c.close()}
 cs=[];for(const v of variants)cs.push(await client(v,{coordinator:true}));
 try{for(const b of boards.slice(0,3))for(const c of cs)await c.request({type:'analyze',board:b,strength:'extreme'});
 for(let pass=0;pass<3;pass++)for(let i=0;i<boards.length;i++){const pair=[];for(const v of (pass+i)%2?[1,0]:[0,1])pair[v]=await cs[v].request({type:'analyze',board:boards[i],strength:'extreme'});for(const r of pair){assert.ok(rules.moveBoardPlain(boards[i],r.best).moved);assert.ok(Object.values(r.scores).every(Number.isFinite));}result.decisions.push({pass,index:i,oldMs:pair[0].time,newMs:pair[1].time,oldDepth:pair[0].depth,newDepth:pair[1].depth,sameMove:pair[0].best===pair[1].best,oldDiscarded:pair[0].discardedNodes,newDiscarded:pair[1].discardedNodes});}
 }finally{for(const c of cs)await c.close()}
 result.summary=Object.fromEntries(['fixed','decisions'].map(k=>[k,{pairs:result[k].length,oldMeanMs:mean(result[k].map(r=>r.oldMs)),newMeanMs:mean(result[k].map(r=>r.newMs)),oldP50Ms:pct(result[k].map(r=>r.oldMs),.5),newP50Ms:pct(result[k].map(r=>r.newMs),.5),oldP95Ms:pct(result[k].map(r=>r.oldMs),.95),newP95Ms:pct(result[k].map(r=>r.newMs),.95)}]));
 result.summary.decisions.meanOldDepth=mean(result.decisions.map(r=>r.oldDepth));result.summary.decisions.meanNewDepth=mean(result.decisions.map(r=>r.newDepth));result.summary.decisions.sameMoves=result.decisions.filter(r=>r.sameMove).length;
 result.htmlSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'2048-ai.html'))).digest('hex');
 fs.writeFileSync(path.join(root,'docs/WIDE_BENCHMARK.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary,null,2));
})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
// One process, sequential A/B requests, alternating version order. No UI delay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {root,rules,rng,spawn}=require('../tests/harness.cjs');
const {client}=require('../tests/clients-v10.cjs');
const variants=['v10.4/2048-ai','current'],labels=['v10.4','v10.5'];
const mode=process.env.MODE||'extreme';
const pct=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((a,b)=>a-b),x=(s.length-1)*p,l=Math.floor(x);return s[l]+(s[Math.ceil(x)]-s[l])*(x-l);};
const sum=a=>a.reduce((a,b)=>a+b,0),mean=a=>a.length?sum(a)/a.length:0;
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const metadata=()=>({date:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,mode,workers:4,hashes:{old:sha(path.join(root,'tests/fixtures/v10.4/2048-ai.html')),current:sha(path.join(root,'2048-ai.html'))}});
const save=(file,result)=>fs.writeFileSync(path.join(root,'docs',file),JSON.stringify(result,null,2)+'\n');
async function latency(){
 const corpus=require('../tests/fixtures/positions.json').filter(b=>rules.legalRootBranches(b).length>1);
 const clients=[];for(const v of variants)clients.push(await client(v,{coordinator:true}));
 const rows=[];
 try{
  for(let i=0;i<30;i++)for(const c of clients)await c.request({type:'analyze',board:corpus[i%corpus.length],strength:mode});
  for(let pass=0;pass<3;pass++)for(let i=0;i<corpus.length;i++){
   const board=corpus[i],result={pass,index:i,empties:rules.countEmpties(board)};
   for(const v of (pass+i)%2?[1,0]:[0,1]){const start=performance.now(),r=await clients[v].request({type:'analyze',board,strength:mode});if(r.cached)throw Error('Cached sample in latency corpus');result[labels[v]]={ms:r.time,wallMs:performance.now()-start,nodes:r.nodes,depth:r.depth,discarded:r.discardedNodes||0,cacheHits:r.cacheHits??null,best:r.best};}
   rows.push(result);
  }
 }finally{for(const c of clients)await c.close();}
 const stats=rs=>Object.fromEntries(labels.map(v=>[v,{samples:rs.length,meanMs:mean(rs.map(r=>r[v].ms)),p50Ms:pct(rs.map(r=>r[v].ms),.5),p95Ms:pct(rs.map(r=>r[v].ms),.95),maxMs:Math.max(...rs.map(r=>r[v].ms)),meanWallMs:mean(rs.map(r=>r[v].wallMs)),nodesPerSecond:sum(rs.map(r=>r[v].nodes))/(sum(rs.map(r=>r[v].ms))/1000),discardedNodes:sum(rs.map(r=>r[v].discarded))}]));
 const result={...metadata(),protocol:'30 warmups; 3 passes; identical reachable boards; versions alternate each pair; one active request at a time; no cached samples',summary:stats(rows),open:stats(rows.filter(r=>r.empties>2)),critical:stats(rows.filter(r=>r.empties<=2)),rows};save('LATENCY.json',result);console.log(JSON.stringify({latency:result.summary,open:result.open,critical:result.critical}));
}
function summarize(rows){return{games:rows.length,meanScore:mean(rows.map(r=>r.score)),medianScore:pct(rows.map(r=>r.score),.5),p10Score:pct(rows.map(r=>r.score),.1),minScore:Math.min(...rows.map(r=>r.score)),maxScore:Math.max(...rows.map(r=>r.score)),meanTotal:mean(rows.map(r=>r.total)),meanMoves:mean(rows.map(r=>r.moves)),meanSearchMs:sum(rows.map(r=>r.searchMs))/sum(rows.map(r=>r.moves)),nodesPerSecond:sum(rows.map(r=>r.nodes))/(sum(rows.map(r=>r.searchMs))/1000),discardedNodes:sum(rows.map(r=>r.discarded)),tiles:Object.fromEntries([2048,4096,8192,16384,32768].map(t=>[t,rows.filter(r=>r.maxTile>=t).length]))};}
async function play(version,seed){
 const c=await client(variants[version],{coordinator:true});let board=Array(16).fill(0),R=rng(seed),score=0,moves=0,times=[],nodes=0,discarded=0,risk=0,verified=0,depths={};spawn(board,R);spawn(board,R);
 const started=performance.now();
 try{while(rules.legalRootBranches(board).length){const r=await c.request({type:'analyze',board,strength:mode});const m=rules.moveBoardPlain(board,r.best);if(!m.moved)throw Error('Illegal move');board=m.board;score+=m.gain;moves++;spawn(board,R);times.push(r.time);nodes+=r.nodes;discarded+=r.discardedNodes||0;risk+=+!!r.riskChecked;verified+=+!!r.verified;depths[r.depth]=(depths[r.depth]||0)+1;
  if(moves%2000===0)console.log(`${labels[version]} seed ${seed}: ${moves} moves, score ${score}`);
 }}finally{await c.close();}
 return{version:labels[version],seed,score,moves,total:sum(board),maxTile:Math.max(...board),searchMs:sum(times),meanMs:mean(times),p50Ms:pct(times,.5),p95Ms:pct(times,.95),maxMs:Math.max(...times),nodes,discarded,risk,verified,depths,wallMs:performance.now()-started};
}
async function games(count,startSeed){
 const result={...metadata(),protocol:{completeGames:true,count,startSeed,spawn:'uniform empty cell; 90% 2 / 10% 4',rng:'mulberry32',versionOrder:'alternates per seed; no concurrent games',termination:'no legal moves',total:'sum of tile values on terminal board, including initial tiles',limitations:'time-budgeted legacy path can vary across runs; development sample, not a population guarantee'},rows:[],complete:false};
 save('GAMES.json',result);
 for(let i=0;i<count;i++)for(const v of i%2?[1,0]:[0,1]){const row=await play(v,startSeed+i);result.rows.push(row);result.summary=Object.fromEntries(labels.map(l=>[l,summarize(result.rows.filter(r=>r.version===l))]));save('GAMES.json',result);console.log(JSON.stringify(row));}
 result.complete=true;save('GAMES.json',result);console.log(JSON.stringify(result.summary));
}
(async()=>{const cmd=process.argv[2]||'latency';if(cmd==='latency')await latency();else if(cmd==='games')await games(Math.max(1,Number(process.argv[3]||10)|0),Math.max(1,Number(process.argv[4]||1)|0));else throw Error('Usage: node tools/benchmark.cjs latency | games [count] [startSeed]');})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs');
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const pct=(a,p)=>{const b=a.slice().sort((x,y)=>x-y),x=(b.length-1)*p,i=Math.floor(x);return b.length?b[i]+(b[Math.ceil(x)]-b[i])*(x-i):0;};
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function kernels(){
  const oldBytes=Buffer.from(fs.readFileSync(path.join(root,'tests/fixtures/v11.5.html'),'utf8').match(/const V102_WASM_B64='([^']+)'/)[1],'base64'),newBytes=fs.readFileSync(path.join(root,'v102_ai.wasm'));
  const ws=[];for(const b of [oldBytes,newBytes]){const {instance:{exports:w}}=await WebAssembly.instantiate(b);w.v102_init();ws.push(w);}
  const rows=require('../tests/fixtures/core-d3-d6.json').rows,out=[];
  for(const [lo,hi,d] of rows)for(const w of ws)w.v102_score_depth(lo,hi,d);
  for(let pass=0;pass<5;pass++)for(let i=0;i<rows.length;i++){
    const [lo,hi,d,score,nodes,hits]=rows[i],pair=[];
    for(const v of (pass+i)%2?[1,0]:[0,1]){
      const w=ws[v],start=performance.now(),s=w.v102_score_depth(lo,hi,d),time=performance.now()-start;
      assert.equal(s,Math.fround(score));assert.equal(w.v102_nodes(),nodes);assert.equal(w.v102_cache_hits(),hits);pair[v]=time;
    }
    out.push({pass,index:i,depth:d,oldMs:pair[0],newMs:pair[1]});
  }
  return {samples:out.length,oldMeanMs:mean(out.map(r=>r.oldMs)),newMeanMs:mean(out.map(r=>r.newMs)),oldP95Ms:pct(out.map(r=>r.oldMs),.95),newP95Ms:pct(out.map(r=>r.newMs),.95),scoresNodesAndSearchTTHitsIdentical:true,rows:out};
}
async function decisions(){
  const corpus=require('../tests/fixtures/positions.json').filter(b=>rules.legalRootBranches(b).length>1),starts=require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>s.game.board);
  const boards=[...corpus,...starts],out=[],cs=[];
  for(const v of ['v11.5','current'])cs.push(await client(v,{coordinator:true}));
  try{for(const mode of ['fast','strong','extreme','god']){
    for(let i=0;i<12;i++)for(const c of cs)await c.request({type:'analyze',board:boards[i],strength:mode});
    for(let pass=0;pass<3;pass++)for(let i=0;i<boards.length;i++){
      const pair=[];for(const v of (pass+i)%2?[1,0]:[0,1]){const start=performance.now(),r=await cs[v].request({type:'analyze',board:boards[i],strength:mode});assert.ok(!r.cached);assert.ok(rules.moveBoardPlain(boards[i],r.best).moved);pair[v]={ms:r.time,wallMs:performance.now()-start,depth:r.depth,best:r.best,nodes:r.nodes,scores:r.scores};}
      out.push({mode,pass,index:i,empties:rules.countEmpties(boards[i]),maxTile:Math.max(...boards[i]),old:pair[0],current:pair[1]});
    }
    console.log('Completed latency mode '+mode);
  }}finally{for(const c of cs)await c.close();}
  const summary=Object.fromEntries(['fast','strong','extreme','god'].map(mode=>{const a=out.filter(r=>r.mode===mode);return [mode,{samples:a.length,oldMeanMs:mean(a.map(r=>r.old.ms)),newMeanMs:mean(a.map(r=>r.current.ms)),oldMeanWallMs:mean(a.map(r=>r.old.wallMs)),newMeanWallMs:mean(a.map(r=>r.current.wallMs)),oldP50Ms:pct(a.map(r=>r.old.ms),.5),newP50Ms:pct(a.map(r=>r.current.ms),.5),oldP95Ms:pct(a.map(r=>r.old.ms),.95),newP95Ms:pct(a.map(r=>r.current.ms),.95),sameMoves:a.filter(r=>r.old.best===r.current.best).length,sameScores:a.filter(r=>JSON.stringify(r.old.scores)===JSON.stringify(r.current.scores)).length,sameDepths:a.filter(r=>r.old.depth===r.current.depth).length}];}));
  return {summary,rows:out};
}
(async()=>{
  const report={date:new Date().toISOString(),node:process.version,protocol:'Sequential alternating A/B; exact shared inputs; 5 kernel passes, 3 decision passes per mode; no concurrent benchmark; first-use initialization warmed.',oldHash:hash(path.join(root,'tests/fixtures/v11.5.html')),currentHash:hash(path.join(root,'2048-ai.html')),kernels:await kernels()};
  if(process.argv[2]!=='kernel')report.decisions=await decisions();
  fs.writeFileSync(path.join(root,process.env.OUTPUT||'docs/V11_6_LATENCY.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({kernel:{...report.kernels,rows:undefined},decisions:report.decisions?.summary},null,2));
})().catch(e=>{console.error(e);process.exit(1);});

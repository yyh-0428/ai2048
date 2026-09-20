// Run sequentially; never compare parallel benchmark processes competing for CPU.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {root,originalPath,scripts,engine,rules,rng,spawn,uiHarness}=require('./harness.cjs');
const oldSource=scripts(fs.readFileSync(originalPath,'utf8')).worker,newSource=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const output=process.env.BENCH_OUTPUT?path.resolve(process.env.BENCH_OUTPUT):path.join(root,'docs/v9.2-results.json');
const report={date:new Date().toISOString(),environment:{node:process.version,arch:process.arch,cpus:os.availableParallelism()},notes:['Node worker_threads with production source and independent root TTs; not browser rendering or Mac hardware.','Wall-clock decisions are not deterministic despite fixed spawn seeds.','Synthetic UI delay delays every worker-to-main delivery; coordinator-to-root MessagePorts remain direct.']};
const percentile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]||0;
const stats=a=>({mean:a.reduce((x,y)=>x+y,0)/a.length,p50:percentile(a,.5),p95:percentile(a,.95),max:Math.max(...a)});
const checkpoint=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
async function client(baseline,uiDelay=0){
 const h=uiHarness({baseline,realWorkers:true,uiDelay});let pending;
 h.hook.listen(r=>{if(pending){const p=pending;pending=null;p(r);}});
 return {async search(board,strength='fast'){
  h.hook.set({board},strength);return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('AI did not return a decision')),15000);pending=r=>{clearTimeout(t);resolve(r)};h.hook.askAI();});
 },close:()=>h.close()};
}
async function makeCorpus(){
 const e=engine(oldSource);await e.ready;const corpus=[];
 for(let seed=1;seed<=6;seed++){
  const random=rng(seed),b=Array(16).fill(0);spawn(b,random);spawn(b,random);let board=b;
  for(let n=0;n<1800;n++){
   const canon=rules.canonicalAI(board),branches=rules.legalRootBranches(canon.board);if(!branches.length)break;
   const cfg={...rules.config(board,'fast'),forceJS:false};let best=null,score=-Infinity;
   for(const br of branches){const r=await e.wasmExact(br.board,br.gain,3,cfg,0);if(r.score>score){score=r.score;best=br.dir;}}
   if(n>=100&&n%50===0)corpus.push(board.slice());
   const real=rules.inverseTransformDir(best,canon.t);board=rules.moveBoardPlain(board,real).board;spawn(board,random);
  }
 }
 fs.writeFileSync(path.join(root,'tests/fixtures/positions.json'),JSON.stringify(corpus)+'\n');return corpus;
}
async function fixed(corpus){
 const a=engine(oldSource),b=engine(newSource);await Promise.all([a.ready,b.ready]);let equal=0,count=0;const oldTimes=[],newTimes=[];
 for(const board of corpus){const canon=rules.canonicalAI(board),c=rules.config(board,'fast');
  for(const branch of rules.legalRootBranches(canon.board)){
   const depth=4,ra=await a.wasmExact(branch.board,branch.gain,depth,c,0),rb=await b.wasmExact(branch.board,branch.gain,depth,c,0);
   if(ra.score===rb.score&&ra.nodes===rb.nodes)equal++;count++;oldTimes.push(ra.time);newTimes.push(rb.time);
  }
 }
 report.fixedDepth={positions:corpus.length,roots:count,identicalScoreAndNodes:equal,depth:4,oldMs:stats(oldTimes),newMs:stats(newTimes)};checkpoint();console.log('fixedDepth',report.fixedDepth);
}
async function latency(corpus){
 report.latency=[];
 const sample=corpus.filter((_,i)=>i%3===0).slice(0,60);
 for(const uiDelay of [0,4])for(const mode of ['fast','extreme']){
  for(const baseline of [true,false]){
   const c=await client(baseline,uiDelay),times=[],depths=[],wall=[],moves=[];await c.search(sample[0],mode);
   for(const board of sample){const t=performance.now(),r=await c.search(board,mode);wall.push(performance.now()-t);times.push(r.time);depths.push(r.depth);moves.push(r.best);}
   await c.close();const row={version:baseline?'9.1':'9.2',mode,uiDelay,positions:sample.length,searchMs:stats(times),wallMs:stats(wall),depth:stats(depths),moves};
   report.latency.push(row);checkpoint();console.log('latency',JSON.stringify({...row,moves:undefined}));
  }
 }
}
async function games(count,resume=false){
 if(!resume)report.games=[];
 report.gameSummary={};
 if(resume){
   const completeSeeds=new Set(Array.from({length:count},(_,i)=>i+1).filter(seed=>report.games.filter(g=>g.seed===seed).length===2));
   report.incompleteBeforeResume=(report.incompleteBeforeResume||[]).concat(report.games.filter(g=>!completeSeeds.has(g.seed)));
   report.games=report.games.filter(g=>completeSeeds.has(g.seed));
   report.notes.push(`Resumed complete seed pairs on ${new Date().toISOString()}; unfinished pair restarted. Runtime ${process.version}/${process.arch}/${os.availableParallelism()} CPUs. Results are development smoke only.`);
 }
 for(let seed=Number(process.env.BENCH_SEED_START||1);seed<=count;seed++){
  // Alternate run order to reduce systematic warmup / machine drift bias.
  for(const baseline of seed%2?[true,false]:[false,true]){
   if(report.games.some(g=>g.seed===seed&&g.version===(baseline?'9.1':'9.2')))continue;
   const c=await client(baseline),random=rng(seed),times=[],depths=[],nodes=[],r0=Array(16).fill(0);spawn(r0,random);spawn(r0,random);
   let board=r0,score=0,moves=0,risk=0,verified=0;await c.search(board);
   const started=performance.now();
   while(rules.legalRootBranches(board).length){
    const r=await c.search(board);if(!r.best)throw new Error('Missing move');const m=rules.moveBoardPlain(board,r.best);if(!m.moved)throw new Error('Illegal move');
    board=m.board;score+=m.gain;moves++;spawn(board,random);times.push(r.time);depths.push(r.depth);nodes.push(r.nodes);risk+=!!r.riskChecked;verified+=!!r.verified;
    // 4-bit baseline cannot be meaningfully timed after entering its broken JS
    // fallback path; keep completed and stopped games distinct in the report.
    if(board.some(v=>v>=32768))break;
   }
   const completed=rules.legalRootBranches(board).length===0;
   const row={seed,version:baseline?'9.1':'9.2',mode:'fast',score,moves,maxTile:Math.max(...board),completed,stopReason:completed?'terminal':'32768 boundary',elapsedMs:performance.now()-started,searchMs:stats(times),depth:stats(depths),nodes:stats(nodes),risk,verified};
   report.games.push(row);checkpoint();console.log('game',JSON.stringify(row));await c.close();
  }
 }
 for(const version of ['9.1','9.2']){
  const games=report.games.filter(g=>g.version===version),scores=games.map(g=>g.score);
  report.gameSummary[version]={games:games.length,completed:games.filter(g=>g.completed).length,score:{...stats(scores),p10:percentile(scores,.1)},tiles:Object.fromEntries([2048,4096,8192,16384,32768].map(t=>[t,games.filter(g=>g.maxTile>=t).length])),meanMoves:games.reduce((s,g)=>s+g.moves,0)/games.length};
 }checkpoint();console.log('summary',JSON.stringify(report.gameSummary));
}
(async()=>{
 const action=process.argv[2]||'all';
 if(fs.existsSync(output))Object.assign(report,JSON.parse(fs.readFileSync(output,'utf8')));
 if(action==='games'||action==='resume-games'){await games(Number(process.argv[3]||20),action==='resume-games');return;}
 const corpus=fs.existsSync(path.join(root,'tests/fixtures/positions.json'))?JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/positions.json'),'utf8')):await makeCorpus();
 await fixed(corpus);await latency(corpus);if(action==='all')await games(20);
})().catch(e=>{console.error(e);process.exitCode=1;});

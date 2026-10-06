'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs');
const {randomStream}=require('./late-game.cjs'),{write,fileHash,addTile,mass,potential,hash}=require('./evaluate-v117.cjs');
(async()=>{
 const protocol=require('../docs/V11_8_PROTOCOL.json'),p=protocol.freshValidation,dir=path.join(root,'tests/fixtures/late-game-v118'),file=dir+'/manifest.json';
 let manifest={date:new Date().toISOString(),source:p.source,sourceSHA256:fileHash('tests/fixtures/v11.7.html'),protocol:p,checkpoints:[],rejected:[],complete:false};
 if(fs.existsSync(file)){assert.equal(process.env.RESUME,'1','never overwrite a completed or unapproved corpus');manifest=JSON.parse(fs.readFileSync(file));assert.ok(!manifest.complete);assert.deepEqual(manifest.protocol,p);assert.equal(manifest.sourceSHA256,fileHash('tests/fixtures/v11.7.html'));}
 const known=[...require('../tests/fixtures/late-game/manifest.json').checkpoints,...require('../tests/fixtures/late-game-v117/manifest.json').checkpoints,...manifest.checkpoints],seen=new Set(known.map(s=>rules.canonicalAI(s.game.board).board.join(',')));
 const last=[...manifest.checkpoints.map(s=>s.random.seed),...manifest.rejected.map(s=>s.seed)],first=last.length?Math.max(...last)+1:p.seedFirst;
 const c=await client('v11.7',{coordinator:true,poolSize:4});
 try{for(let seed=first;seed<=p.seedLast&&manifest.checkpoints.length<p.uniqueStarts;seed++){
  const target=manifest.checkpoints.length<16?170000:230000,random=randomStream(seed),lines=[];let board=Array(16).fill(0),score=0,moveCount=0,spawnMass=0,spawnPotential=0;
  const initial=[];for(let i=0;i<2;i++){const s=addTile(board,random);initial.push(s);spawnMass+=s.value;spawnPotential+=s.value*Math.log2(s.value);}
  while(score<target&&rules.legalRootBranches(board).length){
   const r=await c.request({type:'analyze',board,strength:'extreme'}),m=rules.moveBoardPlain(board,r.best);assert.ok(m.moved);assert.deepEqual(Object.keys(r.scores).sort(),rules.legalRootBranches(board).map(b=>b.dir).sort());
   board=m.board;score+=m.gain;moveCount++;const spawn=addTile(board,random);spawnMass+=spawn.value;spawnPotential+=spawn.value*Math.log2(spawn.value);
   lines.push(JSON.stringify({move:moveCount-1,best:r.best,depth:r.depth,scores:r.scores,spawn,random:random.snapshot()}));
  }
  assert.equal(mass(board),spawnMass);assert.equal(potential(board)-spawnPotential,score);assert.equal(random.snapshot().draws,2*(moveCount+2));
  const raw=Buffer.from(lines.join('\n')+'\n'),gzip=zlib.gzipSync(raw,{level:9}),log='docs/raw-v118/generation/seed-'+seed+'.jsonl.gz';fs.mkdirSync(path.dirname(root+'/'+log),{recursive:true});fs.writeFileSync(root+'/'+log,gzip);
  const key=rules.canonicalAI(board).board.join(','),terminal=!rules.legalRootBranches(board).length;
  const certificate={initial,source:p.source,spawnMass,spawnPotential,terminal,prefixLog:log,prefixLogSHA256:hash(gzip),prefixSHA256:hash(raw)};
  if(score<target||terminal||seen.has(key))manifest.rejected.push({seed,score,moveCount,reason:score<target?'terminal before target':terminal?'terminal at target':'duplicate canonical board',board,random:random.snapshot(),reachability:certificate});
  else{seen.add(key);const s={id:'seed-'+seed,split:'independent-v118',format:'2048-ai-save',version:1,game:{board,score,moveCount},random:random.snapshot(),targetScore:target,reachability:certificate};manifest.checkpoints.push(s);write(dir+'/'+s.id+'.json',s);}
  write(file,manifest);console.log(JSON.stringify({seed,accepted:manifest.checkpoints.length,rejected:manifest.rejected.length,score,moveCount,maxTile:Math.max(...board),empties:rules.countEmpties(board)}));
 }}finally{await c.close();}
 assert.equal(manifest.checkpoints.length,p.uniqueStarts,'Insufficient fresh high-score starts');manifest.complete=true;write(file,manifest);
})().catch(e=>{console.error(e);process.exitCode=1;});

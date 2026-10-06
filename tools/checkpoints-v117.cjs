'use strict';
// Precommitted fresh seed sequence. Never select starts using candidate results.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {root,rules}=require('../tests/harness.cjs'),{client}=require('../tests/clients-v10.cjs'),{randomStream}=require('./late-game.cjs');
const {addTile,write,fileHash,mass,potential,pauseCheckpoint}=require('./evaluate-v117.cjs');
(async()=>{
 const protocol=require('../docs/V11_7_PROTOCOL.json'),dir=path.join(root,'tests/fixtures/late-game-v117'),previous=path.join(dir,'manifest.json');assert.ok(!fs.existsSync(previous)||process.env.RESUME==='1','Generation cannot overwrite a frozen corpus');
 let manifest={date:new Date().toISOString(),format:'2048-late-corpus',version:1,source:'V11.5 god',sourceHash:fileHash('tests/fixtures/v11.5.html'),protocol,checkpoints:[],rejected:[]};
 if(fs.existsSync(previous)){manifest=JSON.parse(fs.readFileSync(previous));assert.ok(!manifest.complete,'Cannot overwrite completed corpus');assert.deepEqual(manifest.protocol,protocol);assert.equal(manifest.sourceHash,fileHash('tests/fixtures/v11.5.html'));}
 const next=manifest.checkpoints.length+manifest.rejected.length?Math.max(...manifest.checkpoints.map(s=>s.random.seed),...manifest.rejected.map(s=>s.seed))+1:protocol.seedFirst;
 const c=await client('v11.5',{coordinator:true}),canonical=new Set(require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>rules.canonicalAI(s.game.board).board.join(',')));
 for(const s of manifest.checkpoints)canonical.add(rules.canonicalAI(s.game.board).board.join(','));
 try{for(let seed=next;seed<=protocol.seedLast&&manifest.checkpoints.length<20;seed++){
  const target=manifest.checkpoints.length<16?170000:230000,random=randomStream(seed),decisions=crypto.createHash('sha256');let board=Array(16).fill(0),score=0,moveCount=0,spawnMass=0,spawnPotential=0;
  for(let i=0;i<2;i++){const s=addTile(board,random);spawnMass+=s.value;spawnPotential+=s.value*Math.log2(s.value);}
  while(score<target&&rules.legalRootBranches(board).length){
   const r=await c.request({type:'analyze',board,strength:'god'}),m=rules.moveBoardPlain(board,r.best);assert.ok(m.moved);decisions.update(JSON.stringify([board,r.best,r.depth,r.scores])+'\n');board=m.board;score+=m.gain;moveCount++;
   const s=addTile(board,random);spawnMass+=s.value;spawnPotential+=s.value*Math.log2(s.value);
  }
  assert.equal(mass(board),spawnMass);assert.equal(potential(board)-spawnPotential,score);
  const key=rules.canonicalAI(board).board.join(','),terminal=!rules.legalRootBranches(board).length;
  if(score<target||terminal||canonical.has(key)){manifest.rejected.push({seed,score,moveCount,reason:score<target?'terminal before target':terminal?'terminal at target':'duplicate canonical board',board,random:random.snapshot()});console.log(JSON.stringify({rejected:seed,score,moveCount}));}
  else{canonical.add(key);const item={id:'seed-'+seed,split:'independent-v117',format:'2048-ai-save',version:1,game:{board,score,moveCount},random:random.snapshot(),targetScore:target,reachability:{source:'V11.5 god',spawnMass,spawnPotential,terminal:false,decisionsSHA256:decisions.digest('hex')}};manifest.checkpoints.push(item);write(path.join(dir,item.id+'.json'),item);console.log(JSON.stringify({saved:item.id,accepted:manifest.checkpoints.length,score,moveCount,empties:rules.countEmpties(board),maxTile:Math.max(...board)}));}
  write(path.join(dir,'manifest.json'),manifest);
  if(manifest.checkpoints.length&&manifest.checkpoints.length%5===0&&manifest.checkpoints.at(-1).random.seed===seed)await pauseCheckpoint('checkpoint generation',manifest.checkpoints.length);
 }}finally{await c.close();}
 assert.equal(manifest.checkpoints.length,20,'Insufficient fresh starts');manifest.complete=true;write(path.join(dir,'manifest.json'),manifest);
})().catch(e=>{console.error(e);process.exitCode=1;});

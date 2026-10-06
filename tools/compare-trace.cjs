'use strict';
// Step-by-step trace: find the first move where two builds diverge.
const {rules}=require('../tests/harness.cjs');
const {client}=require('../tests/clients-v10.cjs');
const {randomStream,spawn}=require('./late-game.cjs');

const A={name:'V11.6',html:'../2048-ai-v11.6/2048-ai.html'};
const B={name:'V11.9',html:'../2048-ai-v11.9/2048-ai-v11.9/2048-ai.html'};

async function mk(b){const prev=process.env.CURRENT_HTML;process.env.CURRENT_HTML=b.html;try{return await client('current',{coordinator:true,poolSize:4});}finally{if(prev===undefined)delete process.env.CURRENT_HTML;else process.env.CURRENT_HTML=prev;}}

(async()=>{
 const m=require('../tests/fixtures/late-game-v117/manifest.json');
 const start=m.checkpoints.find(c=>c.id===(process.env.START||'seed-601'));
 const limit=Number(process.env.LIMIT||80);
 const ca=await mk(A),cb=await mk(B);
 try{
  let ba=start.game.board.slice(),bb=start.game.board.slice(),sa=start.game.score,sb=start.game.score;
  const ra=randomStream(start.random.seed,start.random.state,start.random.draws);
  const rb=randomStream(start.random.seed,start.random.state,start.random.draws);
  for(let mv=0;mv<limit;mv++){
   const la=rules.legalRootBranches(ba).length,lb=rules.legalRootBranches(bb).length;
   if(!la||!lb){console.log('STOP at move',mv,'legalA',la,'legalB',lb);break;}
   const qa=await ca.request({type:'analyze',board:ba,strength:'god'});
   const qb=await cb.request({type:'analyze',board:bb,strength:'god'});
   const ma=rules.moveBoardPlain(ba,qa.best),mb=rules.moveBoardPlain(bb,qb.best);
   const same=(JSON.stringify(ba)===JSON.stringify(bb));
   if(qa.best!==qb.best||!same){
    console.log('DIVERGE at move',mv,'boardSame',same);
    console.log('  board      ',JSON.stringify(bb));
    console.log('  V11.6 best',qa.best,'scores',JSON.stringify(qa.scores));
    console.log('  V11.9 best',qb.best,'scores',JSON.stringify(qb.scores));
    console.log('  V11.9 extra keys',Object.keys(qb).filter(k=>!['id','type','best','scores','depth','nodes','time','revision','engine'].includes(k)).join(','));
    break;
   }
   ba=ma.board;bb=mb.board;sa+=ma.gain;sb+=mb.gain;spawn(ba,ra);spawn(bb,rb);
  }
 }finally{await ca.close();await cb.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

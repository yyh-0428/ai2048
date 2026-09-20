// Confirms the diagnosed original defects without intentionally failing the suite.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {uiHarness,engine,scripts,originalPath}=require('./harness.cjs');
(async()=>{
 const a=engine(scripts(fs.readFileSync(originalPath,'utf8')).worker);await a.ready;
 a.legacy().clearTT(); // Normal first clear is safe; it only increments the epoch.
 for(const what of ['stale hint','undo busy','old animation']){
  const h=uiHarness({baseline:true,reduced:what!=='old animation'});
  try{
   h.hook.set({board:[2,2,...Array(14).fill(0)]});
   if(what==='stale hint'){h.hook.askAI();h.hook.doMove('left');assert.equal(h.hook.state().aiBusy,true);}
   if(what==='undo busy'){h.hook.doMove('left');h.hook.askAI();h.hook.undo();assert.equal(h.hook.state().aiBusy,true);}
   if(what==='old animation'){h.hook.doMove('left');h.hook.newGame(true);assert.equal(h.ids.get('tiles').classList.contains('is-moving'),true);}
   console.log('Reproduced V9.1:',what);
  }finally{await h.close();}
 }
 console.log('Confirmed: first JS clear alone does not throw; no defect claimed.');
})().catch(e=>{console.error(e);process.exit(1)});

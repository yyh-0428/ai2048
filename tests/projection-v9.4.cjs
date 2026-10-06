const fs=require('node:fs'),vm=require('node:vm');
const {rules}=require('./harness.cjs');
const c={Game2048:rules,performance,postMessage(){},onmessage:null};vm.createContext(c);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/coordinator.js'),'utf8')+'\nglobalThis.api={projectSurvival};',c);
const project=c.api.projectSurvival;
async function requestProjected(client,board,horizon,nodeLimit){
 const p=project(board,horizon);
 if(!p.eligible)return {ok:false,best:null,survivals:null,projectionRejected:true};
 const r=await client.request({type:'riskall',board:Array.from(p.ranks,r=>r?2**r:0),horizon,nodeLimit});
 if(!r.ok){r.best=null;r.survivals=null;}
 return {...r,projected:p.changed,maxProjectedRank:p.maxRank};
}
module.exports={project,requestProjected};

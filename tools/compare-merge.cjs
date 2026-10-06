'use strict';
const fs=require('node:fs'),path=require('node:path');
const {root}=require('../tests/harness.cjs');
const {mean,pct}=require('./evaluate-v117.cjs');
const files=['docs/V11_8_COMPARE_PLAY.json','docs/V11_8_COMPARE_PLAY_B.json','docs/V11_8_COMPARE_PLAY_C.json'];
const labels={v116:'V11.6',v117:'V11.7(val)',v117b:'V11.7(2)release',v118:'V11.8默认',v118x:'V11.8实验',v119:'V11.9'};
const rows=[];
for(const f of files){const j=JSON.parse(fs.readFileSync(path.join(root,f)));for(const r of j.rows)rows.push(r);}
const keys=['v116','v117','v117b','v118','v118x','v119'];
const cps=[...new Set(rows.map(r=>r.checkpoint))];
const out={merged:new Date().toISOString(),checkpoints:cps,table:[],summary:{}};
for(const cp of cps){
 const line={checkpoint:cp,startScore:rows.find(r=>r.checkpoint===cp).startScore};
 for(const k of keys){const r=rows.find(x=>x.checkpoint===cp&&x.config===k);line[k]=r?{moves:r.additionalMoves,score:r.score,maxTile:r.maxTile,terminal:r.terminal,msPerMove:Math.round(r.meanWallMs*10)/10}:null;}
 out.table.push(line);
}
for(const k of keys){const rs=rows.filter(r=>r.config===k);out.summary[k]={label:labels[k],games:rs.length,meanAdditionalMoves:Math.round(mean(rs.map(r=>r.additionalMoves))),medianAdditionalMoves:Math.round(pct(rs.map(r=>r.additionalMoves),.5)),meanFinalScore:Math.round(mean(rs.map(r=>r.score))),minFinalScore:Math.min(...rs.map(r=>r.score)),maxFinalScore:Math.max(...rs.map(r=>r.score)),reached16384:rs.filter(r=>r.maxTile>=16384).length,reached32768:rs.filter(r=>r.maxTile>=32768).length,earlyDeaths:rs.filter(r=>r.additionalMoves<500).length,meanMsPerMove:Math.round(mean(rs.map(r=>r.meanWallMs))*10)/10};}
fs.writeFileSync(path.join(root,'docs/V11_8_COMPARE_MERGED.json'),JSON.stringify(out,null,2)+'\n');
console.log('=== 存活（附加步数 / 终局分数）===');
console.log(['checkpoint','start'].concat(keys.map(k=>labels[k])).join('\t'));
for(const l of out.table)console.log([l.checkpoint,l.startScore].concat(keys.map(k=>l[k]?`${l[k].moves}步/${l[k].score}`:'-')).join('\t'));
console.log('\n=== 汇总 ===');
for(const k of keys)console.log(k,JSON.stringify(out.summary[k]));

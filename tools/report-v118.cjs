'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{root,rules}=require('../tests/harness.cjs');
const {summary,mean,pct,write,fileHash}=require('./evaluate-v117.cjs'),{acceptance}=require('./evaluate-v118.cjs');
const load=name=>JSON.parse(fs.readFileSync(root+'/docs/'+name+'.json'));
const n=x=>Number(x.toFixed(2)).toLocaleString('en-US'),pc=x=>(x*100).toFixed(1)+'%';
const table=(headers,rows)=>'| '+headers.join(' | ')+' |\n| '+headers.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n');
function metrics(rows,variants){return table(['策略','终局数','新增均值','新增中位数','较差25%均值','早死<1000步','终局均分','16384','32768'],variants.map(v=>{const a=summary(rows.filter(r=>r.variant===v));return [v,a.games,n(a.meanAdditionalMoves),n(a.medianAdditionalMoves),n(a.bottomQuartileMean),pc(a.earlyDeathRate),n(a.meanScore),pc(a.reached16384Rate),pc(a.reached32768Rate)];}));}
function clusteredInterval(rows,candidate,baseline){
 const ids=[...new Set(rows.map(r=>r.checkpoint))],pairs=ids.map(id=>({a:mean(rows.filter(r=>r.checkpoint===id&&r.variant===candidate).map(r=>r.additionalMoves)),b:mean(rows.filter(r=>r.checkpoint===id&&r.variant===baseline).map(r=>r.additionalMoves))}));
 let state=1182048;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;},ratios=[];
 for(let k=0;k<5000;k++){let a=0,b=0;for(let i=0;i<pairs.length;i++){const p=pairs[Math.floor(random()*pairs.length)];a+=p.a;b+=p.b;}ratios.push(a/b);}
 return {unit:'independent seed, averaging all retained repeats before sampling',clusters:pairs.length,resamples:5000,lower95:pct(ratios,.025),upper95:pct(ratios,.975)};
}
function danger(board){
 const branches=rules.legalRootBranches(board),births=[];
 for(const b of branches){let death=0,minMoves=4;const empty=b.board.map((v,i)=>v?-1:i).filter(i=>i>=0);for(const i of empty)for(const [tile,p] of [[2,.9],[4,.1]]){const after=b.board.slice();after[i]=tile;const count=rules.legalRootBranches(after).length;death+=!count?p/empty.length:0;minMoves=Math.min(minMoves,count);}births.push({dir:b.dir,death,minMoves});}
 return {empties:rules.countEmpties(board),maxTile:Math.max(...board),legal:branches.length,minimumImmediateDeath:Math.min(...births.map(b=>b.death)),worstMinimumNextLegal:Math.min(...births.map(b=>b.minMoves))};
}
function generate(){
 const names=['PILOT_A','PILOT_B','DEVELOPMENT','LEARNED_DEVELOPMENT','GUARDED_DEVELOPMENT','FEEDBACK_DEVELOPMENT','SPECTRUM_DEVELOPMENT','ARBITRATED_DEVELOPMENT','PHASED_DEVELOPMENT','ABLATION','VALIDATION','OTHER_MODES'],reports=Object.fromEntries(names.map(s=>[s,load('V11_8_'+s)]));
 for(const [name,j] of Object.entries(reports)){assert.ok(j.complete,name);assert.ok(j.rows.every(r=>r.terminal&&r.stopReason==='no legal moves'),name);}
 const val=reports.VALIDATION,freeze=load('V11_8_FREEZE'),candidate=freeze.candidate,gate=acceptance(val.rows,candidate,2),release=load('V11_8_RELEASE_DECISION');assert.deepEqual(gate,val.acceptance);assert.equal(gate.passed,release.gatePassed);
 const latency=load('V11_8_LATENCY'),memo=load('V11_8_MEMO_LATENCY'),replay=load('V11_8_REPLAY'),tests=load('TEST_RESULTS_V11_8'),identity=load('V11_8_FINAL_BUILD_IDENTITY'),model=load('V11_8_LEARNING_REPORT'),data=load('V11_8_LEARNING_DATA');
 assert.ok(latency.complete&&memo.complete&&replay.passed&&tests.passed&&identity.sameDecisionImplementation);assert.equal(tests.htmlSHA256,fileHash('2048-ai.html'));assert.equal(identity.finalHTMLSHA256,fileHash('2048-ai.html'));
 const corpus=JSON.parse(fs.readFileSync(root+'/tests/fixtures/late-game-v118/manifest.json'));assert.ok(corpus.complete);assert.equal(corpus.checkpoints.length,20);
 const all=Object.values(reports).flatMap(j=>j.rows),speeds=Object.entries(latency.summary).filter(([k,s])=>k!=='god-innovation'&&s.clearSpeedup).map(([k])=>k),intervals=Object.fromEntries(['original','stable'].map(v=>[v,clusteredInterval(val.rows,candidate,v)]));
 const result={date:new Date().toISOString(),version:'11.8.0',goalMet:gate.passed,candidate,defaultPolicy:release.defaultPolicy,acceptance:gate,validation:{independentUniqueStarts:20,repeats:2,terminalGames:val.rows.length,summary:val.summary,intervals,comparatorSignatures:val.signatures},
  sourceHashes:freeze.sourceSHA256,finalHTMLSHA256:fileHash('2048-ai.html'),reports:Object.fromEntries(Object.entries(reports).map(([k,j])=>[k,{games:j.rows.length,summary:j.summary,signatures:j.signatures}])),terminalGames:all.length,replayedMoves:replay.moves,tests,modelTraining:model,trainingData:data,latency:latency.summary,memo,clearModeSpeedups:speeds,corpusDiversity:corpus.checkpoints.map(s=>({id:s.id,score:s.game.score,moves:s.game.moveCount,...danger(s.game.board)})),finalBuildIdentity:identity};
 write(root+'/docs/V11_8_SUMMARY.json',result);
 const pairRows=[];for(const s of corpus.checkpoints)for(let repeat=0;repeat<2;repeat++){const get=v=>val.rows.find(r=>r.checkpoint===s.id&&r.repeat===repeat&&r.variant===v),a=get('original'),b=get('stable'),c=get(candidate);pairRows.push([s.id,repeat,a.additionalMoves,b.additionalMoves,c.additionalMoves,c.additionalMoves-a.additionalMoves,c.additionalMoves-b.additionalMoves,[a.score,b.score,c.score].join('/'),[a.maxTile,b.maxTile,c.maxTile].join('/')]);}
 const lines=['# 2048 AI V11.8 升级报告','',
 gate.passed?'冻结候选通过预先承诺的独立终局验收，默认神级采用该候选。':'冻结候选没有通过全部独立终局验收。新机制已实现并可开关试用，但默认神级保留输入 V11.6 的原策略，不能宣布整体棋力升级。','',
 `本轮实际完成 ${all.length} 个终局。最终验证是 20 个新独立起点 × 3 个策略 × 2 次重复，共 ${val.rows.length} 个终局；重复不是新增独立样本。已有 8 个旧起点和 V11.7 的 20 个起点全部属于已知数据。训练历史轨迹不算本轮新终局成绩。`,'',
 '## 实际新增的策略','',
 '反事实规划把不同方向放进同一组公开棋盘生成的虚拟未来，比较完整的存活分布。16条路径各走96个出生回合，每个模拟行动完整比较全部合法方向；两组分别要求配对均值、尾部和模拟死亡数达标。原主搜索完整d4/d5/d6先完成，模拟用d2控制器，不降低实际主搜索深度。虚拟未来从不读取真实游戏随机流。两组共同参与筛选，样本标准误门槛是决策规则，不是统计显著性或数学安全证明。','',
 '学习模块用真实终局轨迹训练三套64→32→3小网络，预测256、1024、4096步的逃生潜力。输入只有棋盘几何，没有分数、步数、seed或实际PRNG。按整局seed聚类采样；重复棋形保留实际展示过的最长生命，因此预测是带乐观选择的逃生潜力，不能称为校准后的生存概率。完整枚举所有2/4出生格并按90/10加权。','',
 '终点复核评估模拟后最后一次出生、下一步行动前的棋盘。提前死掉的路线未来分数为零；除总体长期分数，还保护双方都活着的配对路线，避免短路线数量掩盖长路线损失。证据仲裁允许两组很强、逐路径损失受限的逃生证据推翻已完成的模型否决；主评分近分、即时死亡、完整风险和候选自有证明仍优先。','',
 '分阶段仲裁只在最大块小于16384时允许这种推翻，形成16384后保留长期模型的否决。这是可独立关闭的经验假设，不能称为资产安全证明。并未强行锁角、修改棋盘权重或把未完成搜索纳入比较。','',
 '这些机制是本项目新增的决策结构。Rollout、共同随机数、学习价值与分阶段方法已有研究，本报告不声称世界首创。最终是否有用以以下真实终局和事先验收为准。','',
 '## 从失败中迭代','',
 '24步模拟在4个旧退步起点上没有换招，却增加开销，撤回。96步纯模拟出现收益与严重回退并存：短视野的便宜控制器会把完整主策略能长期维持的路线估得过差。第一轮模型直接出招回退；直接根棋形的否决又阻挡了真实有收益的逃生。第二轮加入已知开发策略的正负终局反馈，固定训练结构、30轮和学习率，不使用最终独立样本。','',
 '长期模型直接提出换招的候选也失败：seed-1仅7030步，seed-5仅445步；终点只复核候选分别为17248和4154步。强短期仲裁随后让seed-1降为6908步。其4190步、16384阶段的换招，两组总生命收益为250/186步，却压过了部分共同存活路线的长期损失信号；seed-2的8192阶段仲裁则真实活到7610步。由此提出分阶段仲裁，先在8个已知起点完整对照，再冻结一个候选。以上全是开发证据。','',
 '旧V11.6的共识/合并偏好/深度回退、风险层与终局平局补救的首次分歧详见保留的V11_7_FIRST_DIVERGENCES.json：seed-2/4/5/103分别在192/541/305/87步发生差异，多数是实际出招的深度排序振荡，首次差异处未触发风险或终局平局补救。这是历史诊断，不作为本轮新成绩；本轮没有假设一律加深或一律撤销共识就更强。','',
 '### 全部开发终局汇总',''];
 for(const name of names.filter(s=>!['VALIDATION','OTHER_MODES'].includes(s))){const j=reports[name];lines.push('#### '+name,'',metrics(j.rows,Object.keys(j.summary)),'');}
 const known=reports.DEVELOPMENT.rows.filter(r=>['original','stable'].includes(r.variant));
 lines.push('### 逐个旧起点的主要候选','',table(['起点','原God','稳定基线','纯模拟','直接学习r2','根保护r2','终点保护','长期主动换招','强仲裁','分阶段仲裁'],require('../tests/fixtures/late-game/manifest.json').checkpoints.map(s=>[s.id,...[['DEVELOPMENT','original'],['DEVELOPMENT','stable'],['DEVELOPMENT','cf'],['FEEDBACK_DEVELOPMENT','learned'],['FEEDBACK_DEVELOPMENT','guarded'],['SPECTRUM_DEVELOPMENT','trajectory'],['SPECTRUM_DEVELOPMENT','spectrum'],['ARBITRATED_DEVELOPMENT','arbitrated'],['PHASED_DEVELOPMENT','phased']].map(([f,v])=>reports[f].rows.find(r=>r.checkpoint===s.id&&r.variant===v).additionalMoves)])),'',
 '表中旧起点对照实际使用冻结V11.7中保留的原God/稳定策略，报告保留各次真实HTML散列。最终独立验证改用精确的输入V11.6God与V11.5God稳定HTML，修改发生在任何新起点生成前，数值门槛不变。','',
 '## 独立终局验收','',
 `候选：\`${candidate}\`；冻结HTML SHA256：\`${freeze.htmlSHA256}\`。策略、模型、数值门槛和种子顺序均在新起点生成前固定。没有按最终结果重新选候选或调参。`,'',
 '每份起点从空盘真实运行稳定策略产生。预定种子18001起按顺序接收首批20个不同的非终局高分棋盘：16份约17万分、4份约23万分，失败种子也保留。每局恢复棋盘、分数、累计步数及mulberry32完整state/draws；直到没有合法动作才结束。','',
 metrics(val.rows,['original','stable',candidate]),'',
 table(['对照','均值≥105%','中位数≥98%','低25%≥98%','早死不增','均分不降','16384不降','32768不降','配对中位收益≥0','胜≥负且≥5','删任一seed仍≥102%','全部通过'],Object.entries(gate.against).map(([v,g])=>[v,...['mean','median','lowerQuartile','earlyDeath','score','tile16384','tile32768','pairedMedian','pairedWins','noSinglePeak'].map(k=>g.checks[k]?'通过':'未通过'),g.passed?'是':'否'])),'',
 ...Object.entries(gate.against).map(([v,g])=>`${v}配对seed均值胜/负/平：${g.pairedEvidence.wins}/${g.pairedEvidence.losses}/${g.pairedEvidence.ties}；收益中位数${n(g.pairedEvidence.medianGain)}步；删除任意一个seed后的最低均值比${g.pairedEvidence.minimumLeaveOneOutMeanRatio.toFixed(4)}。按20个seed聚类的均值比95%自助区间为${intervals[v].lower95.toFixed(3)}–${intervals[v].upper95.toFixed(3)}，不是40个独立样本。`),'',
 '### 每局结果，包含全部退步','',
 '分数和最大块列的顺序均为 原God / 稳定基线 / 候选。r0/r1是同一起点的两次实际重复。','',
 table(['起点','重复','原God新增','稳定新增','候选新增','对God差','对稳定差','终局分数','最大块'],pairRows),'',
 '### 起点覆盖','',table(['起点','分数','累计步数','空格','最大块','合法根','最好即时死亡概率','最差出生后可动数'],result.corpusDiversity.map(s=>[s.id,s.score,s.moves,s.empties,s.maxTile,s.legal,pc(s.minimumImmediateDeath),s.worstMinimumNextLegal])),'',
 '## 性能与其他模式','',
 '固定同盘预热20次、四个计算Worker、五遍交替A/B，单独运行。worker计算耗时为每轮最长计算通道之和，包含弃置轮次、证明、风险、verifier和模拟；协调器时间另包含学习模型推理。端到端是Node发请求到收到答复，不含浏览器绘制和走棋节奏。不同策略整局遇到的棋盘不相同，因此不使用整局平均耗时声称加速。','',
 table(['同名模式/策略','评分/深度/出招相同','worker中位/P95 旧→新ms','端到端中位/P95 旧→新ms','明确提速'],Object.entries(latency.summary).map(([k,s])=>{const a=s.latency['v11.7'],b=s.latency.current;return [k,`${s.sameScores}/${s.samples},${s.sameDepths}/${s.samples},${s.sameMoves}/${s.samples}`,`${n(a.computeMs.median)}/${n(a.computeMs.p95)}→${n(b.computeMs.median)}/${n(b.computeMs.p95)}`,`${n(a.wallMs.median)}/${n(a.wallMs.p95)}→${n(b.wallMs.median)}/${n(b.wallMs.p95)}`,k==='god-innovation'?'策略改变，不作提速结论':s.clearSpeedup?'是':'否'];})),'',
 '性能JSON还完整保留V11.6同名模式，以及旧V11.5深入限时加深的全部五遍测量，没有选择最差旧版单次。深入的原高速d5保留；轻快、深入、极致没有新增出招策略，不能宣布这些模式整体棋力提高。','',
 `精确模拟memo独立开关只复用同一整盘/深度的native值，私有、最多16384项、任务结束销毁。所有路径生命、合并收益、最少空格、终点评分、终点棋盘和最终选择逐项相同。是否达到≥5%中位数并控制P95的门槛：${memo.clearSpeedup?'是，保留默认':'否，撤回默认'}；完整warm A/B见V11_8_MEMO_LATENCY.json，不能把节点减少当实际提速。`,'',
 metrics(reports.OTHER_MODES.rows,Object.keys(reports.OTHER_MODES.summary)),'',
 '其他模式从两份不同的已知高分起点同名A/B，每份重复3次，共36个终局，全部结果保留。这是有限回归样本，不是其他模式棋力独立验证集。','',
 '## 正确性与交付','',
 `${tests.tests}项、${tests.groups}组回归通过。逐步回放${all.length}个终局、${n(replay.moves)}步，核对所有合法根评分集合、有限值、真实出生/完整随机状态、最终分数、质量与势能、无合法动作终止。20份高分来源前缀完整回放；模型终点预测、阶段阻止和强仲裁证据重新计算。`,'',
 'WASM不可用及65536以上继续兼容回退；32768总量与有限视野边界保留。模拟另检查总量加所有96次出生及后续搜索视野的严格65536边界。未完成搜索、概率、模型或轨迹不能换招；新开关纳入缓存键，取消/撤销/导入后旧结果不得生效。','',
 '发布HTML内嵌规则、计算Worker、协调器、学习模型和两份WASM与源码逐字节核对。发布默认只由预定验收决定；相对冻结验证构建，决策函数未变，只有经过验收决定的默认布尔参数与界面说明可变化。最终构建核对见V11_8_FINAL_BUILD_IDENTITY.json。','',
 '旧存档格式、浏览器存储键、导入导出、撤销、自动玩、离线HTML和Mac启动文件保留。浏览器导入只恢复棋盘、分数、累计步数，随后使用浏览器随机数；命令行复测才严格恢复保存的PRNG。测试环境为Node/Linux、模拟DOM和真实WASM Worker；Mac脚本检查语法与可执行权限，没有宣称原生Mac浏览器实测。','',
 '主包包含离线HTML、源码、模型及独立可重训的压缩数据、启动文件、存档、复测工具、逐局终局JSON和报告。原始逐步JSONL.gz及来源前缀另放Evidence.zip，解压到同一父目录会合并到docs/raw-v118。不再把旧版逐步原始日志重复放入主包。','',
 '```sh','npm run build','npm test','npm run replay:v118','CURRENT_HTML=tests/fixtures/v118-validation.html OUTPUT=docs/my-validation.json npm run benchmark:v118','CURRENT_HTML=tests/fixtures/v118-validation.html OUTPUT=docs/my-latency.json npm run benchmark:v118:latency','CURRENT_HTML=tests/fixtures/v118-validation.html OUTPUT=docs/my-other.json npm run benchmark:v118:other','# 在工程副本中重训，会更新模型和预测向量','python3 tools/train-survival-v118.py','npm run build','npm test','```','',
 '复测使用新OUTPUT，保存本轮原始报告；显式RESUME=1只可续跑相同HTML/参数/起点散列的中断记录。复跑同一冻结集合是复现，不新增独立样本。如果继续根据本集合调参，必须另留新验证起点。训练模型需Python的NumPy/threadpoolctl；游戏与Node回归无需npm install或联网。','');
 fs.writeFileSync(root+'/docs/V11_8_UPGRADE.md',lines.join('\n'));
 fs.writeFileSync(root+'/README.md',`# 2048 AI V11.8\n\n双击“启动 2048 AI.command”，或直接打开2048-ai.html。离线、本机计算，无需账号和联网；Mac端口20480。\n\n新增反事实续命规划、真实轨迹学习生存谱、模拟终点复核和分阶段证据仲裁。${gate.passed?'默认神级采用通过20个新起点×2次重复、同时对比原God和稳定基线全部门槛的'+candidate+'候选。':'候选未通过全部独立终局门槛，默认神级维持输入V11.6原策略；展开“神级实验策略”可试用新机制，仍可能退步。'}创新是策略机制变化；不声称世界首创，也不承诺每局更高分。\n\n本轮${all.length}个完整终局、20个新真实高分起点、${tests.tests}项回归。完整每局结果、退步、撤回候选、验收与性能见[升级报告](docs/V11_8_UPGRADE.md)。明确同策略提速：${speeds.join('、')||'没有模式通过门槛'}。深入原高速d5保留；其他模式不声称整体棋力增强。\n\n高分存档位于tests/fixtures/late-game-v118/，16份约17万分、4份约23万分。浏览器导入恢复棋盘/分数/步数；CLI才能严格恢复完整随机流。旧存档、存储键、撤销、自动玩兼容，导出名为2048-v11.8-。\n\n需要Node.js，无需npm install：\n\n\`\`\`sh\nnpm run build\nnpm test\n# Evidence.zip解压合并后，可完整回放全部逐步日志\nnpm run replay:v118\nCURRENT_HTML=tests/fixtures/v118-validation.html OUTPUT=docs/my-validation.json npm run benchmark:v118\nCURRENT_HTML=tests/fixtures/v118-validation.html OUTPUT=docs/my-latency.json npm run benchmark:v118:latency\n\`\`\`\n\n主包是完整运行与源码包；Evidence.zip保存本轮完整逐步原始日志，两包解压到同一父目录。不要同时运行多个CPU密集基准。冻结验证集不得继续调参后再称独立。V11_7_*及更早文档只属历史证据。本轮为V11_8_*。测试是Node/Linux与真实WASM Worker，Mac启动文件检查权限/语法，未宣称原生Mac浏览器实测。\n`);
 console.log(JSON.stringify({terminalGames:all.length,goalMet:gate.passed,candidate,tests:tests.tests,clearModeSpeedups:speeds}));
}
module.exports={clusteredInterval,danger};if(require.main===module)generate();

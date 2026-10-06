'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,'docs',f),'utf8'));
const l=read('LATENCY.json'),g=read('GAMES.json'),c=read('CLEANUP.json');
const partial=process.argv.includes('--partial');
if(!g.complete&&!partial)throw Error('Complete paired games or explicitly use --partial');
const allRows=g.rows;
if(!g.complete){const paired=[...new Set(allRows.map(r=>r.seed))].filter(seed=>['v10.4','v10.5'].every(v=>allRows.some(r=>r.seed===seed&&r.version===v)));g.rows=allRows.filter(r=>paired.includes(r.seed));}

const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
if(l.hashes.current!==sha('2048-ai.html')||g.hashes.current!==sha('2048-ai.html'))throw Error('Benchmark does not match current HTML');
const f=(n,d=2)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const percentile=(a,p)=>{a=a.slice().sort((a,b)=>a-b);let x=(a.length-1)*p,l=Math.floor(x);return a[l]+(a[Math.ceil(x)]-a[l])*(x-l);};
const summarize=v=>{const rows=g.rows.filter(r=>r.version===v),sum=k=>rows.reduce((s,r)=>s+r[k],0),scores=rows.map(r=>r.score);return{meanScore:sum('score')/rows.length,medianScore:percentile(scores,.5),p10Score:percentile(scores,.1),minScore:Math.min(...scores),meanTotal:sum('total')/rows.length,meanMoves:sum('moves')/rows.length,meanSearchMs:sum('searchMs')/sum('moves'),tiles:Object.fromEntries([8192,16384].map(t=>[t,rows.filter(r=>r.maxTile>=t).length]))};};
const old=summarize('v10.4'),now=summarize('v10.5'),la=l.summary['v10.4'],lb=l.summary['v10.5'];
const delta=(a,b)=>((b/a-1)*100).toFixed(1)+'%';
const seeds=[...new Set(g.rows.map(r=>r.seed))].sort((a,b)=>a-b);
const rows=seeds.map(seed=>{const a=g.rows.find(r=>r.seed===seed&&r.version==='v10.4'),b=g.rows.find(r=>r.seed===seed&&r.version==='v10.5');return `| ${seed} | ${a.score} | ${b.score} | ${a.total} | ${b.total} | ${a.maxTile} / ${b.maxTile} |`;}).join('\n');
const report=`# V10.5 验证报告

重点是极致模式的拥挤残局。以下均为本轮实测，旧版基线直接使用上传包的 V10.4 Mac Fixed HTML。完整原始记录在 GAMES.json 与 LATENCY.json。

## 相同局面的速度

环境：${l.platform} ${l.arch}，Node ${l.node}，4 个真实计算 Worker 与独立调度 Worker。202 个可达局面、每版 30 次预热、3 轮，共 ${la.samples} 对请求；A/B 顺序交替，同一时间只有一个请求在计算。不包含界面动画和自动节奏等待。

| 指标 | V10.4 | V10.5 | 变化 |
|---|---:|---:|---:|
| 平均决策 ms | ${f(la.meanMs)} | ${f(lb.meanMs)} | ${delta(la.meanMs,lb.meanMs)} |
| P50 ms | ${f(la.p50Ms)} | ${f(lb.p50Ms)} | ${delta(la.p50Ms,lb.p50Ms)} |
| P95 ms | ${f(la.p95Ms)} | ${f(lb.p95Ms)} | ${delta(la.p95Ms,lb.p95Ms)} |
| 平均端到端请求 ms | ${f(la.meanWallMs)} | ${f(lb.meanWallMs)} | ${delta(la.meanWallMs,lb.meanWallMs)} |
| 丢弃搜索节点 | ${f(la.discardedNodes,0)} | ${f(lb.discardedNodes,0)} | — |

>2 空格组平均：${f(l.open['v10.4'].meanMs)} → ${f(l.open['v10.5'].meanMs)} ms，基本持平。
<=2 空格组平均：${f(l.critical['v10.4'].meanMs)} → ${f(l.critical['v10.5'].meanMs)} ms；P95：${f(l.critical['v10.4'].p95Ms)} → ${f(l.critical['v10.5'].p95Ms)} ms。

逻辑节点吞吐：${f(la.nodesPerSecond/1e6)}M → ${f(lb.nodesPerSecond/1e6)}M nodes/s。新旧在残局采用不同主引擎，因此这个数字表示整套搜索的逻辑吞吐，不是每条指令的等价微基准。相同 d3/d4 下的核心评分、节点数、缓存命中仍有严格等价测试。

## 完整对局

${g.complete?'原定对照已完成。':`按用户要求提前停止后续测试。原计划每版 10 局；当前仅采用完整配对进行下表汇总。另有 ${allRows.length-g.rows.length} 局单边完成数据保存在 GAMES.json，不混入配对平均。未完成的对局不计结果。`}

${seeds.length} 个配对种子（${seeds[0]}–${seeds.at(-1)}），每版各 ${seeds.length} 局，总计 ${g.rows.length} 局。从两块初始方块开始，直到没有合法移动。出生为均匀空格、90% 的 2 和 10% 的 4。逐种子交替新旧顺序，整局串行执行。

“总量”是终局 16 格数字之和，包含初始两块；合并守恒，能继续合法走更多步就能生成更多数字总量。它不同于合并得分，也不同于搜索节点数。

| 指标 | V10.4 | V10.5 | 变化 |
|---|---:|---:|---:|
| 平均棋盘总量 | ${f(old.meanTotal,1)} | ${f(now.meanTotal,1)} | ${delta(old.meanTotal,now.meanTotal)} |
| 平均得分 | ${f(old.meanScore,1)} | ${f(now.meanScore,1)} | ${delta(old.meanScore,now.meanScore)} |
| 中位得分 | ${f(old.medianScore,1)} | ${f(now.medianScore,1)} | ${delta(old.medianScore,now.medianScore)} |
| P10 得分 | ${f(old.p10Score,1)} | ${f(now.p10Score,1)} | ${delta(old.p10Score,now.p10Score)} |
| 最低得分 | ${f(old.minScore,0)} | ${f(now.minScore,0)} | — |
| 平均步数 | ${f(old.meanMoves,1)} | ${f(now.meanMoves,1)} | ${delta(old.meanMoves,now.meanMoves)} |
| 整局按步加权平均搜索 ms | ${f(old.meanSearchMs)} | ${f(now.meanSearchMs)} | ${delta(old.meanSearchMs,now.meanSearchMs)} |
| 达到 8192 的局数 | ${old.tiles[8192]} / ${seeds.length} | ${now.tiles[8192]} / ${seeds.length} | — |
| 达到 16384 的局数 | ${old.tiles[16384]} / ${seeds.length} | ${now.tiles[16384]} / ${seeds.length} | — |

| Seed | 旧得分 | 新得分 | 旧总量 | 新总量 | 最大块 旧 / 新 |
|---:|---:|---:|---:|---:|---:|
${rows}

## 正确性与构建

- 73 项回归通过（12 组）：规则、单次合并、大数字回退、D4 变换、取消/缓存/导入、Safety/Survival/Verifier、主核字节同步、极致深度选择与 1/4 Worker 一致性。
- 扩展核心与独立 GCC C 实现：256 组 d3/d4/d5/d6 的 float32 评分、节点数、缓存命中精确相同。
- 原 d3/d4 搜索与归档旧核继续逐项等价；新 d5 实际进行了更深计算。
- 清理 ${c.removedCount} 个旧文件，共 ${f(c.removedBytes,0)} 字节，46 份 Markdown 的结论合并进当前文档。运行源码和被测试引用的旧样本保留。
- Mac 启停脚本保留 UTF-8 文件名和可执行权限；本轮没有 macOS 实机或 Safari/Chrome 点击测试，不能把 Node Worker 验证写成浏览器实机验收。

## 结论边界

这是开发样本。速度结论来自同机、同局面交替测试；完整对局走出的路径不同，不能用它替代固定局面测速。旧版时间预算路径会因调度而改变完成深度，同 seed 不保证每次重跑得到相同分数。样本不证明每局更高、每步更快或所有设备均不下降；也尚未完成历史协议建议的 1000+ seed 统计验证。

仅极致拥挤残局的主搜索策略发生改变，轻快与深入沿用原策略。32768+ 兼容路径及旧评价器、近似 TT 的继承限制仍在；本轮没有训练新神经网络。

## 复现

\`\`\`sh
npm run build
npm test
npm run benchmark:latency
npm run benchmark:games
node tools/report.cjs --partial
\`\`\`

不要同时跑其他 CPU 密集任务。另跑独立种子可使用 \`node tools/benchmark.cjs games 20 101\`；先保存原 JSON，以免覆盖。
`;
fs.writeFileSync(path.join(root,'docs/VALIDATION.md'),report);
console.log('Generated docs/VALIDATION.md from complete paired data.');

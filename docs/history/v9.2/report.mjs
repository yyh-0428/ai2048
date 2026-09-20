import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8').then(JSON.parse);
const final=await read('docs/v9.2-final-comparisons.json');
const parts=await Promise.all(['a','b'].map(p=>read(`docs/final-games-${p}.json`)));
if(parts.some(p=>p.games.length!==20))throw new Error('Final paired games are not complete');
const initial=await read('docs/v9.2-initial-results.json');
const median=a=>{const b=a.slice().sort((x,y)=>x-y);return (b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2;};
const summary=games=>Object.fromEntries(['9.1','9.2'].map(version=>{const g=games.filter(x=>x.version===version),s=g.map(x=>x.score).sort((a,b)=>a-b);return [version,{games:g.length,completed:g.filter(x=>x.completed).length,mean:s.reduce((a,b)=>a+b,0)/s.length,median:median(s),p10:s[Math.floor(s.length*.1)],tiles:Object.fromEntries([2048,4096,8192,16384].map(t=>[t,g.filter(x=>x.maxTile>=t).length]))}];}));
final.games=parts.flatMap(p=>p.games).sort((a,b)=>a.seed-b.seed||a.version.localeCompare(b.version));
final.gameSummary=summary(final.games);final.gameEnvironment=parts.map((p,i)=>({part:i?'11–20':'1–10',affinity:i?'4–7':'0–3',...p.environment}));
final.notes.push('Final games: two disjoint logical CPU affinity groups, four CPUs each; sequential alternating A/B within each group. Shared system effects remain. Latency corpus used 9 available CPUs.','Initial candidate regression is retained separately, not mixed into final results.');
await writeFile(new URL('docs/v9.2-results.json',root),JSON.stringify(final,null,2)+'\n');
const f=n=>Number(n).toFixed(2),table=s=>Object.entries(s).map(([v,g])=>`| ${v} | ${g.completed}/${g.games} | ${f(g.mean)} | ${g.median} | ${g.p10} | ${g.tiles[2048]} | ${g.tiles[4096]} | ${g.tiles[8192]} | ${g.tiles[16384]} |`).join('\n');
const header='| 版本 | 完成/样本 | 均分 | 中位分 | P10 | ≥2048 | ≥4096 | ≥8192 | ≥16384 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|';
const latency=final.latency.map(x=>`| ${x.version} | ${x.mode==='fast'?'轻快':'极致'} | ${x.uiDelay} ms | ${f(x.wallMs.mean)} | ${f(x.wallMs.p50)} | ${f(x.wallMs.p95)} | ${f(x.depth.mean)} |`).join('\n');
const games=final.games.map(g=>`| ${g.seed} | ${g.version} | ${g.score} | ${g.maxTile} | ${g.moves} | ${f(g.searchMs.p50)} | ${f(g.searchMs.p95)} |`).join('\n');
const md=`# V9.2 最终验证记录

## 证据范围

最终构建 **20/20 组回归通过**；普通主 WASM 与原版字节完全一致。页面截图、浏览器点击、移动 Safari、Mac 启停脚本实机运行未验收：当前浏览器安全策略禁止访问本地游戏。DOM 模拟不等于真实浏览器验收。

测试使用 Node ${final.environment.node} / ${final.environment.arch} 的真实 worker_threads，加载生产源码，独立 WASM 实例与根 TT。局面对比使用 ${final.environment.cpus} 个可用逻辑 CPU。最终整局为两组互不重叠的逻辑 CPU 亲和性集合 0–3 与 4–7，每组 4 CPU，内部顺序交替 A/B；两组仍共享底层系统资源。

## 初始候选没有通过，已保留失败记录

第一次 20 组轻快对局出现明显退步，不能作为“更强”交付。完整数据保存在 v9.2-initial-results.json。该批曾中断，恢复时只保留完整配对，未完成配对重跑并保留原记录。

${header}
${table(summary(initial.games))}

复查修正了两点：同轮根方向派发时分别扣时间，会因毫秒取整获得不同配额；线程通信仍计入预算。最终版同轮共用 hardBudget，并逐轮累计 Worker 内搜索耗时的最长计算通道（含少核串行任务）。这个耗时由 performance.now() 测量，包含计算线程自己的 OS 调度延迟，不是纯 CPU 使用时间。它不包含页面或调度消息等待。

以下全部使用修正后的实现重新测试。初始与最终批次的 CPU 亲和性配置不同，只能分别比较各自批次内的 A/B，不能把跨批次绝对分数变化直接归因于这两个修正。

## 最终 20 组配对 smoke test

轻快模式；双方相同 seed 1–20，精确相同 spawn RNG；每个 seed 交替 A/B 顺序。每版 4 个计算 Worker，新版额外一个仅负责调度的 Worker。运行至终局；关闭声音/动画/人为落子等待，页面采用轻量 DOM 模拟。

${header}
${table(final.gameSummary)}

中位分取排序后中间两项平均；20 局的经验 P10 取排序后第 3 项。wall-clock 搜索即使同 seed 仍可能走出不同路径。这是开发级 smoke，不能宣称统计显著的整体棋力提高、逐局不退或保证 8192。正式棋力结论仍需更多 seeds 与用户设备复测。

风险计数口径：初始代码中旧版 riskChecked 包含失败尝试，新版只标记成功完成，故原始 JSON 的 risk 计数不能直接横比；界面已区分完整检查与超限。

## 固定深度语义

从可达轨迹抽取 ${final.fixedDepth.positions} 个固定局面，d4、每根分别清 TT；**${final.fixedDepth.identicalScoreAndNodes}/${final.fixedDepth.roots} 根方向的评分与节点数完全一致**。这确认普通 WASM 的计算语义保持一致，不等同于墙钟预算下的整局棋力一致。

## 页面消息延迟与速度

每行 60 个相同局面。0 ms 表示无额外消息等待；4 ms 表示每次 Worker→主线程交付人为延后 4 ms。新版根 Worker 与调度 Worker 的 MessagePort 不经过页面。比较端到端响应，而不是把新版排除初始化/传送的搜索耗时与旧版端到端混比。

| 版本 | 模式 | 模拟主线程等待 | 平均响应 ms | P50 ms | P95 ms | 平均完成深度 |
|---|---|---:|---:|---:|---:|---:|
${latency}

新版会把可用预算用于更多计算，**不保证所有模式、所有负载下每步响应都更快**。对同一棋盘完整结果的复用、保留健康线程池、固定节点绘制和减少强制布局，是本次减少等待与界面开销的措施。额外消息等待下的深度和响应变化应按表中实际数据解释。每组微基准在首个样本预热，新版下一次相同棋盘会命中一次缓存；其余为不同局面，不把小幅微基准差异当作核心吞吐突破。

## 每局结果

| Seed | 版本 | 得分 | 最大数字 | 步数 | 搜索 P50 ms | 搜索 P95 ms |
|---:|---|---:|---:|---:|---:|---:|
${games}

## 回归与复现

规则四向、一次合并、gain、500 个棋盘 D4 变换、1000 个棋盘合法移动计数、WASM 导出与内嵌字节、H6/H7 trap、节点上限、Verifier 的接受/拒绝/超时、部分轮次丢弃、共同预算与共同回退深度、大数字、终局优先、重复最大块对称性、旧结果作废、撤销、新游戏动画、暂停计时器、存档、真实 MessagePort、缓存与取消均有测试。

运行游戏不需要 Node。开发检查：

\x60\x60\x60sh
node tools/build.mjs
node --test tests/regression.cjs tests/coordinator.cjs
node tests/reproduce-v9.1.cjs
node tests/benchmark.cjs comparisons
node tests/benchmark.cjs games 20
# 中断后按完整配对恢复：
node tests/benchmark.cjs resume-games 20
\x60\x60\x60

原版完整 HTML、固定局面、失败候选数据、最终原始数据、测试和构建源码均随包提供。若重复测性能，避免让不相关重负载任务同时占用被测 CPU。
`;
await writeFile(new URL('docs/V9_2_BENCHMARK_RESULTS.md',root),md.replace(/\\x60/g,'`'));
console.log(JSON.stringify(final.gameSummary));

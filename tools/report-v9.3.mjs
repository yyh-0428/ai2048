import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const r=JSON.parse(await read('docs/v9.3-results.json'));
const log=await read('docs/v9.3-regression.log');
const passed=Number(log.match(/(?:# |ℹ )pass (\d+)/)?.[1]),failed=Number(log.match(/(?:# |ℹ )fail (\d+)/)?.[1]);
if(!passed||failed!==0)throw new Error('A complete passing npm test log is required');
if(r.fixed?.length!==2||r.fixed.some(x=>x.equal!==x.total))throw new Error('Both fixed-depth equivalence gates must pass');
if(r.latency?.length!==3)throw new Error('All three latency modes are required');
if(!r.games?.length||r.games.length%2)throw new Error('Complete game pairs are required');
const seeds=new Set(r.games.map(x=>x.seed));
for(const seed of seeds)if(r.games.filter(g=>g.seed===seed).length!==2||new Set(r.games.filter(g=>g.seed===seed).map(g=>g.version)).size!==2)throw new Error('Incomplete seed pair');
const f=n=>Number(n).toFixed(3),pct=n=>(100*n).toFixed(2)+'%';
const versions=['9.2','9.3'];
const med=a=>{const b=a.slice().sort((a,b)=>a-b);return (b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2;};
const summary=versions.map(v=>{const g=r.games.filter(g=>g.version===v);return `| ${v} | ${g.filter(x=>x.completed).length}/${g.length} | ${f(g.reduce((s,x)=>s+x.score,0)/g.length)} | ${med(g.map(x=>x.score))} | ${[2048,4096,8192,16384].map(t=>g.filter(x=>x.maxTile>=t).length).join(' | ')} |`;}).join('\n');
const normal=r.fixed[0],js=r.fixed[1];
const md=`# V9.3 验证报告

## 结论与边界

本次升级加速 JavaScript 大数字/无 WASM 兼容引擎。${passed}/${passed} 组回归通过；固定深度共 ${r.fixed.reduce((s,x)=>s+x.total,0)} 次配对中，分数与逻辑节点数全部严格一致。JS 兼容基准平均耗时降低 **${pct(1-js.versions['9.3'].ms.mean/js.versions['9.2'].ms.mean)}**，逻辑吞吐为原来的 **${f(js.meanSpeedup)} 倍**。

普通 WASM 和 Survival WASM 保持原始字节，搜索策略不变。普通固定深度平均耗时变化为 ${pct(normal.versions['9.3'].ms.mean/normal.versions['9.2'].ms.mean-1)}；整步平均响应差异见下表。小幅计时差异不能被描述为普通路径一定加速或退化，也不能承诺所有机器恒定性能。

运行环境：${r.environment.node} / ${r.environment.platform} / ${r.environment.arch}，${r.environment.cpus} 个可用逻辑 CPU。计算使用真实 worker_threads，A/B 顺序交替；计时实验依次运行，没有并发启动其他测试或性能进程。不是 Mac/Safari/Chrome 实机验收。

## 固定深度配对

原版局面集 ${normal.positions} 个来自既有可达轨迹。普通路径 d4；兼容路径将每个棋盘中的一个最大块改为至少 32768 后使用 d3，因此兼容组是构造的压力局面，不能说都是自然达到的 32768 局面。每类 ${normal.uniqueRoots} 个合法根方向，32 个预热请求，每类三轮；每轮按局面交替执行版本。每个请求使用完整目标深度和充足预算。

| 引擎 | 版本 | 次数 | 平均 ms | P50 ms | P95 ms | 逻辑 nodes/s |
|---|---|---:|---:|---:|---:|---:|
${r.fixed.flatMap(row=>versions.map(v=>`| ${row.engine} | ${v} | ${row.total} | ${f(row.versions[v].ms.mean)} | ${f(row.versions[v].ms.p50)} | ${f(row.versions[v].ms.p95)} | ${Math.round(row.versions[v].nodesPerSecond)} |`)).join('\n')}

普通路径严格一致 ${normal.equal}/${normal.total}；兼容路径严格一致 ${js.equal}/${js.total}。JS 叶缓存命中 ${js.versions['9.3'].hits} 次、未命中 ${js.versions['9.3'].misses} 次，命中率 ${pct(js.versions['9.3'].hits/(js.versions['9.3'].hits+js.versions['9.3'].misses))}。旧搜索 TT 没有导出命中率，此处不伪造该数据。nodes/s 是保留了缓存命中计数的逻辑吞吐。

## 整步端到端延迟

每模式 60 个普通棋盘，6 个预热请求、3 轮，每版本 180 次。每版本 4 个计算 Worker 和 1 个调度 Worker；计时从提交棋盘到收到结果，包含消息传递。各版客户端虽同时存在，请求始终顺序运行。所有界面、轮次、风险、Verifier 与深度上限沿用 V9.2。

| 模式 | 版本 | 平均响应 ms | P50 ms | P95 ms | 平均完成深度 | 平均丢弃节点 |
|---|---|---:|---:|---:|---:|---:|
${r.latency.flatMap(row=>versions.map(v=>{const d=row.versions[v];return `| ${row.mode} | ${v} | ${f(d.wall.mean)} | ${f(d.wall.p50)} | ${f(d.wall.p95)} | ${f(d.depth.mean)} | ${Math.round(d.discarded.mean)} |`;})).join('\n')}

本组验证普通路径没有出现明显的响应回退信号，但没有通过置信区间证明绝对不退。时间预算依赖调度，深度、丢弃工作与方向可能受毫秒边界影响。兼容引擎的同深度加速不能直接换算为预算耗尽时整步等待缩短，因为剩余时间可以用于继续加深。

## 完整对局 smoke test

轻快模式、seed 1–${seeds.size}，每个 seed 交替 A/B 顺序。使用相同的伪随机生成器，但走棋分歧会改变出生位置对应的空格集合；同 seed 不保证同分。达到 32768 的对局会标记为停止，不计作终局完成。

| 版本 | 终局完成/样本 | 均分 | 中位分 | ≥2048 | ≥4096 | ≥8192 | ≥16384 |
|---|---:|---:|---:|---:|---:|---:|---:|
${summary}

这些是小样本功能与对局冒烟验证，不是统计显著的棋力证明，更不能保证每一局质量不下降。强度提升需要更多随机种子与用户设备实测。两版普通主核相同，本组分数差异不能归因于对普通棋力的算法升级。

| Seed | 版本 | 得分 | 最大块 | 步数 | 完成 |
|---:|---|---:|---:|---:|---|
${r.games.map(g=>`| ${g.seed} | ${g.version} | ${g.score} | ${g.maxTile} | ${g.moves} | ${g.completed?'是':'否，达到边界'} |`).join('\n')}

## 回归覆盖

- 原有 20 组规则、WASM、Survival、Verifier、轮次预算、取消、存档、后台动画与 DOM 状态测试。
- 新增完整叶键/缓存驱逐/跨配置复用/高 rank 样本；共 18000 个随机叶棋盘，并回访较早棋盘。
- 出生遍历的正常返回与嵌套超时异常都恢复输入棋盘。
- 三种模式、d1–d5、多个压力棋盘，真实 Worker 的新旧评分与节点数相同。
- 两个 WASM 内嵌模块和普通配置字节核对。

DOM 测试不替代浏览器测试。当前环境缺少浏览器可执行文件及 macOS，未验收真实排版、Safari、浏览器后台限速或 Mac 脚本执行。启动脚本保持原样。

## 复现

\`\`\`sh
npm run build
npm test > docs/v9.3-regression.log 2>&1
npm run benchmark
npm run report
# 扩大对局样本（会覆盖本版 JSON 中 games 一节）：
node tests/benchmark-v9.3.cjs games 50
\`\`\`

可通过 BENCH_OUTPUT 指定其他 JSON 文件保存独立批次；报告生成器默认读取 docs/v9.3-results.json。原始记录保留 fixed、latency、games 及 regression 日志。性能结果不设置毫秒级强制 CI 断言，避免把机器噪声当成确定的正确性失败。
`;
await writeFile(new URL('docs/V9_3_BENCHMARK_RESULTS.md',root),md);
const files=['2048-ai.html','README.txt','READ_FIRST_V9_3.md','package.json','src/worker.js','src/rules.js','src/coordinator.js','src/ui.js','src/page.html','survival_v9_1.wasm','tests/fixtures/v9.2.html','tests/upgrades-v9.3.cjs','tests/benchmark-v9.3.cjs','tests/clients-v9.3.cjs','tools/build.mjs','tools/report-v9.3.mjs','docs/V9_3_RESEARCH.md','docs/V9_3_BENCHMARK_RESULTS.md','docs/v9.3-results.json'];
const hashes={};for(const file of files)hashes[file]=createHash('sha256').update(await readFile(new URL(file,root))).digest('hex');
await writeFile(new URL('docs/BUILD_SHA256_V9_3.json',root),JSON.stringify(hashes,null,2)+'\n');
await writeFile(new URL('docs/BUILD_SHA256.json',root),JSON.stringify(hashes,null,2)+'\n');
console.log('Wrote V9_3_BENCHMARK_RESULTS.md and BUILD_SHA256_V9_3.json');

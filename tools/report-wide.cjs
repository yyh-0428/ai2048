const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),r=JSON.parse(fs.readFileSync(root+'/docs/WIDE_BENCHMARK.json'));
if(r.htmlSha256!==crypto.createHash('sha256').update(fs.readFileSync(root+'/2048-ai.html')).digest('hex'))throw Error('Benchmark HTML mismatch');
const avg=(a,k)=>a.reduce((s,x)=>s+x[k],0)/a.length;
const groups=[['32768（满足证书）',r.decisions.filter(x=>x.index<3)],['65536 / 2^20 / 2^31',r.decisions.filter(x=>x.index>=3)],['全部局面',r.decisions]];
const table=groups.map(([name,a])=>`| ${name} | ${a.length} | ${avg(a,'oldMs').toFixed(2)} | ${avg(a,'newMs').toFixed(2)} | ${(100*(1-avg(a,'newMs')/avg(a,'oldMs'))).toFixed(1)}% | ${avg(a,'oldDepth').toFixed(1)} / ${avg(a,'newDepth').toFixed(1)} |`).join('\n');
fs.writeFileSync(root+'/docs/V10_6_UPGRADE.md',`# V10.6 大数字速度升级

## 为什么后期变慢

V10.5 发现 32768 就拒绝进入 4-bit 高速核心，切到 JavaScript 并逐轮加深，极致最多尝试 d6、兼容预算 480ms。32768 本身的 rank 15 其实可以无损表示，危险发生在两块 32768 合并成 65536 时。

## 本轮改动

- 给主价值核心增加严格入口证书：所有数字都是 0 或合法 2 的幂、最大 32768，且 **棋盘总量 + 4×6 < 65536**。每次出生最多增加 4，合并不增加总量，因此整个最多六周期搜索内不可能出现无法表示的 65536。没有缩小、投影或截断真实数字。
- 满足证书的大数字极致局面直接执行高速 WASM d6，所有合法方向统一完成后比较。普通极致 d4/d5 和原有风险门槛保留。
- 旧兼容 WASM 与 Survival 的 rank 限制不放宽；32768 的风险复核仍走原来的有证书入口投影，实际覆盖仍需原数值棋盘复核。
- 65536+ 或不满足总量界的局面继续 JS。JS 的 TT 查询和回写复用同一对局部保存的哈希键，省掉第二遍 16 格哈希和键数组分配；评分、节点、叶缓存命中不变。
- 移动输出池与出生数组池的实验未形成稳定提速，已撤回。

## 相同局面交替 A/B

基线为 V10.5；Linux / Node ${r.node}，真实 4 计算 Worker + 协调器。12 个输入棋盘覆盖 32768、65536、2^20、2^31，3 轮共 36 对请求，串行交替新旧，排除动画等待。

| 数值范围 | 配对次数 | 旧平均 ms | 新平均 ms | 平均耗时下降 | 完成深度 旧 / 新 |
|---|---:|---:|---:|---:|---:|
${table}

全部组 P95：${r.summary.decisions.oldP95Ms.toFixed(2)} → ${r.summary.decisions.newP95Ms.toFixed(2)} ms。不同数值阶段收益不相同；65536+ 仍是兼容路径，不能把 32768 的加速比例套用到所有更大数字。

另外完成 120 次固定 d5 的 JS 对照：评分、节点、叶缓存命中/未命中逐项相同；平均 ${r.summary.fixed.oldMeanMs.toFixed(2)} → ${r.summary.fixed.newMeanMs.toFixed(2)} ms，微小差异可能是计时噪声。原始数据见 WIDE_BENCHMARK.json。

## 验证与边界

75 项完整回归通过；最终 d6 路由另通过 10 项核心/路由专项检查。覆盖 32768 安全入口、接近总量界、32768+32768 与 65536 拒绝、普通路径、真实 MessagePort、完整评分、异步状态、JS 数值边界以及超时后棋盘恢复。

满足证书的 32768 局面由 JS 评价器切到高速评价器，不能声称走棋与旧版完全相同，也未以完整大样本对局证明长期得分上升。固定 d6 与旧 JS d6 的深度标签不意味着两种评价器语义相同。短程运行检查记录在 WIDE_SMOKE.json，仅验证连续合法运行，不作为胜率证明。

未做 macOS/Safari 实机测速。遇到 65536+、总量接近边界或设备限制仍可能较慢；宁可安全回退，不允许溢出饱和。

## 复现

\`\`\`sh
npm run build
npm test
npm run benchmark:wide
node tools/smoke-wide.cjs
npm run report
\`\`\`

运行基准时不要同时执行其他 CPU 密集任务。V10.5 的测试和历史文档保留供追溯，不作为 V10.6 新数据。
`);
console.log(table);

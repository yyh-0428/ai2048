# V8 决策日志：哪些方向试过、为什么保留或撤回

目的：防止以后再次走同样的弯路，却不知道过去为什么放弃。

## 2026-09-19 — 不把“更长自动节奏”解释成更长思考

**状态：永久规则**

发现 UI “自动节奏”只是走棋间隔。

结论：后续所有性能/棋力讨论必须直接引用真实 search budget/depth/nodes，而不是 UI delay。

---

## 2026-09-19 — 先上 N-tuple 的优先级下调

**状态：延期，不是放弃**

最初考虑立即用 N-tuple/TD value 替换人工 heuristic。

后来确认 V7.2 本身存在：

- TT history dependence；
- D4 sampling bias；
- duplicate-max evaluator bias；
- evaluator phase discontinuity；
- horizon cliff。

如果直接训练 learned value，模型可能只是在补偿底层错误，难以解释提升来源。

结论：先修 correctness/search semantics，再加 learned residual。

---

## 2026-09-19 — “空格 <= 2 就固定 H6 Survival”撤回

**状态：撤回**

原因：某些 2 空格棋盘一次合并会打开大量空间，Survival 树迅速膨胀；仅看空格数触发太粗糙。

当前 Preview 使用更保守危险条件，并设置 node cap。

未来推荐用：

- mobility；
- spawn robustness；
- forced-move probability；
- risk profile；

代替单一 empties threshold。

---

## 2026-09-19 — “Survival 高 2% 就直接覆盖”撤回

**状态：撤回**

固定 seed 出现轻微退化。

原因：短期 survival 并不等价于长期结构价值。

替代方案：Survival 只做 sentinel，冲突时必须由更深 Expectimax Verifier 确认。

---

## 2026-09-19 — 全关 probability cutoff 撤回

**状态：撤回**

普通中后盘节点/耗时约增加 1.8x；两空格残局可到约 2.5x 以上；动作变化比例有限。

替代方案：

- 普通 value 搜索继续允许 probability approximation；
- death-risk 单独 exact / bounded。

---

## 2026-09-19 — 浅层只保留 Top-2 深搜撤回

**状态：禁止，除非未来有严格 bound**

已找到正常可达棋盘：d3 排第 4 的动作到 d4 变第 1，且 d5/d6 继续第 1。

替代方案：interval/bound-based candidate elimination。

---

## 2026-09-19 — 巨大 TT 并非越大越快

**状态：经验规则**

Survival 原型微基准中，TT 从 2^16 往 2^20 增大后，由于 cache locality 下降，实际速度反而显著变慢。

结论：优先小型、高命中、set-associative TT，而不是盲目扩大容量。

---

## 2026-09-19 — 完整重写主 WASM 暂不发布

**状态：撤回生产，保留研究方向**

重写版本修了更多语义问题，但同深度整局测试约慢 4 倍。

用户目标明确要求：

- 分数不能下降；
- 算法要更强；
- 同时要优化速度。

因此本次 V8 Preview 改成 Hybrid：保留 V7 快速主核 + 外围正确性修复 + Survival/Verifier。

未来若再重写，必须从 row-table / cache locality / bitboard 性能出发，先追平 V7 节点吞吐。

---

## 2026-09-19 — 根 D4 canonicalization 保留

**状态：保留**

原因：只在每次 AI 决策入口做一次 8 对称规范化，成本极小，却可让整棵搜索都在统一坐标系中运行，显著降低固定 sampling 的方向偏置。

未来如果主核内部 sampling 已严格 D4-equivariant，仍可保留根 canonicalization 作为 TT/cache 归一化手段。

---

## 2026-09-19 — Verifier Gate 保留

**状态：保留，继续 benchmark**

早期固定 seed 小样本中：

- 直接 Survival override 有反例；
- 加 d+1 Verifier 后反例被挡掉，同时保留真实 horizon 修正。

目前这是 V8 Preview 最重要的风险控制机制之一。

---

## 未来决策记录格式

每次重要方向变更都追加：

```text
日期
方案
状态：保留 / 撤回 / 实验中
为什么尝试
具体数据
为什么决定
以后什么条件下可以重新考虑
```

不要只写“感觉不好”。

---

## V9 — 撤回：Fast 在 `empties <= 7` 时强制 d4

**为什么尝试：** 81 个可达中盘状态上，与更深同语义参考的最佳方向吻合率从约 63% 提高到 77.8%。

**为什么撤回：** 固定整局 seed A/B 出现回退：seed 1 约 78.9k -> 69.3k；seed 4 约 74.6k -> 71.4k。说明局面级“更像深搜”不是最终得分的充分条件。

**以后除非：** 至少大规模 fixed-seed 整局统计同时证明 4096/8192 达成率、P10 和平均分不退，否则不要重新加入。

## V9 — 撤回：全局恢复 V7 strong 的 cap7/exactPlies2

**为什么尝试：** 用户反馈 Strong 变弱，直觉上可能是 V8 把 Strong 的 sampling 参数降得太多。

**结果：** 同类局面测试中成本约从个位毫秒增加到数十毫秒，约 5x；对更深参考动作的一致性只小幅变化，没有与成本匹配的收益。

**结论：** Strong 的主要问题是没有稳定完成 d4，而不是 sampleCap 不够。V9 选择“直接 d4 + fast semantics”。

## V9 — 保留：稀有冲突才升级 Verifier 参数

普通搜索继续快速；只有 Survival 明确与 baseline 冲突时，对两个争议候选临时提高 sampleCap/exactPlies、降低 probCut。这把昂贵计算集中在真正可能改变生死的步骤。

## V9.1 — 2026-09-19

### Benchmark harness 纠错

发现部分 V9 fixed-seed harness 在同一个 WASM TT 中顺序搜索四个根方向，与浏览器独立 Worker 语义不一致。旧分数降级为历史参考，后续正式整局测试必须根方向 TT 隔离。

### 拒绝：aggressive refinement admission gate

目标是减少大量 aborted next-depth rounds。虽然废弃轮次数大降，但真实 4-Worker seed 测试出现 4096 -> 1024 的严重退步，因此拒绝。

### 拒绝：Fast critical H7 常开

<=1 空格把 H6 改 H7，增加大量节点，两个固定 seed 没有提升最终 tile；拒绝。

### 拒绝：Fast late Top-2 verifier 常驻

后盘局面级逻辑看起来合理，但整局延迟增幅明显而收益很小；拒绝。

### 接受：阶段深度封顶 + 后盘预算搬移

多组可达状态显示 empties>=6 时 d5/d6 已高度稳定。采用保守 stage cap，只限制 Strong/Extreme 的低价值超深 refinement；Fast 主线保持不变，仅后盘增预算。

### 接受：Extreme H7 abort -> H6 fallback

这是失败恢复，不是新主目标。H7 超 node cap 时 V9 原行为会完全失去 risk signal；H6 fallback 能恢复一个完整可验证结果，并继续受 Verifier 约束。

## V9.2 — 2026-09-19

### 保留：页面与 AI 轮次调度分离

根 Worker 经 MessagePort 与调度 Worker 通信，主线程每步仅接收完整结果。保持原 WASM 字节、普通模式预算、阶段上限和风险覆盖护栏。202 个固定局面、739 个独立根在 d4 的分值与节点数全部一致。模拟主线程消息延迟时，新版保留更多完成深度；不能由此把总体达成率说成已验证提高。

### 保留：同一步统一大数字评分路径

只要任一根动作进入 32768，所有候选都使用 JS，避免混合不同比例的评价值。JS 是独立的兼容路径：共同 d2 起步、在原有 48/180/480 ms 兼容预算内渐进加深、必要时全部回到 d1。普通 WASM 模式的 d3/d4/d5 质量底线不受影响。

### 保留：修复取消语义，复用健康 Worker

棋盘 revision 与请求 id 同时验证。暂停、新游戏、撤销、模式切换作废所有旧结果与自动/动画回调。健康 Worker 不反复冷启动；当前已在执行的搜索允许在预算内结束，结果丢弃。异常或页面离开时终止线程。

### 未做：重写黑盒主核、激进剪枝或夸大胜率

旧核心的 evaluator 阶段跳变和内部对称性缺陷仍是后续研究问题。局部优化和 20-seed smoke 不能代替正式的大样本棋力评估。

### 最终预算修正与实测取舍

初始候选 20 组轻快 >=4096 只有 14/20（同批原版 20/20），未接受为棋力升级。修正为同轮统一预算与 Worker 搜索耗时计账后，在重新配对的 20 seeds 中，>=4096 为 18/20（同批原版 15/20），>=8192 为 4/20（同批原版 2/20）；均分提高、中位分略降。小样本不足以给出正式统计结论。最终固定局面上轻快平均响应从 8.14 ms 增至 9.75 ms，极致从 49.23 ms 降至 46.51 ms；不宣称全面提速。保留全部失败记录，并在 README 明示取舍。

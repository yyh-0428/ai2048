# READ FIRST — 2048 AI V8 开发护栏

> **任何继续修改 V8 的人或 AI，请先读完本文件，再读 `docs/VALIDATED_FINDINGS.md` 与 `docs/BENCHMARK_PROTOCOL.md`。**
>
> 本文件的目的不是描述“理想架构”，而是防止已经踩过的坑被再次引入。

## 1. 项目当前定位

V8.0 Preview 是 **Hybrid Safety** 版本：

- 主搜索仍使用 V7.2 已验证速度很强的 WASM bitboard Expectimax。
- V8 在外围修复/缓解已经确认的问题：
  - 每个 exact 深度轮隔离主 WASM TT，避免跨层搜索历史污染。
  - 根棋盘做 D4（旋转/镜像）规范化，减少固定采样造成的方向偏置。
  - 危险残局运行独立、可维护的 `survival_v8.c` / `survival_v8.wasm`。
  - Survival 只做“风险哨兵”；发生冲突后必须由更深 Expectimax Verifier 复核，不能直接夺权。
- **主 V7 WASM 目前仍是黑盒二进制。** 已知它内部还保留旧 evaluator 与旧近似语义，因此 V8.0 Preview 不是最终架构。

## 2. 七条硬规则

### Rule A — 不允许为了“架构更漂亮”让核心明显变慢

我们已经试过重新写完整主 WASM 搜索核。正确性更干净，但同深度整局测试约慢 4 倍，因此撤回。

**以后任何主核重写必须先证明：**

1. 同深度/同语义吞吐接近或超过 V7.2；
2. 固定 seed 棋力不退；
3. 再考虑替换生产主核。

不能先把慢版本发布，再期待以后优化回来。

### Rule B — “自动节奏”不是思考时间

UI 下方的“自动节奏”只控制走完一步后多久开始下一步。

- 它不改变搜索 budget。
- 它不应该被用于比较 AI 棋力。
- 极速模式还会节流统计 UI，因此屏幕上看到的节点数可能是前一个难局的残留值。

任何 benchmark 都必须直接控制搜索参数/节点预算，而不是拖动“自动节奏”。

### Rule C — 不允许跨 refinement round 复用近似 TT 值

生产 V7.2 WASM 已经实测：

- `先搜浅层 -> 不清 TT -> 搜深层`
- 与 `清 TT -> fresh 深层`

可能得到不同 score，少量正常可达局面甚至会改变最佳动作。

V8.0 Preview 的处理是：**每次 exact 深度任务前清 TT generation。**

未来如果重写主核，应区分：

- Persistent Exact TT：只有严格 exact、语义一致的值才能跨轮复用。
- Round-local Approx TT：sampling / probability cutoff / partial bound 的值只能当前 round 使用。
- Safety TT：`(board, horizon) -> survival` 可独立长期缓存。

### Rule D — 不允许破坏 D4 对称性

2048 在旋转/镜像后是同一个问题。基础不变量：

> 原棋盘的最佳方向经过同样的几何变换后，应等于变换棋盘的最佳方向（允许真正的 score 平局）。

已经确认 V7.2 有两类对称性问题：

1. 多个相同最大块时，只看扫描到的第一个最大块，会造成巨大 evaluator 偏差。
2. chance sampling 依赖绝对格子编号，旋转后会采到不同出生格。

V8 Preview 已在根部做 D4 canonicalization 缓解第 2 类问题；第 1 类仍在旧主 WASM 内部，未来重写 evaluator 时必须修掉。

### Rule E — 不允许用 hard phase switch 让 evaluator 尺度跳变

V7.2 evaluator 在 `empties <= 4` 与 `empties <= 2` 时硬切权重。

实测：

- 5 空格棋盘随机补一个 `2` 变成 4 空格时，2500/2500 次 evaluator **反而上涨**，中位数约 +1816。
- 3 -> 2 空格也出现大量同类反常。

未来 evaluator 必须连续变化，或使用平滑 stage blending。不要再用“跨一个空格阈值就整套权重跳变”的方案。

### Rule F — Survival 不能直接作为最终裁判

曾经试过：只要 H6 survival 高出约 2%，就直接覆盖主搜索动作。

结果出现固定 seed 小幅退化，说明“短期更能活”不等于“长期结构更好”。

当前正确原则：

1. Baseline Expectimax 先给动作。
2. Survival 只发现可疑 horizon trap。
3. 发生冲突时，对 baseline 与 survival candidate 做更深 Verifier。
4. **只有 Verifier 也支持新候选时才覆盖。**

### Rule G — 不允许只加深浅层 Top-2 候选，除非有严格 bound

实测正常可达棋盘中，存在：

- d3 排第 4 的动作，到了 d4 变成第 1；
- 并且 d5/d6 继续保持第 1。

所以不能因为浅层排名差就直接丢弃候选。

以后要淘汰候选，必须有：

- 严格 upper/lower bound，或
- 经过大量 benchmark 证明安全的机制。

## 3. 当前最重要的已知事实

请不要重新“猜一遍”，先看 `docs/VALIDATED_FINDINGS.md`。其中尤其重要的是：

- V7.2 轻快与深入在真正残局（空格 <= 2）经常从同一 base depth=5 开始；因此深入模式并不保证比轻快多看一层。
- 极致模式的 mandatory base depth 可以在完成最低深度时就超出标称 50ms，导致额外预算没有形成更聪明的 refinement。
- 关闭 probability cutoff 会让节点/耗时显著上涨，但动作变化比例不高；不要粗暴全关。
- horizon/depth 不稳定对动作的影响目前比单纯提高 sampleCap 更大。
- 主核的 `-1e15` terminal penalty 把小概率死亡放大约 10 个数量级；风险最好拆成独立通道，而不是继续塞在一个 scalar double 里。

## 4. V8 应该追求的最终形态

目标不是“V7.2 Extreme++”，而是：

**Coherent Risk-Bounded Anytime Expectimax**

即：

- 轻快 / 深入 / 极致使用同一个正确核心与同一语义；
- 更高模式只是继续 refinement，不是换一套 sample/probCut 人格；
- 引擎判断当前最大的“不确定性”来自 depth、sampling 还是 death-risk，然后把下一批计算花在那里；
- 普通 value 允许安全近似；death-risk 在危险局使用 exact / bounded 计算；
- 最终再加入 compact learned residual，而不是先用学习模型掩盖底层错误。

## 5. 改代码前的最短检查表

每次修改前回答：

- [ ] 这个改动是在修已验证问题，还是未经证实的猜测？
- [ ] 是否会改变 D4 对称性？
- [ ] 是否会让同一 board/depth 因搜索历史不同而变结果？
- [ ] 是否会引入新的 hard threshold / phase jump？
- [ ] 是否把浅层候选提前永久淘汰？
- [ ] 是否把“自动节奏”误当成思考时间？
- [ ] 是否用公平 benchmark 与当前基线比较？
- [ ] 是否同时记录棋力和速度，而不是只看其中一个？
- [ ] 如果变慢很多，是否有足够大的棋力收益证明值得？
- [ ] 是否能一键回退？

## 6. 改完后的最低验收

至少跑：

1. JavaScript 语法检查；
2. WASM 可实例化与导出检查；
3. D4 rotation/mirror invariance；
4. fresh search == prior-shallow-then-same-depth（对应该保持 exact 的路径）；
5. terminal / forced-move 边界测试；
6. 固定 seed A/B；
7. 同预算速度与棋力统计；
8. 危险残局 corpus；
9. 32768+ 路径不崩/不错误饱和。

详细流程见 `docs/REGRESSION_GUARDRAILS.md` 与 `docs/BENCHMARK_PROTOCOL.md`。

---

最后更新：2026-09-19  
适用版本：V8.0 Preview 及后续 V8.x

# V8 后续路线（按优先级）

## P0 — 建立可重复 benchmark harness

在继续大改算法前，先完成：

- native/headless engine runner；
- 固定 RNG seed；
- 1000+ seed A/B；
- disagreement corpus；
- score/tile/performance/残局 recovery 指标。

没有这个，后续“更强”仍然主要靠体感。

## P0 — 把旧主 WASM 逐步替换为可维护同源实现，但必须先追平速度

不要再次直接发布慢 4x 的新核。

建议顺序：

1. 先复刻旧 V7 bitboard row tables 与吞吐；
2. native 与 WASM 同源；
3. 输出和旧核在已知 board/depth 上逐项比对；
4. 再一次只修一个 correctness 问题；
5. 每一步都 benchmark。

## P0 — 修 evaluator 连续性

第一版新 evaluator 不需要“更聪明”，先要求：

- D4 对称；
- 多最大块处理正确；
- 5->4 / 3->2 没有尺度跳变；
- 输出范围受控；
- 与旧 evaluator 在普通中盘的排序尽量接近。

建议使用连续 danger 权重，而不是 hard `late/critical` switch。

## P1 — Coherent Anytime Scheduler

把三个模式正式统一成同一 refinement 流程：

```text
baseline
 -> depth refinement
 -> sampling refinement
 -> risk refinement
 -> verifier
```

下一批工作根据“当前最大决策不确定性 / 成本”选择。

避免 mandatory base depth 一开始就突破预算。

## P1 — 嵌套、确定性的 sampling

目标：

```text
S4 ⊂ S7 ⊂ S10 ⊂ exact
```

建议：root D4 canonicalization + board-hash permutation。

高模式只补新样本，不重算另一批位置。

## P1 — Risk channel 正式进入主搜索结果

从：

```text
scalar score = value - 1e15 * implicitDeath
```

转为：

```text
value
expectedGain
deathProbability
exactness
```

先保持 legacy-compatible final ordering，再逐步测试风险策略。

## P1 — Risk profile / Escape probability

在 H6/H7 Sentinel 稳定后，实验：

- H5/H6/H7 survival curve；
- horizon crossing detection；
- escape probability：危险状态在 H 步内恢复到 >=4 空格且 mobility 良好的概率。

注意：这些都先做 sentinel/certificate，不要直接作为最终裁判。

## P2 — Interval / bounded chance search

研究：

- value lower/upper bounds；
- death-risk lower/upper bounds；
- 未展开概率质量的误差上界；
- bound-based candidate elimination；
- Star1/Star2 思想在 2048 上的适配。

目标：减少“为了证明两个方向谁更好而把所有 branch 全算完”的浪费。

## P2 — 动态 Worker 利用率

4 合法方向时维持 root split。

残局：

- 2 candidates -> 2+2 worker；
- 按 chance branch 粗粒度拆；
- verifier/safety 可占空闲 Worker。

暂时不要先上复杂 shared global TT。

## P2 — 32768+ extended bitboard

设计 low4 + sparse high bits，保留常规局面 row-table 快路径。

目标：出现 32768 后仍然留在 WASM，而不是整盘回退 JS。

## P3 — Compact Learned Residual

Correctness core 稳定后再做。

建议：

```text
V = handcrafted_fixed + alpha * learned_residual
```

- 先 `alpha=0`；
- 再 0.25 / 0.5 / 1.0 A/B；
- 优先 afterstate value；
- 模型控制在几 MB；
- 可考虑 compact 4-tuples / hashed tuples / multistage smooth blend。

不要一开始塞几十/几百 MB N-tuple tables，破坏当前“单 HTML、零安装、本地运行”的产品特性。

## P3 — SharedArrayBuffer / WASM threads

本地 server 已有 COOP/COEP 基础。

只有在算法和单核搜索稳定后再评估：

- immutable table sharing；
- shared work queue；
- small shared L2 TT。

不要把共享 TT 复杂度放在算法正确性之前。

## 发布前 Gate

任何 V8.x 候选包只有同时满足才升级主版本：

- 1000+ 固定 seed 无明显棋力退化；
- 4096 达成率至少不退；
- 8192 达成率有提升信号；
- P10 / median 不明显下降；
- danger recovery / late survival 改善；
- P95 latency 可接受；
- 无 D4/TT/terminal correctness regression；
- 文件内文档同步更新。

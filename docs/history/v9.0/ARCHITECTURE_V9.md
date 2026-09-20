# V9 架构说明 — Adaptive Quality Hybrid

## 一次决策

```text
Board
  |
  v
D4 root canonicalization
  |
  v
Mode quality floor
  |-- Fast: d3 / d4 / d5 adaptive
  |-- Strong: d4, critical d5
  `-- Extreme: d4, critical d5 (skip useless d3)
  |
  v
V7.2 fast WASM Expectimax
  |
  +--> TT cleared for every refinement round
  |
  v
If time remains -> next full depth round
  |
  v
Spawn Fragility Probe on baseline move
  |
  +-- stable --> return baseline
  |
  `-- fragile --> exact Survival H6/H7
                    |
                    +-- agrees / gap too small --> baseline
                    |
                    `-- conflicts --> high-quality 2-candidate Verifier
                                         |
                                         +-- confirms --> override
                                         `-- rejects  --> baseline
```

## 为什么 Fast / Strong / Extreme 不再完全同起点

V8 试图让三档共享同一套 fast 搜索语义，这部分继续保留；问题在于连起始深度也统一后，短预算 strong 有时只能交付 d3。

V9 把“语义一致”与“质量底线一致”拆开：

- 主 evaluator / sampling / probCut 的普通路径仍尽量一致；
- 不同模式允许拥有不同最小完整 horizon；
- 额外预算仍通过完整下一深度进行 refinement。

## Fast

目标：保持 V8 的速度和随机整局风格，不全局加重搜索。

正常配置仍是 cap4 / exactPlies1；主要增强来自更广但便宜的 Spawn Fragility 检测，以及冲突时的高质量 Verifier。

## Strong

V9 的主要修复点。直接从 d4 起步，避免 d3 花掉短预算后无法完成 d4。

不要再恢复旧 V7 strong 的全局 cap7/exactPlies2；测试表明成本增幅远大于决策收益。

## Extreme

用户实测当前最强。V9 采取保守优化：只删除隔离 TT 下确定不能复用的 d3；保留 d4 作为有结果的安全 floor，再让更多时间进入 d5。

这样比 mandatory d5 更能避免极端复杂状态突然阻塞很久。

## Spawn Fragility Probe

它不是搜索，只做一层真实随机出生枚举。针对 baseline move，统计：

- immediate death probability；
- forced move probability；
- tight mobility probability（合法方向 <=2）；
- 最坏出生后的合法方向数。

计算规模很小，却比单看 `empties<=2` 更准确。

## High-quality Verifier

只有 Survival 与 baseline 冲突且 gap 达阈值时运行。它仅决定“是否允许覆盖 baseline”，不用于普通 Top-2 pruning。

Verifier 临时提高 chance coverage，因此即使 Fast 模式也能在真正关键的少数残局花更多算力，而不拖慢整盘。

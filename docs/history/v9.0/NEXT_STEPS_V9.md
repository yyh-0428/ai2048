# V9 后续路线

## P0 — 先跑真实浏览器大样本

当前构建环境不能访问 localhost，正式评价 V9 需要在用户机器实际跑：

- 每个模式至少几十个固定 seed；
- 记录 2048 / 4096 / 8192 达成率；
- 平均分、中位数、P10；
- ms/move P50/P95；
- Survival 触发次数、Verifier 覆盖次数；
- 覆盖前后的长期结果。

尤其比较 V8 Extreme vs V9 Extreme，以及 V8 Strong vs V9 Strong。

## P1 — 做真正的 Difficulty Certificate

目前 Spawn Fragility 只看 1-step mobility。下一步可增加：

- score margin；
- dN 与 dN+1 的最佳方向是否翻转；
- Survival H6/H7 排名是否交叉；
- verifier 置信度。

目标不是更多算，而是决定“下一批节点最值得算什么”。

## P2 — 动态双候选并行

当只剩两个合法根动作时，目前仍只有两个 Worker 做主搜索。可把每个候选的 chance branches 粗粒度拆成两份，实现 2+2 Worker；必须先证明通信成本小于收益。

## P3 — 新主核性能追平后再替换 evaluator

旧 evaluator 的 hard phase jump 和重复最大块偏置仍在黑盒 WASM 内。不要再用慢 4x 的干净重写替换。

新主核必须先做到：

1. row-table / bitboard 吞吐接近或超过 V7.2；
2. native 与 WASM 同源；
3. D4 / TT / terminal regression 全通过；
4. fixed-seed 棋力不退。

之后才加入连续 evaluator、risk channel 和 learned residual。

## P4 — Learned Residual

最后才加入 compact N-tuple / TD afterstate residual。必须可开关、可 A/B、可回退；不允许用学习模型掩盖底层搜索错误。

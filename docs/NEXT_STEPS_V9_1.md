# V9.1 后续路线

## P0 — 用户机器真实 A/B

重点比较：

- V9.0 Extreme vs V9.1 Extreme 的平均 ms/步与 4096/8192 达成率；
- V9.0 Strong vs V9.1 Strong 的前中盘速度、后盘深度；
- Fast 是否仍保持轻快，同时 <=3 空格时死亡链减少。

统计至少记录：平均/中位分、P10、最大 tile、moves、P50/P95 ms、最终 depth 分布、risk 次数、H7->H6 fallback 次数、verified override 次数。

## P1 — 只优化 discarded work，不改变完成轮语义

V9.1 暂不使用 aggressive gate。下一步若继续做 admission，必须先收集大量 `(previous round cost, remaining budget, next round success)` 数据，再设计只过滤极低成功率区间的规则，并证明 fixed-seed 不退。

## P2 — Worker 空闲算力

危险残局通常只有 2 个根动作。可尝试让第 3 个 Worker 提前计算 H6 Survival，主搜索完成时直接复用；不得改变决策，只隐藏风险层延迟。先测 CPU contention。

## P3 — 同源新主核

继续优化可维护主核，使其吞吐追平 V7.2，再修 evaluator hard phase / duplicate-max asymmetry。性能未追平前禁止替换生产核。

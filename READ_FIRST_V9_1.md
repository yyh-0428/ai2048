# READ FIRST — 2048 AI V9.1 开发护栏

> 修改 V9.1 前先读本文件，再读 `docs/V9_1_BENCHMARK_RESULTS.md`、`docs/DECISION_LOG.md`、`docs/BENCHMARK_PROTOCOL.md`。

## 1. V9.1 的目标

V9.1 不是换主核，而是“算力重新分配”：保留 V7.2 高速 WASM Expectimax、V9 的 D4 根规范化、每轮 TT 隔离、Spawn Fragility、Survival + Verifier；减少前中盘没有价值的超深 refinement，把少量预算搬到真正拥挤的后盘。

用户实测：Extreme 当前最强，自动节奏 0ms 综合体验最好；Fast / Strong 通常能到 2048，但继续冲 4096 / 8192 较困难。V9.1 的调整必须优先解释并改善这个现象，同时不能把平均速度明显拖慢。

## 2. 本版确定改动

### A. Strong / Extreme 阶段最高深度

仅限制“最高 refinement 深度”，不降低质量底线：

- empties >= 7：最高 d5；
- empties == 6：最高 d6；
- empties == 5：最高 d7；
- empties <= 4：不新增上限，沿用模式原 maxDepth。

依据：360 个可达局面中，空格 >=9 时 d5 与 d8 动作 100% 一致；空格 7–8 时 d5 与 d7 100% 一致；空格=6 时 d5 与 d7 99.2%；空格=5 时 d6 与 d7 99.2%。不要把这个规则继续向 empties<=4 粗暴推广。

### B. 后盘预算增强

Fast 不全局加深，只在拥挤阶段增加少量时间：

- empties >= 4：6ms；
- empties 2–3：8ms；
- empties <=1：10ms。

Strong：

- empties >=5：22ms；
- empties 3–4：28ms；
- empties <=2：32ms。

Extreme 保持 58ms，不动用户已经验证较好的手感。

### C. Extreme Survival H7 失败后回退 H6

V9 的 Extreme 使用 H7 / 300k node cap。已验证某些满盘危险状态 H7 需要约 595k 节点，因此会 abort；V9 会直接放弃本次风险保护。

V9.1 改为：H7 abort -> 同一局面重算 H6；H6 成功后仍需原来的 gap + Verifier 才能覆盖 baseline。Survival 仍然没有直接决策权。

## 3. 本轮被否掉的方向

- **全局 refinement admission gate**：能大幅减少 aborted rounds，但真实 4-Worker seed 测试中 Fast 从 4096 跌到 1024，拒绝。
- **Fast 在 <=1 空格常开 H7**：节点量明显增加，seed 2/3 没有提高最终 tile，拒绝。
- **Fast 后盘常驻 Top-2 extra verifier**：1500 步平均耗时从约 8.8ms/步增至约 13.9ms/步，得分几乎不变，拒绝。
- **Fast <=7 空格强制 d4**：V9 已否决，继续保持否决。

以后不要因为局部动作一致率漂亮就恢复这些规则。

## 4. Benchmark 重要纠错

旧 V9 文档中的部分 fixed-seed harness 在一个 WASM 实例中连续搜索多个根方向，没有在根方向之间清 TT；真实浏览器是每个根方向在独立 Worker / 独立 TT 中执行，而且 `wasmExact()` 每次先 `clear_tt()`。

因此旧 fixed-seed 分数只能视为历史实验，不能作为 V9.1 发布 Gate。

以后允许两类正式测试：

1. **确定性固定深度测试**：每个根方向独立清 TT，不依赖 wall-clock；
2. **真实调度测试**：4 个独立 Worker，复刻 base depth、hardBudget、round discard、Survival/Verifier。

禁止再次用“同一个 TT 顺序搜四个根方向”的整局 harness 声称棋力提升。

## 5. 不变的硬规则

- 自动节奏不是思考时间；0ms 只是取消走棋间隔。
- TT 近似值不得跨 refinement round 污染。
- Survival 只做哨兵，覆盖必须经 Verifier。
- 不为架构整洁接受显著性能回退。
- 不在浅层只保留 Top-2；早期 d3 曾出现第 4 名在 d4 变第一。
- 不全局关闭 probCut。
- 新主核未追平 V7.2 WASM 吞吐前，不替换生产主核。

最后更新：2026-09-19

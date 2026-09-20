# V9.1 Benchmark / 实测记录

## 1. 真实调度 harness 的发现

新增 Node `worker_threads` 版本 harness，使用 4 个独立 WASM Worker，复刻浏览器的：独立 TT、每轮 clear、base floor、wall hardBudget、完整轮才提交、Survival / Verifier。

重要观察：Fast 在一个 2500 步样本中出现上千次“下一深度启动但未全部完成”的 round；说明 V9 有明显 discarded work。不过尝试用预测 gate 阻止这些轮次后棋力严重下降，因此 V9.1 **没有**上线激进 gate。

时间预算模式受 OS 调度影响，固定 seed 也可能因毫秒边界走出不同路线；所以它适合测实际延迟/废弃率，不适合单次跑分就下棋力结论。

## 2. Stage-depth 稳定性

全部使用生产 V7.2 WASM、根方向独立 clear TT、相同 fast sampling 语义。

| 局面 | 浅层 vs 深参考 | 最佳动作一致率 |
|---|---|---:|
| empties >= 9 | d4 vs d8 | 99.2% |
| empties >= 9 | d5 vs d8 | 100% |
| empties 7–8 | d5 vs d7 | 100% |
| empties = 6 | d5 vs d7 | 99.2% |
| empties = 5 | d5 vs d7 | 90.8% |
| empties = 5 | d6 vs d7 | 99.2% |
| empties = 4 | d6 vs d8 | 98.3% |
| empties = 4 | d7 vs d8 | 99.2% |

每组约 120 个正常可达样本。结论：前中盘确实存在大量“继续加深但动作几乎不变”的浪费；到了 empties<=4 不再适合激进封顶。

## 3. 深度增长成本

100 个中盘样本：

- d3 -> d4 单方向最慢分支耗时倍率：median ~5.27x，P90 ~6.89x；
- d4 -> d5：median ~2.15x，P90 ~3.62x。

这解释了为什么 Fast 的下一层经常碰 hardBudget，以及为什么“只看还剩 1–2ms 就盲目启动 d5”会产生 discarded work。但 gate 必须非常谨慎，不能仅凭预测砍搜索。

## 4. 被否掉实验

### Fast critical H7

Fast 在 <=1 空格时把 H6 升到 H7（500k cap）后：seed 2 无提升，seed 3 轻微下降，节点/耗时明显增加。拒绝常开。

### Late Top-2 Verifier

Fast e<=5、分差<=1000 时额外只搜 Top-2：1500 步样本中得分几乎不变，但平均耗时约从 8.8ms/步增到 13.9ms/步。拒绝。

### Aggressive admission gate

虽然 aborted rounds 大幅下降，但某真实调度样本从 4096 路线退到 1024。拒绝。

## 5. H7 -> H6 fallback 的已知样本

满盘 horizon-trap：

```text
2     4    64     4
512  32   256     8
4    256  1024    4
2     2     4   2048
```

- H6：86,750 nodes，Left ≈ 92.58%，Right ≈ 98.12%，完整完成；
- H7：约 595,752 nodes 才能完整完成；V9 Extreme 的 300k cap 会 abort。

V9.1 在 H7 abort 后回退 H6，因此至少保留一个完整、可验证的风险信号，而不是直接关闭保护层。

# Benchmark 规范

## 目标

我们不是要证明“某一局看起来更聪明”，而是回答：

1. V8 是否在统计上不退化？
2. V8 是否更少在残局突然死亡？
3. V8 的额外棋力用了多少 CPU？
4. 哪个具体模块带来了提升？

## 1. 必须固定随机 seed

2048 的出生位置和 2/4 都是随机的。

A/B 必须使用相同 seed 序列。

禁止：

- A 跑随机 100 局，B 再跑另一批随机 100 局；
- 看两三局肉眼感觉就宣布提升。

建议层级：

```text
开发 smoke test:  20-50 seeds
方向验证:        200-500 seeds
候选发布:        >= 1000 seeds
强结论:          5000-10000 seeds
```

## 2. 同样的执行语义

比较搜索算法时必须确保：

- 同一棋盘规则；
- 同一 spawn RNG；
- 同一硬件/环境；
- 同样是否并行；
- 同样的 node/time budget 定义。

**不要把浏览器 4 Worker 产品表现与 native 单线程串行 root benchmark 直接比较成“谁快”。**

单线程 benchmark 可用于微基准，但要明确标注。

## 3. 自动节奏不进入 benchmark

“自动节奏”只影响 UI/下一步延迟。

benchmark 应关闭动画/声音/人为 sleep，直接驱动引擎。

## 4. 同时记录棋力和性能

最低统计：

### 棋力

- score mean；
- score median；
- P10 / P5；
- max tile distribution；
- >=2048；
- >=4096；
- >=8192；
- >=16384；
- >=32768；
- average moves survived。

### 性能

- ms/decision P50；
- ms/decision P95；
- ms/decision max；
- nodes/decision；
- nodes/s；
- TT hits；
- risk nodes；
- verifier nodes；
- aborted risk searches；
- override count。

## 5. 专门记录残局指标

因为用户已明确观察到：棋盘空间小时容易突然输。

至少记录：

- 首次进入 `empties <= 2` 的步数；
- 从 `empties <= 2` 到死亡还能活多少步；
- 进入危险状态后是否恢复到 `empties >= 4`；
- survival sentinel 触发次数；
- survival 与 baseline 冲突次数；
- verifier 接受 override 次数；
- override 后 10/20/50 步的实际存活情况。

后续可定义：

```text
Recovery rate = P(reach >=4 empties before death | entered danger)
```

## 6. Disagreement Corpus

每次新旧引擎动作不同，保存：

```text
board
seed / move index
baseline move
candidate move
root scores
search depth
sampling tier
survival H5/H6/H7
verifier result
final game outcome
```

这批局面比随机棋盘更有价值，因为它们正是“版本差异真正发生”的地方。

开发新算法时先跑 disagreement corpus，再跑完整整局 benchmark。

## 7. 不允许只报告平均分

平均分容易被少量超高分拉动。

例如一个版本可能：

- 平均分上涨；
- 但 P10 下降；
- 4096 达成率下降；
- 更容易早死。

因此任何“更强”结论至少同时看：

```text
mean + median + P10 + tile distribution
```

用户最关心 4096/8192，所以必须单独报告这些达成率。

## 8. “不能下降”的工程定义

无法保证随机游戏逐局都绝不比旧版差。

合理发布门槛应该是统计非退化，例如：

- 4096 达成率不低于基线；
- 8192 达成率不低于基线，目标显著提高；
- score median/P10 不明显退化；
- 危险状态死亡率下降；
- P95 延迟仍在可接受范围；
- 若平均耗时增加，必须有明确棋力收益。

具体阈值应在正式 1000+ seed benchmark 后冻结，不要现在凭感觉写死。

## 9. 每次只改少数变量

不要同时：

- 换 evaluator；
- 换 TT；
- 换 sampling；
- 换 depth；
- 换 risk；

然后看到提升却不知道原因。

推荐顺序：

```text
Baseline
+ fix A
+ fix A+B
+ fix A+B+C
```

每一层都能回退。

## 10. 微基准与整局 benchmark 分开

微基准适合验证：

- eval ns/call；
- move table；
- TT lookup；
- exact depth throughput；
- survival H6/H7 nodes/s。

整局 benchmark 才能验证：

- 决策是否真的更强；
- horizon 修复是否造成过度保守；
- 随机分布下是否稳定。

两者都需要，不能互相替代。

## V9.1 补充：根方向 TT 隔离是硬要求

浏览器生产路径中，每个根方向分配给独立 Worker；`wasmExact()` 每次调用前执行 `clear_tt()`。因此 benchmark 若使用单个 WASM 实例顺序搜索四个方向，必须在**每个根方向之前** clear TT，否则结果不等价于产品。

Wall-clock / iterative-deepening 的整局测试应尽量使用 4 个独立 Worker 复刻产品调度。由于 hard deadline 会受 OS 调度影响，单个 fixed seed 的最终分数不是确定性指标；棋力回归优先使用固定深度/固定语义的确定性局面集，多 Worker 时间预算测试主要评估延迟、完成深度分布和 discarded work。

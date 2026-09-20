# V9 关键 Benchmark 记录

> 这些数字用于比较方向，不代表用户 Mac 上的绝对毫秒。局面级测试是单线程顺序跑根方向，而浏览器实际使用多 Worker。

## Strong quality-floor 对照

样本：45 个正常可达中盘状态。参考：更深一层、相同 fast sampling 语义。

| 方案 | 与参考最佳动作一致 | 平均测试耗时 | 平均节点 |
|---|---:|---:|---:|
| V8-style Strong floor | 84.4% | ~2.85ms | ~34k |
| V9 Strong：直接 d4 | 91.1% | ~5.18ms | ~61k |
| cap5 / 更低 probCut | 84.4% | ~13.9ms | ~176k |
| cap5 + exactPlies2 | 86.7% | ~18.6ms | ~241k |

结论：当前主核上，先保证 horizon 比全局增加 chance 精度更划算。

## 旧 Strong 高质量参数对照

另一组约 31 个中盘状态，以更昂贵 d5 / old-extreme 语义作为参考：

- V8-style Strong：约 77.4% 一致，~6.95ms；
- 旧 cap7/exactPlies2 Strong：约 80.6% 一致，~36.7ms。

结论：约 5x 成本只换到小幅动作一致性改善，不进入正常 V9 主线。

## Fast 提前 d4 实验 — 已撤回

81 个中盘状态，以更深同语义参考：

- 当前 Fast：约 63.0%；
- `empties <= 6 -> d4`：约 69.1%；
- `empties <= 7 -> d4`：约 77.8%。

但 fixed-seed 整局 A/B：

- seed 1：V8 baseline ~78,892 / 4096；实验版 ~69,280 / 4096；
- seed 4：V8 baseline ~74,620 / 4096；实验版 ~71,428 / 4096。

因此撤回。以后不能只看“与深层动作一致率”决定发布。

## Extreme 浅层重复成本

37 个中盘样本、每个 exact 深度轮都清 TT：

- d3+d4+d5 顺序重算：约 770ms 总计；
- fresh d5：约 503ms；
- 重复浅层成本约 35%。

V9 采用保守版本：Extreme 只跳过 d3，以 d4 保留安全 fallback，再把省下来的预算留给 d5。

## Survival 回归

已知 horizon-trap：

```text
2     4    64     4
512  32   256     8
4    256  1024    4
2     2     4   2048
```

H6：

- Left ≈ 0.92583775
- Right ≈ 0.98121475
- best = Right
- nodes = 86,750

V9 重编 `survival_v9.wasm` 后结果保持一致。

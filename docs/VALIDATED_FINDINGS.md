# 已验证结论与证据等级

本文只记录已经通过源码检查、生产 WASM 黑盒测试或固定样本 A/B 支持的结论。

## 证据等级

- **CONFIRMED**：已直接复现，足以作为工程约束。
- **STRONG SIGNAL**：多组样本支持，但还没有大规模整局统计。
- **HYPOTHESIS**：合理方向，尚不可当事实使用。

---

## CONFIRMED — 自动节奏不影响搜索思考时间

`speed` 滑杆只控制下一步 AI 的 `setTimeout` 间隔和动画节奏。

因此：

- 调慢不会给 AI 更多搜索 budget；
- 极速模式还会节流 UI stats repaint；
- 不应通过屏幕节点数比较不同滑杆位置的棋力。

---

## CONFIRMED — V7.2 跨深度 TT 会造成搜索历史依赖

生产 WASM 可复现：

```text
先搜 d3 -> 不清 TT -> 搜 d4
```

与：

```text
clear TT -> fresh d4
```

在同 board、同 d4 参数下可得到不同 score。

正常可达棋盘样本中找到过最终最佳方向翻转。

额外测试表明，跨层 TT 虽可减少少量节点，但没有表现出稳定的实际耗时收益。

**V8 Preview 策略：每次 exact 深度任务前 `clear_tt()`。**

---

## CONFIRMED — 多个相同最大块时旧 evaluator 不满足旋转对称性

旧 evaluator 只保存扫描到的第一个最大 rank 位置。

在构造的旋转等价棋盘上，生产 WASM `eval_board()` 曾出现约：

```text
16826 vs 1426
```

的巨大差异。

临时改成“所有最大块都对称考虑”的参考 evaluator 后，旋转差异下降到浮点误差级。

**当前 Hybrid 主 WASM 内部仍未修复。**

---

## CONFIRMED — V7 chance sampling 会破坏 D4 对称性

当 chance node 使用固定绝对格子编号抽样时，同一棋盘旋转 90° 后可能抽到不同出生位置。

在正常可达中盘样本中，用 V7 轻快参数测试最终动作，约 10% 样本的旋转后动作没有对应旋转（样本规模约 200；不能直接解释成真实整局 10% 错误率）。

全展开 chance 后，同样测试恢复对称。

**V8 Preview 用根 D4 canonicalization 缓解。**

---

## CONFIRMED — evaluator 在 5->4 与 3->2 空格存在硬跳变

旧 evaluator 的 `late` / `critical` 权重是硬阈值。

抽取正常可达棋盘，只往一个空格放入普通 `2`：

- 5 -> 4 空格：2500/2500 次 evaluator 上涨，中位约 +1816；
- 3 -> 2 空格：大量样本 evaluator 同样上涨；
- 这不是普遍的“加一个 2 结构变好”，而是权重尺度突然切换。

未来主 evaluator 必须连续化或平滑 stage blend。

---

## CONFIRMED — 极致模式 mandatory base depth 会突破标称 budget

旧调度器基础深度使用 `hardBudget=0`，意味着最低深度必须算完。

生产 WASM 的中后盘样本中，d5 / d6 单根方向可明显超过 50ms；四根虽然并行，整轮仍要等待最慢根方向。

因此“极致 50ms”不等于严格 50ms，而且经常在完成最低深度后已经没有 refinement 预算。

未来模式不应由 mandatory depth 定义。

---

## CONFIRMED — 轻快与深入在真正残局可能拥有相同 horizon

旧 V7.2：

```text
empties <= 2
fast baseDepth   = 5
strong baseDepth = 5
```

且此时空格少，两者通常都 full enumerate spawn。

所以“深入”增加的成本主要来自概率剪枝/预算差异，不保证多看一个行动周期。

这与实测“残局深入模式没有明显更聪明”一致。

---

## CONFIRMED — 深度误差比单纯 sampleCap 误差更大（当前参数下）

约 200 个正常可达中盘样本：

```text
sampleCap 4 -> 7，depth 不变：最佳方向改变约 8%
depth 3 -> 4，sampleCap 不变：最佳方向改变约 23.5%
```

因此目前不能把额外预算主要花在“多采几个出生格”上。

同时 8% 也足够说明 sampling 不能忽略。

---

## CONFIRMED — depth ranking 会振荡

同一批样本中观察到：

```text
d2 -> d3 最佳方向变化约 35%
d3 -> d4 约 23.5%
```

并存在：

```text
A -> B -> A
```

式 depth oscillation。

因此“完成的最高 depth”本身不能作为唯一可信度指标。

---

## CONFIRMED — 浅层 Top-2 pruning 不安全

正常可达状态中存在：

- d3 排名第 4 的方向；
- d4 变成第 1；
- d5/d6 仍保持第 1。

所以不得只保留浅层 Top-2 继续搜索，除非有严格 bound 可以证明其他候选无法追上。

---

## CONFIRMED — `-1e15` 使搜索在 horizon 内近似优先最小化死亡概率

正常 evaluator 常见量级约几万，而 terminal penalty 是：

```text
-1e15
```

相差约十个数量级。

真实残局中，深层 score 与精确死亡概率出现近似：

```text
score ~= -1e15 * P(death)
```

这说明 V7 并非“不重视死亡”，而是：

- horizon 内极端重视；
- horizon 外完全看不到；

从而形成明显的 horizon cliff。

---

## CONFIRMED — Survival Sentinel 能捕捉真实 horizon trap

曾抓到真实危险局面：

```text
2     4    64     4
512  32   256     8
4    256  1024    4
2     2     4   2048
```

只可左右走。

V7 深度选择：

```text
d3 -> 右
d4 -> 右
d5 -> 左
d6 -> 右
d7 -> 右
```

独立 exact H6 Survival：

```text
左 ≈ 92.58%
右 ≈ 98.12%
```

说明 d5 的“左”是典型 horizon trap。

---

## CONFIRMED — Survival 不能直接覆盖主搜索

早期原型只要 survival gap 足够大就直接覆盖。

固定 seed 中出现小幅退化，证明短期生存率不能代替完整长期结构价值。

加入“Survival 发现冲突 -> d+1 Verifier 确认 -> 才覆盖”后，早期小样本表现明显更稳定。

因此当前 Hybrid 采用 verifier gate。

---

## CONFIRMED — 全关 probability cutoff 性价比差

普通中后盘样本，关闭 `probCut`：

- 节点中位数约 1.89x；
- 耗时约 1.76x；
- 最佳方向变化很少。

两空格 d5 样本：

- 节点约 2.78x；
- 时间约 2.52x；
- 有少量动作变化。

所以正确方向不是“全关 probCut”，而是把 risk channel 与普通 value channel 分开处理。

---

## CONFIRMED — 旧 4-bit 主核存在 32768+ 边界

4-bit rank 可表示到 15（32768）。

旧 WASM 对 rank15+rank15 会饱和在 rank15，同时 gain 可继续计入 65536。

当前主线程 `pack4()` 在发现 `r>=15` 时直接拒绝进入 WASM，避免错误状态继续传播，因此出现 32768 后会提前失去高速路径。

未来需要 extended representation，不能简单解除检查。

---

## STRONG SIGNAL — 风险曲线比单一 H6/H7 更有信息

真实残局中观察到：

```text
H5: A 更安全
H6: A 更安全
H7: B 明显更安全
```

说明只比较一个固定 horizon 仍可能不稳定。

未来可用 H5/H6/H7 risk profile 检测 horizon crossing，再决定是否启用 Verifier。

当前 Preview 尚未完整实现 risk-curve certificate。

---

## HYPOTHESIS — 最终主核应使用 Risk-Bounded Interval Expectimax

建议方向：

- `value lower/upper bound`；
- `death risk lower/upper bound`；
- 只有区间重叠时继续 refinement；
- 用严格 bound 淘汰候选，而不是按浅层 ranking。

这是后续研究方向，尚未在生产 V8 Preview 中实现，不得写成“已经证明更强”。

---

## HYPOTHESIS — Compact Learned Residual / N-tuple

研究文献支持 N-tuple / TD + Expectimax 在 2048 上很强。

但本项目应在 correctness core 稳定后再加入，建议：

```text
V_leaf = fixed_handcrafted_value + alpha * learned_residual
```

并从 `alpha=0` 逐步 A/B。

不要让 learned model 去补偿 TT、对称性、phase jump 等底层错误。

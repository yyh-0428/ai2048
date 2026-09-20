# V8 架构说明

## 当前 V8.0 Preview：Hybrid Safety

```text
UI / Game State
      |
      v
Root D4 Canonicalization
      |
      v
V7.2 Fast WASM Expectimax  <--- 主棋力/主速度来源
      |
      +--> 每个 exact 深度任务前 clear_tt()
      |
      v
Baseline move
      |
      +-- 危险局? --否--> 返回
      |
      是
      v
Survival Sentinel WASM
      |
      +-- 与 baseline 一致 / gap 不足 --> 返回 baseline
      |
      v
Deeper Expectimax Verifier
      |
      +-- verifier 支持 survival candidate --> 覆盖
      +-- 否 --> 保留 baseline
```

## 为什么是 Hybrid，而不是全新主核

曾尝试重写新的主 WASM：

- 连续 evaluator；
- 多最大块对称处理；
- 更严格 terminal 顺序；
- 2-way TT；
- 嵌套 deterministic sampling；
- 内建 survival。

但同深度整局测试约慢 4 倍。该方案没有进入本次发布。

**结论：** 正确性重构必须与 table-driven bitboard 的原有性能一起完成，不能用慢得多的“正确版本”替换快速生产核。

## 当前各组件职责

### `2048-ai.html`

包含：

- UI；
- 游戏规则；
- Worker 源码；
- V7 主 WASM Base64；
- V8 Survival WASM Base64；
- D4 canonicalization；
- 搜索轮调度；
- Survival / Verifier 决策逻辑。

### V7 主 WASM

优点：

- 64-bit packed bitboard；
- row lookup tables；
- 很高节点吞吐；
- V7.2 实战已经证明底盘很强。

限制：

- 源码未保留；
- evaluator 存在已确认的不连续与多最大块偏置；
- 内部近似语义需要黑盒实验验证；
- 4-bit rank 对 32768+ 有表示/饱和问题。

### `survival_v8.c` / `.wasm`

这是 V8 新增、可维护的精确风险搜索。

它只回答：

> 在未来 h 个 player decisions 内，最佳求生策略的存活概率是多少？

特点：

- 完整枚举所有随机出生格；
- 使用 90% `2` / 10% `4` 的真实概率；
- 不使用 heuristic；
- 不使用 chance sampling；
- 不使用 probability cutoff；
- 有 node limit，超限返回 aborted；
- 使用独立 TT。

因此它是“风险测量仪”，不是完整 2048 AI。

## 当前模式参数设计

V8 Preview 已尽量让三个模式共享相同主搜索语义：

- 相同 `sampleCap`；
- 相同 `exactPlies`；
- 相同 `exactWhenEmpty`；
- 相同/接近的 `probCut` 逻辑；

主要差异应来自：

- 允许的总 budget；
- maxDepth；
- Survival horizon / node cap；
- verifier budget。

### 未来目标

最终应进一步改为真正的 coherent refinement：

```text
Baseline tier
 -> refine depth
 -> refine sampling
 -> refine death-risk
 -> tighten bounds
 -> stop when decision certificate is stable
```

轻快 / 深入 / 极致只是允许这个循环继续多久。

## 最终目标架构

建议最终主核来自同一份 C/C++/Rust source，并同时生成：

```text
engine_native    # benchmark / training / fuzz tests
engine.wasm      # browser production
```

避免再次出现：

- JS fallback 一套语义；
- WASM 黑盒另一套语义；
- 测试结果只能靠逆向猜测。

推荐内部结果类型：

```text
SearchResult {
    positionalValue
    expectedGain
    deathProbability
    lowerBound
    upperBound
    exactness
}
```

而不是把所有信息压成一个 `double`。

## 未来并行调度

当前 root=worker 的方式在 4 个合法方向时很好，但残局只剩 2 个方向时会浪费两个 Worker。

建议：

```text
4 candidates -> 1+1+1+1
3 candidates -> 1+1+1 + 一个 safety/verifier worker
2 candidates -> 2+2，按 chance branch 粗粒度拆分
1 candidate  -> 不搜索，直接走
```

不要做“一条 spawn branch 一个 message”的超细粒度调度，通信成本可能反噬。

## 32768+ 规划

当前 4-bit tile rank：

- rank 15 可以表示 32768；
- 两个 rank 15 再合并时旧主核会状态饱和，而 gain 可以继续增加；
- 当前 `pack4()` 因此在 `r >= 15` 直接拒绝进入旧 WASM，提前回退 JS。

未来不要简单解除检查。

建议保持 64-bit low nibble 快路径，并增加稀疏 high-rank extension，例如：

```text
uint64 low4
uint16 highBitMask
```

正常棋局 high mask 为 0，继续走原有极速 row-table；只有 32768+ 所在行进入慢路径。

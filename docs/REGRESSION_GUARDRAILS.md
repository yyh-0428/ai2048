# 回归测试护栏

本文件定义后续 V8.x 修改时最低限度应该自动化的测试。

## 1. 语法与产物

- 主线程 JS `node --check`；
- Worker 源码 `node --check`；
- 所有 WASM 可成功 `WebAssembly.instantiate`；
- 校验期望导出函数存在；
- 如果 HTML 内嵌 WASM，同时保留外部 `.wasm`，必须做字节一致性检查。

## 2. 游戏规则测试

至少覆盖：

- 左/右/上/下移动；
- 单次合并规则（例如 2 2 2 2 -> 4 4，不能链式变 8）；
- gain 计算；
- forced move；
- no legal move；
- 2048/4096/8192/16384/32768 tile；
- 32768+ 不允许错误饱和成同一状态继续搜索。

## 3. D4 不变量

对随机可达棋盘执行 8 种 D4 变换。

### move equivalence

应满足：

```text
T(move(board, dir)) == move(T(board), T(dir))
```

### evaluator invariance

对未来新 evaluator：

```text
eval(board) ~= eval(T(board))
```

浮点只允许极小误差。

### search equivariance

如果不是 score 真正平局：

```text
best(T(board)) == T(best(board))
```

注意：旧 Hybrid 主 WASM 内部仍有已知 evaluator 对称问题，因此当前版本只能把此测试作为“未来主核替换 gate”，不能假装旧核已经通过。

## 4. TT history independence

对于声称 exact 的搜索：

```text
clear -> D4
```

必须等于：

```text
clear -> D3 -> D4
```

以及：

```text
clear -> other boards -> target D4
```

若结果依赖调用历史，则说明 TT key / generation / search semantics 不完整。

近似 TT 若允许 history dependence，必须被限制在当前 round，不能污染下一轮。

## 5. Terminal-before-cutoff

所有搜索实现都应保证 terminal 语义不会被普通 heuristic cutoff 掩盖。

测试：

- terminal board + depth=0；
- terminal board + 很小 path probability；
- one-move-away terminal；
- spawn 后 terminal。

Risk channel 尤其不能因为普通 value `probCut` 漏掉死亡。

## 6. Evaluator 连续性测试

未来新 evaluator 应建立自动属性测试：

### 空格边界

对大量正常可达棋盘，向空格加入一个普通 `2`：

- 不要求每次 eval 都下降；
- 但不能在某个空格阈值出现“几乎 100% 突然上涨”的系统性尺度跳变。

重点监控：

```text
6->5
5->4
4->3
3->2
2->1
```

### stage blending

若存在多个 stage model，测试边界两侧输出的一阶变化，禁止硬切大跳。

## 7. Sampling refinement 测试

最终采样设计应满足：

```text
S4 ⊂ S7 ⊂ S10 ⊂ Sall
```

同 board 的高 tier 只能增加样本，不能重新换掉低 tier 已经算过的出生格。

如果使用 hash permutation：

- hash 必须确定性；
- D4 canonical root 后旋转等价棋盘必须得到相同采样序列；
- 不使用时间/random seed 影响搜索结果。

## 8. Survival 测试

`survival_v8.c` 的值必须满足：

```text
0 <= P_survive <= 1
```

非法根动作允许返回负 sentinel，但合法结果不能超界。

属性：

- no legal move -> 0；
- horizon 0 且当前能动 -> 1；
- exact spawn 90/10；
- same board/horizon fresh 与 TT hit 结果一致；
- node limit abort 不能伪装成有效概率。

保留至少一个已知 horizon-trap fixture：

```text
2     4    64     4
512  32   256     8
4    256  1024    4
2     2     4   2048
```

H6 应继续显示右方向 survival 明显高于左方向。

## 9. Verifier gate 测试

必须覆盖：

1. Survival 与 baseline 一致 -> 不做 override；
2. Survival gap 不足 -> 不 override；
3. Survival 强烈冲突但 verifier 不支持 -> 不 override；
4. Survival + verifier 都支持 -> 允许 override；
5. verifier timeout/abort -> 保守回 baseline。

## 10. 搜索模式单调性

目标：轻快 / 深入 / 极致是同一算法的预算层级。

未来正式 coherent engine 应测试：

- 高模式不会换一套不兼容 sampling semantics；
- 高模式能复用低模式已完成工作；
- simple board 上高模式允许提前停止，不必强制更深；
- difficult board 上高模式能真正获得额外 refinement，而不是 mandatory base depth 已经吃光预算。

## 11. 性能回归门槛

任何核心替换必须同时给出：

- nodes/s；
- ms/decision P50/P95；
- TT hit rate；
- discarded work；
- 固定 seed score/tile 结果。

如果同语义吞吐显著下降（例如过去曾出现约 4x 变慢），默认 **不得替换生产主核**，除非有大规模棋力收益足以证明值得。

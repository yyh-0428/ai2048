# V9.1 架构 — Compute Reallocation Hybrid

## 主路径

```text
Board
  -> D4 root canonicalization
  -> mode quality floor
  -> V7.2 fast WASM Expectimax
  -> round-local TT isolation
  -> stage-aware max depth (Strong / Extreme only)
  -> if fragile: exact Survival
       Extreme H7 abort -> H6 fallback
  -> if Survival disagrees enough: high-quality Verifier
  -> final move
```

## 模式

### Fast

保持 V9 主线：d3/d4/d5 自适应质量底线，普通 6ms。仅在真正拥挤时增加预算：2–3 空格 8ms，0–1 空格 10ms。没有全局 d4、没有 H7 常开、没有常驻 Top-2 verifier。

### Strong

d4 质量底线，<=2 空格 d5。为了避免前中盘把 22ms 浪费在 d8/d9/d10，使用阶段 maxDepth：>=7 空格 d5、6 空格 d6、5 空格 d7。<=4 空格恢复原 maxDepth，并把预算提高到 28ms；<=2 空格 32ms。

### Extreme

保持用户已验证较好的 58ms 总预算和 d4/d5 floor。使用与 Strong 相同的阶段 maxDepth，但 <=4 空格完全释放。风险层仍先尝试 H7；若 300k node cap 中止，则回退 H6，再按原 gap + Verifier 规则决定是否覆盖。

## 为什么不是全局更深

生产主核的搜索在空盘/中盘会因 probability cutoff 迅速变窄，继续增加 nominal depth 经常不改变动作。V9.1 的样本显示 empties>=7 时 d5 已与更深参考高度一致，因此优先减少无效 refinement；真正拥挤以后再允许深搜。

## 不变的正确性护栏

- 每个 exact 调用先 clear TT；
- 完整同步轮才提交；
- Survival 不直接决定动作；
- 根 D4 canonicalization 保留；
- 普通搜索仍保持 cap4 / exactPlies1，昂贵语义只在 Verifier 使用；
- 主 WASM 仍是高速旧核，直到同源新核性能追平。

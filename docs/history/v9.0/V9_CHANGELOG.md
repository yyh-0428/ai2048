# V9.0 Changelog

## 用户反馈驱动

- 极致模式在实际体验中最强；保留其核心行为，并设为默认模式。
- 自动节奏默认继续为 0ms（极速）；UI 明确标注该滑杆不影响棋力。
- 轻快/深入在冲击 4096+ 时感觉弱于预期，因此重点检查短预算模式是否完成足够 horizon。

## 算法 / 调度

- Strong：从 d4 直接起步；空格 <=2 时 d5。
- Extreme：从 d4 起步、空格 <=2 时 d5，跳过 V8 中无缓存复用价值的 d3。
- Fast：保留 V8 的 d3/d4/d5 自适应底线；撤回“<=7 空格强制 d4”实验。
- 普通搜索继续使用 cap4 / exactPlies1，避免旧 strong 参数造成约 5x 成本。
- 新增 Spawn Fragility Probe，用真实下一次 2/4 出生结果决定是否值得跑 Survival。
- Survival gap 阈值更灵敏：Fast 1.8%、Strong 1.5%、Extreme 1.2%。
- Survival 冲突后的 Verifier 临时升级 chance coverage，而不是让全局搜索变重。

## UI

- 默认思考强度改为“极致”。
- 默认自动节奏仍为最左 0ms。
- 文案改为“自动节奏（越左越快 · 不影响棋力）”。

## 明确撤回

- 全局恢复 cap7/exactPlies2：太慢，收益不成比例。
- Fast `empties<=7 -> d4`：局面级指标变好，但固定整局 seed 退化。
- Extreme 每步 mandatory d5：可能重引入最低深度突破时间预算，未采用。

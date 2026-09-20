# V9.1 Changelog

- Strong / Extreme 新增阶段最高深度：空格>=7 d5、空格=6 d6、空格=5 d7，<=4 恢复原模式上限。
- Fast 后盘预算：6ms -> 8/10ms（仅 <=3 / <=1 空格）。
- Strong 后盘预算：22ms -> 28/32ms（仅 <=4 / <=2 空格）。
- Extreme 保持 58ms，避免破坏已经验证较好的模式手感。
- Extreme H7 Survival 超 node cap 时自动 fallback H6；仍需 Verifier 才能覆盖主搜索。
- UI 更新为 V9.1，并显示 H7→H6 fallback 状态。
- 修正文档中的 benchmark 规范：根方向必须 TT 隔离；wall-clock 模式必须用多 Worker 真实调度。
- 明确记录并拒绝：全局 gate、Fast critical H7、常驻 late Top-2 verifier。

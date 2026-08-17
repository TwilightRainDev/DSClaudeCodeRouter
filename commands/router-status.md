# 路由状态（Router Status）

读取近距离引导 hook 的活动日志并汇总路由状态。hook 位于 `C:\Users\hxdn\.claude\hooks\router\`，日志文件为 `C:\Users\hxdn\.claude\hooks\router\state\activity.jsonl`（JSONL，每行一条注入记录：`ts / session / round / mode / complex / boost`）。

## 执行步骤

1. 若 `state\activity.jsonl` 不存在：报告"hook 尚未产生注入记录"，并说明需 `/hooks` 重载配置或新会话后，任务类消息才会注入。
2. 存在则读取并汇总：
   - **配置**：模型 `deepseek-v4-flash`（Flash 档：不启用决策闭合尾；非 Flash 模型经 `ROUTER_MODEL` 环境变量切换时自动追加）
   - **注入统计**：总注入次数、活动会话数、平均每会话轮次
   - **模式分布**：按 `mode`（spec/react/weak）计数
   - **复杂度占比**：`complex=true` 的记录数及占比
   - **boost 占比**：`boost=true`（第 3 轮起重分类）记录数
   - **最近 10 条明细**：时间 / 会话 / 轮次 / 模式 / 复杂 / boost，时间转可读格式
3. 一句话判断：若模式分布单一（如全部 weak），提示"任务消息关键词不足，classifyTask 落入弱域"。

输出使用文本表格或列表，无 emoji。

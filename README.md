# DSClaudeCodeRouter

把 DeepSeek Harness 的**任务感知思维模式路由**（[dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)，MIT）移植到 Claude Code 的零依赖实现：UserPromptSubmit hook 在每条真实任务消息后注入近距离引导，按任务类型（build/fix）与复杂度分派 react/spec 行为带，专为 Flash 系模型调校。

判定逻辑与引导文本与 dsh-router-standard / dsh-mode-boost 源码逐行一致（改动文本即放弃 DSH 环境 P1-P30 实测背书）。本机/远端模型为 DeepSeek V4 Flash（`deepseek-v4-flash`）时，Flash 档实测结论（路由 96%、单任务完成率 100%、缓存 92-94% 命中）直接适用。

## 特性

- **近距离引导**：每条真实用户消息后注入一条固定引导文本（与 system 远距离注入相比零衰减；固定文本字节稳定，缓存友好）
- **任务分类**：关键词计数判定 build（react 行为带）/ fix（spec 行为带），计数相等或模糊落入 weak（模型自分类）
- **寒暄让位**：`isChatTask` 检测聊天/无任务消息，整体不注入（防深度 persona 套聊天上的长思维链事故）
- **深度自适应**：简单任务快速收敛引导（1 步零浪费）；复杂任务有向深思考引导（架构/边界/集成点，禁环境猜疑）
- **boost 重分类**：第 3 轮起注入"这是新任务，重新分类，勿沿用上轮风格"，防风格稀释
- **Flash 档调校**：不加决策闭合尾（对 Flash 实测中性）；`ROUTER_MODEL` 环境变量切换非 Flash 模型时自动追加
- **活动日志**：每次注入记录 `ts/session/round/mode/complex/boost` 到 `state/activity.jsonl`（上限 1000 行），`/router-status` 命令可汇总
- **判定逻辑零依赖**：纯函数 + node:test 单测（24 个），可直接移植或改造

## 安装

### 1. 复制 hook 到配置目录

```powershell
# Windows（或手动复制 hook/ 下 4 个文件到 ~/.claude/hooks/router/）
.\install.ps1
```

### 2. 接线 UserPromptSubmit hook

在 `~/.claude/settings.json` 的 `hooks` 中加入：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:\\Users\\<用户名>\\.claude\\hooks\\router\\hook.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### 3. 复制 status 命令（可选）

将 `commands/router-status.md` 复制到 `~/.claude/commands/router-status.md`，之后可用 `/router-status` 汇总路由状态。

### 4. 生效

输入 `/hooks` 重载配置，或新开会话。

## 使用

- 正常对话即生效：任务消息自动注入引导（对用户不可见）；寒暄/聊天不注入
- `/router-status`：汇总注入统计、模式分布、复杂度与 boost 占比、最近 10 条明细
- 环境变量（hook.js）：
  - `ROUTER_MODEL`：模型 ID（默认 `deepseek-v4-flash`；含 "flash" 即 Flash 档）
  - `ROUTER_STATE_DIR`：状态目录（默认 hook 目录下 `state/`）
  - `ACTIVITY_MAX_LINES`：活动日志行数上限（默认 1000）

## 工作原理

| 机制 | 对应 dsh 实测 | 实现 |
|---|---|---|
| 近距离引导 | P14/P16/P20：用户消息后注入零衰减 | hook.js → `hookSpecificOutput.additionalContext` |
| 弱域内路由 | P8/P11：模型自分类（区分度 +5.67） | `classifyTask`：关键词计数相等 → weak |
| 三锚（回顾+收敛+反跑题） | P22/P23：开放任务完成率 0→100% | Flash persona 锚句并入引导文本 |
| 深度自适应 | P30：深度 +12% 且收敛更快 | `isComplexTask` + GUIDE_DEEP 分派 |
| 寒暄让位 | mode-boost：338 块长思维链事故 | `isChatTask`（CHAT_RE 正则） |
| 首轮锚定思想 | 铁律 6/7：暴露面收窄 | 技能描述一行化（见 docs） |

Claude Code 2.1.x 适配：[WARN] `additionalContext` 必须嵌套在 `hookSpecificOutput`（带 `hookEventName: "UserPromptSubmit"`），`decision` 枚举为 `approve|block`——旧式顶层字段与 `"allow"` 会被 "Hook JSON output validation failed" 拒绝（详见 docs/DSHRoutingSuite-移植评估.md）。

## 测试

```sh
cd hook && node --test
# 24 tests, all pass
```

## 许可证

MIT。本项目是 [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)（MIT, yjh051108）及其组件 dsh-super-injector / dsh-router-standard / dsh-mode-boost 的移植作品，判定逻辑与引导文本逐行派生自 dsh-mode-boost/lib/core.js（MIT）。详见 [NOTICE](./NOTICE)。

## 致谢

- [dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) / [dsh-router-standard](https://github.com/yjh051108/dsh-router-standard) / [dsh-mode-boost](https://github.com/yjh051108/dsh-mode-boost)（MIT）：实测机制、判定逻辑与引导文本的全部来源
- [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)（MIT）：首轮锚定机制
- [xiaobright/modeltest](https://github.com/xiaobright/modeltest)（MIT）：V4.1b 评测数据
- DeepSeek Harness：路由预设的宿主生态

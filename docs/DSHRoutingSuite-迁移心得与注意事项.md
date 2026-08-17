# 迁移插件的心得与注意事项：dsh-routing-suite → Claude Code

> 撰写日期：2026-08-17 | 实战复盘：从 zip 壳到发布仓库（DSClaudeCodeRouter）的完整迁移
> 前置文档：同目录《DSHRoutingSuite-功能分析.md》（组件与机制分析）、《DSHRoutingSuite-移植评估.md》（概念映射与分批计划）

## 一、先想清楚"搬什么"

插件可以拆成两层：**平台机制**和**提示词资产**。迁移的第一步是把这个分类做对。

- **平台机制**：依赖宿主 API、生命周期、运行时注入的东西。dsh 的 cordis 插件（`ctx.loader.create`）、system-prompt/assemble 拦截、persona section 替换、dev_* 工具注入，全都不搬。Claude Code 没有对应物，硬搬等于重写一个平台。
- **提示词资产**：纯文本、纯函数、测量结论。`classifyTask` 的关键词表、`GUIDE_*` 引导文本、WEAK_FLASH 锚句、P1-P30 实测结论，全部可搬。它们与平台无关，只是"往哪个位置放什么文本"的设计。

判断标准就两条：依赖平台生命周期吗？脱离平台还有意义吗？前者是机制，后者是资产。把时间花在资产上。

## 二、保真度是移植的第一原则

- **文本零改动**。引导文本带着实测背书（dsh 的 P1-P30、路由 96%、收敛 100%）。改动措辞等于放弃背书，等于自己重新做实验。移植的 GUIDE_* 文本与 dsh 源码逐字符一致，一条注释写明来源。
- **移植保真冲突时，改测试，不改逻辑**。本实战遇到两次：测试期望 `'修bug'` 判任务，但 dsh 关键词表没有 'bug'，原版判聊天；测试期望"无歧义复杂句"判 spec，但 '做' 在 REACT_RE 里，计数相等落入 weak。两处都是测试写错了期望，dsh 行为是对的（或至少是实测过的），改测试对齐源码。
- **平台差异用近似，不用改造**。Claude Code 没有 persona section 替换机制，弱域 persona 的分派语义就用近距离引导文本近似（引导里写 "classify this task (build or fix)"，模型自己分派）。近似保住的是行为效果，不是实现形态。

## 三、方法论：六个步骤

1. **源码级分析，不信 README 摘要**。zip 里只有壳（README + install.ps1），真正的东西在 submodule。拉下来读 `router-core.mjs`（194 行，路由逻辑全在这）、`mode-boost/lib/core.js`（引导文本单一事实源）、`router-bootstrap.mjs`（注入机制）。读完才知道哪些能搬、怎么搬。
2. **概念映射表先于代码**。逐行写：dsh 概念 → Claude Code 对应物 → 移植方式。写不出对应物的行，就是不移植项。这张表决定了整个移植的边界。
3. **分批移植，每批独立验收**。按价值/成本排序。批一（hook 注入器 + 引导文本）纯配置改动可回滚；批二（决策闭合、审计、status 命令）依赖批一的基础设施。批三是不移植清单，写清楚理由防止日后反复。
4. **判定逻辑纯函数化**。`classifyTask`/`isChatTask`/`isComplexTask`/`guideFor` 做成零依赖模块 + node:test。纯函数好测、好移植、换平台直接搬。测试 24 个，全程 TDD（先看失败再实现）。
5. **真实环境验证收尾**。单测证明逻辑对，不证明平台契约对。`claude -d hooks --debug-file` 跑真实会话，看 "Parsed initial response"、数 validation failed、查 activity.jsonl。
6. **验收标准写进文档**。5 项验收（寒暄不注入/构建分派/复杂深度引导/3 轮 boost/文本稳定）逐条核对，记录在移植评估文档里。

## 四、踩过的坑（按杀伤力排序）

### 1. hook 输出 schema 版本漂移（杀伤力最大）

Claude Code 2.1.x 的 UserPromptSubmit 输出 schema 改过：`additionalContext` 必须嵌套在 `hookSpecificOutput` 里并带 `hookEventName`，`decision` 枚举是 `approve|block`。旧版文档的顶层 additionalContext + `"allow"` 写法直接报 "Hook JSON output validation failed — (root): Invalid input"。

排错路径：**错误消息自带期望 schema**（The hook's output was / Expected schema 段），比任何文档都准；`claude -d hooks --debug-file` 能看到真实执行与解析日志。修复走 TDD：测试断言改成新结构（红灯）→ 改实现（绿灯）→ 真实环境复验 0 失败。

### 2. Windows 上 hook 的执行环境

hook 命令经 cmd.exe 执行，PATH 只继承 Claude Code 进程的。node 必须在系统 PATH（或 hook 命令里写 node 绝对路径）。调试时别用 Git Bash 的 `cmd //c` 模拟——引号传递会拼出诡异路径（`cwd\"path"`），把排查带偏。先用纯 node 管道测脚本，再上真实环境。

### 3. settings watcher 不监视 ~/.claude

改 settings.json 接线后，当前会话不生效，要 `/hooks` 重载或新开会话。但 **hook 脚本本身即时生效**——命令每次执行都读最新文件，改 hook.js 不用重载。

### 4. hook 对用户不可见

注入的 additionalContext 加到模型收到的消息里，用户界面看不到。验证靠证据链：`state/activity.jsonl`（每次注入一条记录）、debug 日志、"模型侧转述"（我收到的消息带引导前缀，可以在回复里确认）。

### 5. 测试隔离与期望

- 共享状态目录会污染计数——测试按 session_id 过滤，别按全局行数断言。
- 活动日志的 mode 字段存带名字符串（'spec'/'react'/'weak'），别存 dsh 的数值常量 0/1——日志是给人读的。

### 6. Git rebase 的 ours/theirs 语义

rebase 中 ours = 新基底（远端占位 README），theirs = 你的提交，与 merge 语义相反。`git checkout --ours` 拿的是远端那一版。拿错后从原提交 `git show <sha>:README.md` 恢复，amend 修正。

### 7. 发布前的几个小坑

- GitHub 网页初始化仓库会生成占位 README，与本地冲突是常态，rebase 解决即可。
- 署名用 noreply 邮箱（GH007 会拒收），本地 `core.autocrlf false` + `.gitattributes` 全 LF。
- 推送认证用 PAT + Basic extraheader，token 别写进 remote URL。

## 五、给未来移植者的检查单

1. 读源码再写文档，README 会过时
2. 概念映射表先于代码，写不出对应物的就是不移植项
3. 文本资产保原文，机制做近似，别混
4. hook 输出 schema 以实测错误消息为准，别信旧文档
5. 判定逻辑纯函数 + 单测，平台契约用真实环境验证
6. 验证要能"被看见"：活动日志、debug 输出、状态文件，缺一不可
7. 移植保真冲突时改测试不改逻辑，除非你能证明 dsh 是错的

## 六、可复用资产（本次迁移沉淀）

- **判定逻辑纯函数**（hook/router-core.js）：classifyTask / isChatTask / isComplexTask / guideFor / personaFor，零依赖可单测。换任何 harness 直接搬，改的是接入层不是逻辑层。
- **引导文本单一事实源**：GUIDE_* 常量集中在 router-core.js，测试直接断言文本分派，防止实现与文本漂移。
- **活动日志模式**：JSONL 追加 + 行数上限截断 + 按 session 轮次计数。自优化闭环（/router-status）的数据基础，任何 hook 类插件可复用。
- **调试配方**：`claude -d hooks --debug-file <path>` + 错误消息自带的 Expected schema——比翻文档快。

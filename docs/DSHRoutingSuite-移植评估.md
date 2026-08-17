# DSHRoutingSuite 移植评估（DSH → Claude Code）

> 撰写日期：2026-08-17（补读源码后修订） | 目标：Claude Code（本机 ~/.claude/skills + hooks + agents）
> 原则：DSH 与 Claude Code 平台机制不同，**只搬思路不搬源码中的平台层**；判定逻辑与引导文本属提示词工程资产，**可直接移植**；按"价值 / 成本"排序。仅评估与文档，不执行。
> 修订说明：2026-08-17 拉取三 submodule 源码后升级为源码级评估（见《DSHRoutingSuite-功能分析.md》验证状态）。

## 可行性结论：可行（思路级移植，Flash 档素材原样可用）

1. **路由预设是提示词工程资产，与平台无关**：行为带（spec/react/weak）、近距离引导、三锚、寒暄让位都是"何时注入什么文本"的设计，Claude Code 的 hooks + skills 全部能承载。
2. **模型同族是本移植的最大有利条件**：DSH 实测环境为 DeepSeek V4 Pro/Flash，本机 Claude Code 运行 deepseek-v4-flash 中转——**Flash 档实测结论（w7 文本、三锚、Guide_* 分派、寒暄检测）可直接取用**，无需"换个模型重新发明"。
3. **判定逻辑是零依赖纯函数**：router-core.mjs / mode-boost core.js 的 classifyTask / isComplexTask / isChatTask / guideFor / bandOf 等均为纯 JS + 单测（router.test.mjs 11 个），可直接移植为 hook 的 node 脚本。
4. **本机生态已有等价物**：Ask 技能天然就是 weak 内路由；WritePlan/ExecutingPlans/SubagentDrivenDev 对应 spec/react 行为带。移植是"吸收判定逻辑与引导文本"，不是从零建。
5. **机制性组件（注入器/system-prompt 拦截/工具面收窄）不移植**：依赖 cordis 平台；Claude Code 无运行时工具注入与动态工具 schema。**persona 无法替换**——这是最大平台差异，用"注入引导文本近似 persona 分派"处理（引导含 build/fix 风格指令即可）。

## 概念映射表（源码级）

| dsh 概念 | 行为/目的 | Claude Code 对应物 | 移植方式 |
|---|---|---|---|
| weak 内路由（模型自分类） | 模糊任务由模型自判 | **Ask 技能**（已有） | 吸收 classifyTask 的关键词表与"相等→weak"规则 |
| spec 行为带（计划-集体） | 生成/修复任务走计划 | WritePlan + plan mode + SubagentDrivenDev | 已有，不改 |
| react 行为带（执行者） | 维护任务直接干 | 默认执行模式 + ExecutingPlans + TDD | 已有，不改 |
| mixed 过渡带（陷阱） | 不稳定区避开 | 路由判定时显式回避 | 并入 Ask 判定文本 |
| **近距离引导**（session/event → inbox.append） | 每条真实用户消息后注入固定引导，缓存 92-94% 命中 | **UserPromptSubmit hook**（提交前注入，语义等价于"消息后"） | 新增 hook：node 脚本读消息文本 → 输出固定引导（GUIDE_* 文本），脚本输出稳定以保缓存 |
| **寒暄让位**（isChatTask + CHAT_RE） | 聊天会话不注入（防 338 块长思维链） | hook 入口判断 | 移植 CHAT_RE 正则 + 短句无关键词判定，命中→不注入 |
| **深度自适应**（isComplexTask） | 简单→快速收敛，复杂→有向深思考 | hook 分派 | 移植 COMPLEX_RE + 120 字符阈值；Flash 模型不加 GUIDE_CLOSURE |
| **单任务三锚**（回顾+收敛+反跑题） | 开放任务完成率 0% → 100%（P23） | hook 引导文本 | WEAK_FLASH 锚句原样搬入引导文本 |
| **boost 重分类**（第 3 轮起） | 防风格稀释（P19 路由 69%→88%） | hook 按轮次分派 | 移植 GUIDE_BOOST；轮次计数由 hook 维护 |
| plan-mode 保留（只换 persona section） | plan 边界不失忆 | 计划模式切换 | Claude Code plan mode 原生；hook 注入不干扰计划会话 |
| personaFor 按模型匹配 | Pro/Flash 分档 persona | 本机单一 Flash 模型 | **直接取 WEAK_FLASH 档**；persona 本体无法替换，用引导文本近似 |
| 首轮锚定（工具面收窄） | 首轮暴露面最小化，首轮结构决定轨迹 | 无动态工具 schema | 思想移植：技能描述一行化 + Ask 先路由再加载（本机已验证方向，dsh 实测背书） |
| 缓存原则（静态到头/动态到尾） | system 前缀动态变化 = 全量缓存 miss | prompt caching 同机制 | **校验信号**：CLAUDE.md/技能中的行为指令属"远距离"，dsh 实测会衰减；引导走 hook 近距离 |
| dev_router_status / dev_router_mode | AI 自优化路由 | 无原生工具 | 技能或 slash command 替代（router-status 查 hook 状态），收益存疑 |
| dev_mode_subagent（fresh LLM call 隔离） | 模式隔离子代理 | **原生子代理**（agents/*.md 可定义独立 persona，比 DSH 更灵活） | 已有，不改 |
| system-prompt/assemble 拦截（首轮 persona 替换） | 首轮注入分类 persona | 无对应机制 | **不移植**（最大平台差异，引导文本近似） |
| dev_* 注入器全家桶 / GUI 预设选择器 | 免重启运行时管理 | 无对应物 | **不移植**（cordis 平台机制） |

## 分批移植建议

### 第一批（高价值 / 低成本，hook 注入器 + 引导文本）——2026-08-17 已落地

落地位置：`C:\Users\hxdn\.claude\hooks\router\`（router-core.js 判定逻辑 / hook.js stdin-stdout 壳 / router-core.test.js + hook.test.js 共 24 测试全过）；用户级 settings.json 已接线 UserPromptSubmit；Ask 技能已吸收关键词判定小节。生效方式：/hooks 或新会话。

[WARN] Claude Code 2.1.x hook 输出 schema 适配（2026-08-17 实测排错）：`additionalContext` 必须嵌套在 `hookSpecificOutput` 内（带 `hookEventName: "UserPromptSubmit"`），顶层 additionalContext 与旧式 `decision:"allow"` 均会触发 "Hook JSON output validation failed — (root): Invalid input"；当前版本 decision 枚举为 `approve|block`（省略即放行）。修复后经 `claude -d hooks --debug-file` 真实环境验证 0 失败。另注意：Windows 上 hook 经 cmd.exe 执行且仅继承 Claude Code 进程 PATH（Git Bash 配置不可见），node 须在系统 PATH。

| # | 功能 | 来源 | 迁移方式建议 | 状态 | 理由 |
|---|---|---|---|---|
| 1 | **近距离引导 hook** | router-bootstrap.mjs（session/event 注入）+ core.js GUIDE_* 文本 | settings.json 加 UserPromptSubmit hook：node 脚本输出引导文本；脚本含 classifyTask + isChatTask（寒暄让位）+ isComplexTask（深度自适应）+ 轮次计数（boost 重分类） | **已落地**（hook.js，管道测试 9 项过） | 路由 96% + 收敛 100% 的主载体，纯脚本零依赖，可单测 |
| 2 | **w7/Flash 引导文本** | WEAK_FLASH + GUIDE_BASE/BOOST/COMMIT/DEEP | 文本原样取用（英文，与 dsh 实测一致）；不追加 GUIDE_CLOSURE（Flash 实测中性） | **已落地**（router-core.js 常量，测试断言文本与分派） | 本机 deepseek-v4-flash 同族，零调参起点 |
| 3 | **三锚** | WEAK_FLASH 锚句 | 并入引导文本（回顾已完成 + 信息足够就产出 + 禁环境检查/穷举 grep） | **已落地**（personaFor 测试覆盖） | 开放任务完成率 0→100% 是最大单项收益 |
| 4 | **判定逻辑单测** | router.test.mjs | 移植 classifyTask/isChatTask/isComplexTask/bandOf/parseMode 为纯 JS 模块 + node:test | **已落地**（router-core.test.js 10 项全过） | 逻辑零依赖，测试可整体搬运，防后续改动退化 |
| 5 | **Ask 路由吸收** | classifyTask 关键词表 | Ask 判定文本吸收 REACT_RE/SPEC_RE 语义；"相等→weak"规则即 1% 规则的量化版 | **已落地**（Ask/SKILL.md 新增"关键词快速判定"小节，含 lean 不 flip 依据） | 成本最低，与现有生态融合 |

**验收标准**：新开会话连发 3 类消息（寒暄/构建任务/修复任务 + 复杂子任务），确认：寒暄不注入、构建走 react 引导、修复走 spec 引导、复杂任务注入 GUIDE_DEEP、第 3 轮起注入 GUIDE_BOOST、引导文本每轮字节级一致（/cost 观察 cache 命中）。

### 第二批（中价值 / 中成本，行为强化）——2026-08-17 已落地

| # | 功能 | 来源 | 迁移方式建议 | 状态 | 理由 |
|---|---|---|---|---|---|
| 6 | 决策闭合回路 | GUIDE_CLOSURE（Pro 档）+ P30 | 若后续接入非 Flash 模型再启用；Flash 档跳过 | **已覆盖，无需新代码**——批一 guideFor 已按模型分派，经 `ROUTER_MODEL` 环境变量切换非 Flash 模型即自动追加 GUIDE_CLOSURE | Flash 实测中性，本机无对象 |
| 7 | 首轮锚定方向强化 | 铁律 6/7 | 维持技能描述一行化；审计 6+ 技能的会话首轮 prefill 体积 | **已落地**（审计完成）：34 技能 description 平均 47 字符、0 超 200；Ask 137 为路由总则例外（合理）；首轮暴露面约 1.7KB（~400 tokens），远低于 dsh 17.6 万字符事故量级；大体积正文（PersonaEcho 62KB 等）属按需加载设计，不增首轮成本 | 无机制可搬，审计即验收 |
| 8 | router-status 命令 | dev_router_status | slash command 读 hook 状态文件（模式/轮次/注入次数） | **已落地**：hook.js 新增活动日志（state/activity.jsonl，每注入一条 ts/session/round/mode/complex/boost，上限 1000 行截断，5 项测试覆盖）；`~/.claude/commands/router-status.md` 汇总配置/注入统计/模式分布/复杂度/boost 占比/最近 10 条明细 | 自优化闭环，价值视使用习惯 |

### 第三批 / 不移植

| 功能 | 判定 | 说明 |
|---|---|---|
| 注入器（dev_* 全家桶 + junction + registry.json） | 不移植 | cordis 平台机制，Claude Code 无运行时工具注入 |
| system-prompt/assemble 拦截（首轮 persona 替换 + 工具面收窄） | 不移植 | 无对应机制；persona 换不了，引导文本近似已覆盖目的 |
| GUI 预设选择器 / bundles 接管 | 不移植 | Claude Code 无此概念 |
| 首轮 RL 接口还原（standard 模式） | 不移植 | DSH 独有的 RL 训练接口形态，Claude Code 工具面固定 |
| 竞争带 / RL 接口等评测参数 | 不移植 | DSH 评测体系内部指标 |

## 顺序逻辑

1. **先 hook 注入器（批一）**：判定逻辑 + 引导文本一次落地，纯配置 + 单文件脚本，可即时回滚。
2. **再自优化闭环（批二）**：状态可查、决策闭合待非 Flash 模型。
3. **机制性组件全部排除**：与 Claude Code 架构冲突，移植成本无限大、收益为零。

## 验证缺口与前置条件

- [x] submodule 源码已获取（2026-08-17，S302 开启后克隆，Temp/dsh-routing-suite-src）——本文升级为源码级评估
- [x] 判定逻辑、引导文本、寒暄检测、分派规则均经源码逐行确认
- [x] 批一已落地并通过自动化验收（19/19 测试 + 5 项验收核对，2026-08-17）
- [ ] **P1-P30 数值为 DSH 环境实测**：模型同族（V4 Flash）但 harness 不同（system prompt 结构/工具面/缓存实现），hook 落地后需重新实测路由率/收敛率/缓存命中，不沿用原数值
- [ ] **真实会话观察**：/hooks 或重启后新会话发任务消息，确认引导注入生效且 /cost 观察缓存命中（引导文本字节稳定 = 缓存友好）
- [ ] **hook 干扰面评估**：hook 对所有会话（含非工程会话）注入英文引导，若出现过度注入（如长聊天被注入）用 isChatTask 之外的排除规则收紧
- [ ] docs/paper.md 与 experiments.md（P1-P30 全数据表）未全文精读，本轮结论由 README + 源码交叉印证，如需溯源单项数据再读

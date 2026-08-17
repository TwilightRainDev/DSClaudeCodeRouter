# DSHRoutingSuite 功能分析

> 分析日期：2026-08-17 | 项目路径：A:\work_zone\Resourse\dsh-routing-suite-main.zip
> 迁移目标参照：Claude Code（本机 ~/.claude/skills + hooks + agents 生态）
> 源码来源：2026-08-17 克隆 dsh-routing-suite（含三 submodule，浅克隆）至 A:\work_zone\Temp\dsh-routing-suite-src；
> submodule commit：injector=f4ef59f、preset=eff787e、mode-boost=a9a666a。
> 验证状态：本文关键结论经源码级验证（router-core.mjs / router-bootstrap.mjs / mode-boost lib/core.js / agent.cordis.yml），非仅 README 摘要。

## 项目是什么

dsh-routing-suite（GitHub yjh051108 开源，MIT）是 **DeepSeek Harness**（DSH，preset README 自述 "Task-aware reasoning-mode router for DeepSeek Harness"）的插件套装：「运行时注入器 + 思维模式路由预设」。一个仓库装齐两件事——先装注入器（免重启的运行时管理层），再用它装配 router-standard 预设（任务感知的思维模式路由，P1-P30 实测）。

实测环境：DeepSeek V4 Pro / V4 Flash，`reasoning_effort=max`，官方 API，n=2（mode-boost 数据为 2026-08-15 当日实测）。**本机 Claude Code 运行于 deepseek-v4-flash 中转，与 DSH 的 Flash 档同模型族——Flash 档实测结论对本机有直接参考价值。**

DSH 生态面（源码/README 确认）：cordis 插件体系（`dsh plugin --profile web add`、profile bundles、repository-plugin）、GUI 会话可选 agent-presets（`~/.dsh\.agent-presets\`，本套装即 agent-plane 组合文件）、官方 preset（minimal / standard / code 等）、prompt sections 组装机制（system-prompt/assemble）、LLM 路由（provider/model）、plan-mode section（plan 边界指令）。

**zip 是套装壳**：仅含 README.md / README.en.md / install.ps1 / .gitmodules（4 文件共 5.9KB），三个 submodule 未随 zip 打包；源码已另行克隆补齐。

## 组件全景

| 路径 | 仓库 | 版本 | 作用 |
|---|---|---|---|
| injector/ | dsh-super-injector | v0.3.3 | 运行时注入器：dev_* 工具全家桶（注入/热重载/侧挂转正/卸载/路由自愈）；"规范铁律 10 条"沉淀 |
| preset/ | dsh-router-standard | v0.3.0 | 思维模式路由预设：standard（RL 接口还原）/ spec（深度思考优先）；router-core 纯逻辑 + bootstrap 插件 |
| mode-boost/ | dsh-mode-boost | v0.1.0 | 模式提升插件（宿主平面，装配在官方 preset 之上）：deep-persona / boost 重分类 / 深度自适应分派；引导文本单一事实源 lib/core.js |

## 功能全景（按模块）

### 1. 注入器（dsh-super-injector v0.3.3，BepInEx 式运行时手术台）

DSH 平台机制（不移植面）：junction 链接插件包到 `~/.dsh/profiles/web/node_modules` → `ctx.loader.create` 运行时装配 → registry.json 持久化自动恢复；dev_* 工具 11 个（dev_inject_plugin / dev_uninject_plugin / dev_reload_package / dev_stage_* 侧挂转正 / dev_clear_routes 路由自愈 / dev_plugin_status 等）；自动 watch 约 1.5 秒热重载；首轮锚定 tool-bootstrap 过滤器（骨架自带）。

**规范铁律 10 条（README，实测沉淀）**——其中提示词工程 6 条与 Claude Code 直接相关：

| # | 铁律 | 实测依据 | Claude Code 相关性 |
|---|---|---|---|
| 4 | **缓存原则**：静态文本 + order 靠前（静态到头）；动态内容走消息尾；严禁动态拼接进 system——system 前缀任何动态变化 = 整个会话缓存全量 miss（缓存命中便宜 10 倍） | 提示词注入 | 直接适用（prompt caching 同机制） |
| 6 | **首轮锚定**：工具面大（≥5 个）时首轮只暴露最核心 1-2 个工具，首个 tool/call 后恢复全部；首轮请求结构决定整条会话策略轨迹 | V4 Pro 实测，anchored-standard Project2 98/99；minimal 99/96 vs standard 25 工具 91 | 思想适用（暴露面收窄），机制不适用（无动态工具 schema） |
| 7 | **工具 schema 精简**：description 短句，详解放 tool result / 静态引导；工具目录按字符计费进首轮 prefill，实测 6 插件可膨胀到 17.6 万字符 | 首轮 prefill 最贵 | 直接适用（本机技能描述一行化已验证） |
| 8 | **近距离信号原则（最强机制，P14/P16/P20）**：所有行为引导必须注入在**用户消息之后**（近距离）；同一指令放 system（远距离）会衰减甚至反向（P13 加速衰减、P20 深度段进 persona 路由崩到 67%）；固定文本保持缓存命中（92-94%） | P13/P14/P16/P20 | 直接适用（hook 注入用户消息侧 = 近距离） |
| 9 | **弱域内路由（P8/P11）**：任务类型模糊时用弱 persona（模型自分类），按模型选 persona（Pro=spec 句+few-shot，Flash=neutral+classify；同一 persona 两模型行为可相反） | P8/P11 | 适用（Ask 技能即弱域内路由） |
| 10 | **单任务长链路三锚（P22/P23）**：persona 静态锚「回顾已完成 + 信息足够就产出 + 禁止环境检查/穷举 grep」把开放任务完成率拉到 100% | P22/P23，完成率 0% → 100% | 直接适用（引导文本原样可用） |

### 2. router-standard 预设（v0.3.0，核心资产）

**双路由模式**（v0.2.0 命名，agent.cordis.yml 确认）：

| 模式 | 首轮行为 | 实测特征 |
|---|---|---|
| standard（默认） | RL 接口还原：首轮 system 只剩 RL 训练句（`You are a helpful software engineer assistant.`）+ shell/str_replace_editor 两工具 | 想一段做一段（25 步 / 24 工具调用 / 单步推理 ~3.9K） |
| spec | 分类 persona + 完整 prompt sections | 首轮超长思维链（101K 推理 0 行动是特征不是缺陷） |

**路由核心（router-core.mjs，零依赖纯逻辑，源码已验证）**：
- **四模式**：spec(0) / mixed(0.3 陷阱) / react(1) / weak（模型内路由）；实测三行为带——spec [0,0.15] 稳定、过渡带 [0.2,0.45] 不稳定避开、react [0.5,1.0] 稳定（21 模式点 × n=2）
- **Flash 阈值式行为**：V4 Flash 0-0.5 全 spec 侧，0.75+ 跳变
- **模型不能自路由**（P3/P5/P8）：唯一内部路由窗口是 weak persona + few-shot（lean 不 flip，区分度 +2.3..+3.3）；**模式选择必须来自外部**——本 preset 即自动化外部路由
- **personaFor(mode, modelId) 自动匹配**：Pro → w6c（spec 句 + 分类指令，无锚，P24 24/24=100%）；Flash → w7（neutral + 分类 + 回顾/反跑题锚 + 先深想，P11 区分度 +5.67，P23 单任务完成 100%）——**w7 文本即 WEAK_FLASH 常量，可直接取用**
- **classifyTask**：REACT_RE / SPEC_RE 关键词计数（build/创建/写一个… vs fix/修复/调试/重构…），计数相等 → weak
- **isComplexTask**：>120 字符或 COMPLEX_RE（重构/架构/全面/设计…）
- **applyPersona**：只替换 persona section，保留 plan-mode section（plan 边界不失忆）
- **首轮工具面**：spec=read/edit/glob/grep（读优先）、react=read/write/edit（写优先）、weak=str_replace_editor（RL 形状）；首个 tool/call 后放行全目录

**近距离引导实现（router-bootstrap.mjs，源码已验证）**：
- `session/event` 监听真实用户消息（source.kind === 'user'）→ 弱域会话 `inbox.append` 注入一条固定引导（GUIDE_WEAK / GUIDE_DEEP，按复杂度分派）
- **issue #3 修复**：首轮装配发生在首个 user/message 事件落盘之前，用 live text（firstUserText）预捕获，否则首轮误判 weak——首轮请求决定路径，不可错
- **深度自适应（v19/v20）**：简单任务 → GUIDE_WEAK（快速收敛）；复杂任务 → GUIDE_DEEP（"Think deeply about the architecture, edge cases, and integration points. Do not spend reasoning on the environment or tooling. Produce when your information is complete. End each reasoning block with a decision or an information need."，P30 深度 +12% 且收敛更快）
- **自优化工具**：dev_router_status（模式/带/persona/核心工具/覆盖态）/ dev_router_mode（spec|weak|mixed|react|0-100|auto）/ dev_mode_subagent（**fresh LLM call 模式隔离**——DSH 原生 subagent 继承 persona，会话中途换模式的唯一可靠方式是独立上下文）
- **测试**：router.test.mjs 11 个单测（零依赖，node:test）

### 3. mode-boost 插件（v0.1.0，引导文本单一事实源 lib/core.js 源码已验证）

**会话特征分派表**（首条消息 + preset 面判断）：

| 会话特征 | 动作 | 依据 |
|---|---|---|
| 寒暄/无任务（isChatTask，CHAT_RE 正则） | 整体让位：不换 persona、不注入引导 | deep persona 套聊天上 → 338 块长思维链（实测） |
| 编目含 dev_router_status（router preset 在场） | 整会话 no-op（防双重注入） | 共存守卫 |
| minimal 面 / cordis 创造模式面 | 只加引导，保留原 persona | 双平面归属、禁改官方安装 |
| standard / code(PTC) 面 | 全量：deep-persona 替换 + 首轮工具面收窄 + 引导注入 | 主战场 |

**A/B 同场实测（@1536 n=2）**：多轮交替路由 63%→94%（+31pp）、收敛 63%→88%（+25pp）、相关链路由 25%→42%（+17pp）、读连续性 −9pp（P21 读改问题仍开放）。

**引导文本集（GUIDE_* 常量，可直接移植）**：GUIDE_BASE（1-2 轮分类引导）/ GUIDE_BOOST（第 3 轮起："这是新任务，重新分类，勿沿用上轮风格" 反稀释，P19 路由 69%→88%）/ GUIDE_COMMIT（简单任务快速收敛尾）/ GUIDE_DEEP（复杂任务有向深思考尾）/ GUIDE_CLOSURE（**仅非 Flash 模型**——决策闭合对 Flash 实测中性）。

## 代码结构与入口（源码已验证）

| 符号/文件 | 位置 | 作用 |
|---|---|---|
| router-core.mjs（194 行） | preset/preset/router-standard/ | 路由纯逻辑：classifyTask / isComplexTask / personaFor / coreFor / bandOf / parseMode / applyPersona，零依赖可单测 |
| router-bootstrap.mjs（277 行） | 同上 | cordis 插件：system-prompt/assemble 拦截（首轮 persona + 工具面收窄）、session/event 近距离引导注入、dev_* 三工具 |
| agent.cordis.yml（291 行） | 同上 | 预设组合文件：persona 行 + router 行 + 全套工具 + plan-mode section 文本 |
| core.js（232 行） | mode-boost/lib/ | 引导文本单一事实源（GUIDE_* + WEAK_PRO/WEAK_FLASH + isChatTask/isComplexTask/guideFor） |
| router.test.mjs | preset/ | 11 个单测（分类/带/persona/plan-section 存活） |
| README.md | injector/ | 规范铁律 10 条 + 机制说明（junction/loader/registry.json） |
| docs/paper.md（340 行）+ experiments.md（275 行） | preset/docs/ | 理论 + P1-P30 全数据表（未全读，结论已由 README/源码交叉印证） |

## 对 Claude Code 的潜在价值判断

Claude Code 现状：本机已有 Ask 技能路由（weak 自分类 1% 规则）、WritePlan（spec 计划）、ExecutingPlans（react 执行）、SubagentDrivenDev（集体）、TDD、InterrogativeIdeation、hooks（settings.json 集中配置）、agents、计划模式与子代理原生支持。

- **高价值**：近距离引导机制（hook 注入固定文本，缓存命中，实测 92-94%）；w7/Flash persona 与 GUIDE_* 引导文本（**本机模型 deepseek-v4-flash 与 DSH Flash 档同族，文本原样可用**）；classifyTask/isComplexTask/isChatTask 判定逻辑（纯 JS 可移植 + 单测）；寒暄让位分派（防聊天场景注入）；三锚（回顾+收敛+反跑题）。
- **中价值**：决策闭合回路（但 Flash 实测中性，本机可跳过）；首轮锚定思想（验证"技能描述精简 + Ask 先路由"方向，机制不可搬）；缓存原则（校验现有技能/CLAUDE.md 引导放远距离会衰减的判断）。
- **低价值/不适配**：注入器本体（dev_* 注入/热重载/卸载/自愈是 cordis 平台机制）；system-prompt/assemble 拦截（无对应机制，persona 换不了，只能注入引导近似）；首轮工具面收窄（无动态工具 schema）；按模型分派（本机单一 Flash 模型，直接取 Flash 档即可）；GUI 预设选择器。

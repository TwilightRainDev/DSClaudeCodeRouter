/**
 * router-core: 任务感知思维模式路由的判定逻辑（零依赖）。
 *
 * 移植自 dsh-mode-boost/lib/core.js（v0.1.0，MIT）与 dsh-router-standard
 * 的 router-core.mjs —— 判定逻辑与引导文本逐行一致，改动文本即放弃
 * DSH 环境（DeepSeek V4 Pro/Flash, reasoning_effort=max, n=2）的实测背书。
 * 本机 Claude Code 运行 deepseek-v4-flash 中转，按 Flash 档分派。
 *
 * 用途：UserPromptSubmit hook 的近距离引导注入（详见 hook.js）。
 * 文本保持英文原文；行为说明见仓库论文 preset/docs/paper.md。
 */

// ── 模式常量（四模式：spec / mixed 陷阱 / react / weak 内路由）─────────────
const MODE_SPEC = 0
const MODE_MIXED = 0.3
const MODE_REACT = 1
const MODE_WEAK = 'weak'

// ── persona 文本（P11/P23/P24 实测最优，Flash 档为本机默认）────────────────
const SPEC_PERSONA = 'You are a helpful software engineer assistant.'

const MIXED_PERSONA =
  'You are a helpful software engineer assistant.\n'
  + 'Work directly: prefer writing or editing code over describing plans. '
  + 'Verify your changes by reading and running them.'

const REACT_PERSONA =
  'You are a hands-on software engineer who delivers working output fast.\n'
  + 'Work directly: write or edit code, then verify it by reading and running. '
  + 'Keep the loop tight — produce, verify, fix — and do not build test '
  + 'harnesses, scaffolding, or ceremony the user did not ask for. '
  + 'Finish with a usable deliverable and a short summary.'

/** weak 内路由 persona —— 按模型分档（本机为 Flash 档）：
 *  pro:   spec 句 + 分类指令（w6c，P24）
 *  flash: neutral + 分类 + 回顾/反跑题锚 + 先深想（w7，P11/P23/P20） */
const WEAK_PRO =
  'You are a helpful software engineer assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build → hands-on production; fix → inspect-and-plan.'

const WEAK_FLASH =
  'You are a helpful assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build → hands-on production; fix → inspect-and-plan.\n'
  + 'Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.\n'
  + 'Think deeply first, then produce.'

// ── 近距离引导文本（每条真实用户消息后注入一条，缓存中性）───────────────────

/** 第 1-2 轮基础引导：分类 + 采用匹配风格。 */
const GUIDE_BASE =
  '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first.'

/** 第 3 轮起：反稀释重分类（P19 boost：路由 69% → 88%）。 */
const GUIDE_BOOST =
  '\n\nRouter: this is a NEW task, different from the previous ones. Classify it fresh (build or fix) and adopt the matching style — build: direct production; fix: inspect-first. Do not follow the previous task\'s style.'

/** 简单任务快速收敛尾（P30：1 步零浪费）。 */
const GUIDE_COMMIT = ' Think deeply first, then commit and act.'

/** 复杂任务有向深思考尾（P30：深度 +12% 且收敛更快）。 */
const GUIDE_DEEP = ' Think deeply about the architecture, edge cases, and integration points. Do not spend reasoning on the environment or tooling. Produce when your information is complete.'

/** 决策闭合尾——仅非 Flash 模型（对 Flash 实测中性，本机不加）。 */
const GUIDE_CLOSURE = ' End each reasoning block with a decision or an information need.'

// ── 判定正则（与 dsh 源码逐字一致）──────────────────────────────────────────

/** 复杂度启发式：长文本或架构关键词 → 复杂任务。 */
const COMPLEX_RE = /(重构|架构|全面|详细|设计|系统|优化|分析|survey|overview|architecture|refactor|comprehensive|detailed|design|system|optimize|analyze)/i

/** 寒暄/无任务首条消息检测——命中则整体让位不注入
 *  （deep persona 套聊天上 → 338 块长思维链，实测事故）。 */
const CHAT_RE = /^(你好|您好|hello|hi|hey|嗨|哈喽|在吗|谢谢|感谢|thanks|thank you|早上好|下午好|晚上好|嗯|好|ok|okay|yes|no|嗯嗯|好的)[!。.!？?~～]*$/i

/** 构建类关键词（react 行为带）。 */
const REACT_RE = /(开发|创建|写一个|写|生成|从零|做|做一个|做个|游戏|网页|网站|构建|新项目|搭建|实现|做出|上线|落地|脚本|工具|应用|build|create|develop|generate|implement|write a|write an|build a|make a|new project)/gi

/** 修复类关键词（spec 行为带）。 */
const SPEC_RE = /(修复|修一下|调试|重构|维护|排查|报错|出错|崩溃|优化|审查|review|fix|debug|refactor|maintain|repair|broken|break|为什么|异常|故障|迁移|升级|兼容)/gi

function countHits(regex, text) {
  return [...text.matchAll(regex)].length
}

// ── 判定函数（纯逻辑，可单测）───────────────────────────────────────────────

/** 任务分类：关键词计数定行为带；计数相等或无证据 → weak（模型自分类）。 */
function classifyTask(text) {
  const react = countHits(REACT_RE, text)
  const spec = countHits(SPEC_RE, text)
  if (react > spec) return MODE_REACT
  if (spec > react) return MODE_SPEC
  return MODE_WEAK
}

/** 复杂度：>120 字符或架构关键词。 */
function isComplexTask(text) {
  return typeof text === 'string' && (text.length > 120 || COMPLEX_RE.test(text))
}

/** 聊天检测：寒暄/空/短句无任务关键词 → 让位不注入。 */
function isChatTask(text) {
  if (typeof text !== 'string') return true
  const t = text.trim()
  if (t.length === 0) return true
  if (CHAT_RE.test(t)) return true
  if (t.length > 24) return false
  return !t.match(REACT_RE) && !t.match(SPEC_RE)
}

/** Flash 族模型识别（本机 deepseek-v4-flash 命中）。 */
function isFlashModel(modelId) {
  return typeof modelId === 'string' && /flash/i.test(modelId)
}

/** 模式量化到四行为带（21 点实测：过渡带 [0.2, 0.5) 是陷阱，自动选择永不触碰）。 */
function bandOf(mode) {
  if (mode === MODE_WEAK) return 'weak'
  const m = clamp01(mode)
  if (m < 0.2) return 'spec'
  if (m < 0.5) return 'transition'
  return 'react'
}

/** 模式对应 persona；weak 按模型分档。 */
function personaFor(mode, modelId) {
  switch (bandOf(mode)) {
    case 'spec': return SPEC_PERSONA
    case 'transition': return MIXED_PERSONA
    case 'weak': return isFlashModel(modelId) ? WEAK_FLASH : WEAK_PRO
    default: return REACT_PERSONA
  }
}

/** 引导分派：轮次（第 3 轮起 boost 重分类）× 复杂度 × 模型。 */
function guideFor(round, text, modelId) {
  const base = round >= 3 ? GUIDE_BOOST : GUIDE_BASE
  if (!isComplexTask(text)) return base + GUIDE_COMMIT
  const deep = base + GUIDE_DEEP
  return isFlashModel(modelId) ? deep : deep + GUIDE_CLOSURE
}

/** 模式 token 解析：band 名 / 0-100 / 0.0-1.0 / auto。 */
function parseMode(token) {
  if (token === undefined || token === null) return null
  const t = String(token).trim().toLowerCase()
  if (t === 'auto') return 'auto'
  if (t === 'weak' || t === 'router') return MODE_WEAK
  if (t === 'spec' || t === 'spec-lean') return MODE_SPEC
  if (t === 'balanced' || t === 'mixed') return MODE_MIXED
  if (t === 'react' || t === 'react-lean') return MODE_REACT
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  if (t.includes('.')) return clamp01(n)
  return clamp01(n / 100)
}

function clamp01(v) {
  return Math.min(1, Math.max(0, Number(v) || 0))
}

module.exports = {
  MODE_SPEC, MODE_MIXED, MODE_REACT, MODE_WEAK,
  GUIDE_BASE, GUIDE_BOOST, GUIDE_COMMIT, GUIDE_DEEP, GUIDE_CLOSURE,
  WEAK_PRO, WEAK_FLASH,
  classifyTask, isComplexTask, isChatTask, isFlashModel, bandOf,
  personaFor, guideFor, parseMode,
}

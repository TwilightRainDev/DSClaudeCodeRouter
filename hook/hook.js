#!/usr/bin/env node
/**
 * hook.js — UserPromptSubmit 近距离引导注入（移植自 dsh-router-standard /
 * dsh-mode-boost 实测机制，MIT）。
 *
 * 行为（与 DSH weak 域逐条对应）：
 *   - 寒暄/无任务（isChatTask）→ 让位不注入（防 338 块长思维链事故）
 *   - 真实任务消息 → 注入一条固定引导（近距离，缓存中性）：
 *       第 1-2 轮 GUIDE_BASE；第 3 轮起 GUIDE_BOOST（反稀释重分类）；
 *       简单任务 +GUIDE_COMMIT；复杂任务 +GUIDE_DEEP
 *   - 本机模型 deepseek-v4-flash（Flash 档）：不加决策闭合尾
 *   - 任何错误兜底 allow（绝不阻塞用户消息）
 *
 * 用法（settings.json）：
 *   "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command",
 *     "command": "node \"C:\\Users\\hxdn\\.claude\\hooks\\router\\hook.js\"",
 *     "timeout": 10 }] }] }
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
  isChatTask, isComplexTask, classifyTask, guideFor,
} = require('./router-core.js')

const MODEL_ID = process.env.ROUTER_MODEL || 'deepseek-v4-flash'
const stateDir = process.env.ROUTER_STATE_DIR || path.join(__dirname, 'state')
const ACTIVITY_MAX_LINES = Number(process.env.ACTIVITY_MAX_LINES || 1000)
const activityFile = path.join(stateDir, 'activity.jsonl')

// Claude Code 2.x：UserPromptSubmit 的 decision 枚举为 approve|block
// （allow 是 PreToolUse permissionDecision 的取值，用在这是 (root) 校验失败）
const ALLOW = { decision: 'approve' }

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'))
  } catch {
    return null
  }
}

/** 活动日志（/router-status 数据源）：注入一次记一条，行数上限截断保留尾部。 */
function logActivity(sessionId, round, text) {
  try {
    fs.mkdirSync(stateDir, { recursive: true })
    const mode = classifyTask(text)
    const entry = JSON.stringify({
      ts: Date.now(),
      session: sessionId || '(none)',
      round,
      mode: mode === 1 ? 'react' : mode === 0 ? 'spec' : 'weak',
      complex: isComplexTask(text),
      boost: round >= 3,
    })
    let lines = []
    try {
      lines = fs.readFileSync(activityFile, 'utf8').trim().split('\n').filter(Boolean)
    } catch { /* 首次写入 */ }
    lines.push(entry)
    if (lines.length > ACTIVITY_MAX_LINES) lines = lines.slice(-ACTIVITY_MAX_LINES)
    fs.writeFileSync(activityFile, lines.join('\n') + '\n', 'utf8')
  } catch { /* 日志失败不阻塞注入 */ }
}

/** 会话轮次计数（boost 重分类依据）。读失败按 0 计，写失败不阻塞注入。 */
function nextRound(sessionId) {
  if (!sessionId) return 1
  const file = path.join(stateDir, `${String(sessionId).replace(/[^\w-]/g, '_')}.json`)
  let round = 1
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'))
    round = (Number(state.round) || 0) + 1
  } catch { /* 首次调用或文件缺失 */ }
  try {
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ round }), 'utf8')
  } catch { /* 状态写失败不阻塞 */ }
  return round
}

function main() {
  const input = readStdin()
  if (!input || typeof input.prompt !== 'string') {
    process.stdout.write(JSON.stringify(ALLOW))
    return
  }
  const text = input.prompt.trim()
  if (!text || isChatTask(text)) {
    process.stdout.write(JSON.stringify(ALLOW))
    return
  }
  const round = nextRound(input.session_id)
  logActivity(input.session_id, round, text)
  const guide = guideFor(round, text, MODEL_ID)
  // Claude Code 2.x schema：additionalContext 必须在 hookSpecificOutput 内
  // （顶层 additionalContext 会被 "Hook JSON output validation failed" 拒绝）
  process.stdout.write(JSON.stringify({
    decision: 'approve',
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: guide,
    },
  }))
}

try {
  main()
} catch {
  // 兜底：任何异常都不阻塞用户消息
  process.stdout.write(JSON.stringify(ALLOW))
}

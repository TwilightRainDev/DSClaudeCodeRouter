/**
 * hook.js 集成测试：spawn 子进程，真实 stdin/stdout 管道（模拟 Claude Code
 * UserPromptSubmit hook 调用）。状态目录经 ROUTER_STATE_DIR 指向测试目录。
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const HOOK = path.join(__dirname, 'hook.js')
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-hook-test-'))

function runHook(input) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ROUTER_STATE_DIR: stateDir },
  })
  assert.equal(res.status, 0, `hook exited ${res.status}: ${res.stderr}`)
  return JSON.parse(res.stdout)
}

test('寒暄消息 -> allow 且不注入引导', () => {
  const out = runHook({ session_id: 't-chat', prompt: '你好' })
  assert.equal(out.decision, 'approve')
  assert.equal(out.hookSpecificOutput, undefined)
})

test('任务消息 -> allow 且注入近距离引导（含分类指令）', () => {
  const out = runHook({ session_id: 't-task', prompt: '帮我修复这个报错' })
  assert.equal(out.decision, 'approve')
  assert.ok(out.hookSpecificOutput?.additionalContext.includes('classify this task (build or fix)'))
  // Flash 模型：复杂任务不加决策闭合
  assert.ok(!out.hookSpecificOutput?.additionalContext.includes('decision or an information need'))
})

test('同一会话第 3 轮起 -> boost 重分类引导（NEW task）', () => {
  runHook({ session_id: 't-round', prompt: '帮我开发一个工具' })
  runHook({ session_id: 't-round', prompt: '再写个脚本' })
  const out = runHook({ session_id: 't-round', prompt: '帮我重构一下' })
  assert.ok(out.hookSpecificOutput?.additionalContext.includes('NEW task'))
})

test('复杂任务 -> 有向深思考引导（architecture）', () => {
  const out = runHook({ session_id: 't-deep', prompt: '帮我重构这个系统的架构，做全面分析' })
  assert.ok(out.hookSpecificOutput?.additionalContext.includes('architecture, edge cases, and integration points'))
})

test('缺失 prompt 字段 -> 兜底 allow 不崩溃', () => {
  const out = runHook({ session_id: 't-null' })
  assert.equal(out.decision, 'approve')
  assert.equal(out.hookSpecificOutput, undefined)
})

test('非 JSON stdin -> 兜底 allow 不崩溃', () => {
  const res = spawnSync(process.execPath, [HOOK], {
    input: 'not json at all',
    encoding: 'utf8',
    env: { ...process.env, ROUTER_STATE_DIR: stateDir },
  })
  assert.equal(res.status, 0)
  const out = JSON.parse(res.stdout)
  assert.equal(out.decision, 'approve')
})

test('每轮引导文本字节级稳定（同轮次同输入 -> 同输出）', () => {
  const a = runHook({ session_id: 't-stable-a', prompt: '帮我写个脚本' })
  const b = runHook({ session_id: 't-stable-b', prompt: '帮我写个脚本' })
  assert.equal(a.hookSpecificOutput.additionalContext, b.hookSpecificOutput.additionalContext)
})

test('空 prompt -> 不注入', () => {
  const out = runHook({ session_id: 't-empty', prompt: '' })
  assert.equal(out.hookSpecificOutput, undefined)
})

// ── 活动日志（router-status 数据源）────────────────────────────────────────

function activityLines() {
  const file = path.join(stateDir, 'activity.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
}

test('任务消息注入 -> activity.jsonl 记录本会话一条（含 mode/round/complex）', () => {
  runHook({ session_id: 't-log-1', prompt: '帮我修复这个报错' })
  const mine = activityLines().filter((l) => l.session === 't-log-1')
  assert.equal(mine.length, 1)
  assert.equal(mine[0].round, 1)
  assert.equal(mine[0].mode, 'spec') // 修复类关键词 -> spec 带
  assert.equal(mine[0].complex, false)
  assert.equal(mine[0].boost, false)
  assert.ok(typeof mine[0].ts === 'number')
})

test('寒暄消息 -> 不记录活动日志', () => {
  const before = activityLines().length
  runHook({ session_id: 't-log-2', prompt: '你好' })
  assert.equal(activityLines().length, before)
})

test('同会话轮次推进 -> round 递增，第 3 轮 boost=true', () => {
  runHook({ session_id: 't-log-3', prompt: '写个脚本' })
  runHook({ session_id: 't-log-3', prompt: '再写一个' })
  runHook({ session_id: 't-log-3', prompt: '继续写' })
  const mine = activityLines().filter((l) => l.session === 't-log-3')
  assert.deepEqual(mine.map((l) => l.round), [1, 2, 3])
  assert.equal(mine[2].boost, true)
})

test('复杂任务 -> complex=true', () => {
  runHook({ session_id: 't-log-4', prompt: '帮我重构整个系统的架构设计' })
  const mine = activityLines().filter((l) => l.session === 't-log-4').at(-1)
  assert.equal(mine.complex, true)
  assert.equal(mine.mode, 'spec')
})

test('活动日志行数上限截断（ACTIVITY_MAX_LINES）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-hook-cap-'))
  const run = (p) => spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ session_id: 't-cap', prompt: p }),
    encoding: 'utf8',
    env: { ...process.env, ROUTER_STATE_DIR: dir, ACTIVITY_MAX_LINES: '3' },
  })
  for (let i = 0; i < 5; i++) run(`写个脚本 ${i}`)
  const lines = fs.readFileSync(path.join(dir, 'activity.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(JSON.parse)
  assert.equal(lines.length, 3) // 只保留最新 3 条（round 3/4/5）
  assert.equal(lines[0].round, 3)
  assert.equal(lines.at(-1).round, 5)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('终止：清理测试状态目录', () => {
  fs.rmSync(stateDir, { recursive: true, force: true })
})

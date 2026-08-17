/**
 * router-core tests — 移植自 dsh-router-standard / dsh-mode-boost（MIT）。
 * 行为目标：与 DSH 源码逐行一致的判定逻辑；本机环境为 deepseek-v4-flash
 * （Flash 档），guideFor 默认按 Flash 分派。
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  classifyTask, isComplexTask, isChatTask, bandOf, personaFor, parseMode,
  guideFor, isFlashModel,
} = require('./router-core.js')

test('classifyTask: 构建类关键词计数多 -> react(1)', () => {
  assert.equal(classifyTask('帮我开发一个网页游戏'), 1)
  assert.equal(classifyTask('从零构建一个新项目，写一个工具脚本'), 1)
  assert.equal(classifyTask('build a new app from scratch'), 1)
})

test('classifyTask: 修复类关键词计数多 -> spec(0)', () => {
  assert.equal(classifyTask('帮我修复这个报错，排查一下崩溃原因'), 0)
  assert.equal(classifyTask('重构这段代码并优化性能'), 0)
  assert.equal(classifyTask('fix this bug and debug the crash'), 0)
})

test('classifyTask: 无关键词或计数相等 -> weak（模型自分类）', () => {
  assert.equal(classifyTask('帮我看看这个'), 'weak')
  assert.equal(classifyTask('这个项目怎么样？'), 'weak')
  // 关键词计数相等（1 build vs 1 fix）
  assert.equal(classifyTask('帮我生成一个脚本，然后修复报错'), 'weak')
})

test('isComplexTask: >120 字符或架构关键词 -> 复杂', () => {
  assert.equal(isComplexTask('x'.repeat(121)), true)
  assert.equal(isComplexTask('x'.repeat(119)), false)
  assert.equal(isComplexTask('帮我重构这个系统的架构，做全面分析'), true)
  assert.equal(isComplexTask('review the architecture and design'), true)
  assert.equal(isComplexTask('帮我改个变量名'), false)
})

test('isChatTask: 寒暄/无任务短句 -> 聊天（不注入）', () => {
  assert.equal(isChatTask('你好'), true)
  assert.equal(isChatTask('hello'), true)
  assert.equal(isChatTask('谢谢！'), true)
  assert.equal(isChatTask('在吗'), true)
  assert.equal(isChatTask('ok'), true)
  assert.equal(isChatTask('嗯嗯'), true)
  assert.equal(isChatTask(''), true)
  assert.equal(isChatTask('   '), true)
  // 短句含任务关键词 -> 不是聊天（dsh 关键词表；'修bug' 因无 'bug' 关键词
  // 会被判聊天，此为 dsh 原版行为，移植保持逐字一致）
  assert.equal(isChatTask('修一下'), false)
  assert.equal(isChatTask('写个脚本'), false)
  // 长句（>24 字符）-> 不是聊天（无关键词的短句按 dsh 原版判定为聊天）
  assert.equal(isChatTask('帮我把这个项目的所有依赖和文件都梳理一遍，看看结构和内容上有什么问题'), false)
})

test('bandOf: 数值量化到三行为带', () => {
  assert.equal(bandOf(0), 'spec')
  assert.equal(bandOf(0.19), 'spec')
  assert.equal(bandOf(0.3), 'transition')
  assert.equal(bandOf(0.49), 'transition')
  assert.equal(bandOf(0.5), 'react')
  assert.equal(bandOf(1), 'react')
  assert.equal(bandOf('weak'), 'weak')
})

test('parseMode: 名字/数值/百分比 -> 模式值', () => {
  assert.equal(parseMode('spec'), 0)
  assert.equal(parseMode('react'), 1)
  assert.equal(parseMode('weak'), 'weak')
  assert.equal(parseMode('router'), 'weak')
  assert.equal(parseMode('balanced'), 0.3)
  assert.equal(parseMode('mixed'), 0.3)
  assert.equal(parseMode('auto'), 'auto')
  assert.equal(parseMode('50'), 0.5)
  assert.equal(parseMode('0.7'), 0.7)
  assert.equal(parseMode('garbage'), null)
  assert.equal(parseMode(undefined), null)
})

test('isFlashModel: flash 族识别', () => {
  assert.equal(isFlashModel('deepseek-v4-flash'), true)
  assert.equal(isFlashModel('DeepSeek V4 Flash'), true)
  assert.equal(isFlashModel('deepseek-v4-pro'), false)
})

test('personaFor: weak + Flash -> w7 文本（含三锚），weak + Pro -> w6c', () => {
  const flash = personaFor('weak', 'deepseek-v4-flash')
  assert.ok(flash.includes('decide the task type (build or fix)'))
  assert.ok(flash.includes('review what you have already done'))
  assert.ok(flash.includes('Do not run environment checks'))
  assert.ok(flash.includes('Think deeply first, then produce'))
  const pro = personaFor('weak', 'deepseek-v4-pro')
  assert.ok(pro.includes('decide the task type'))
  assert.ok(!pro.includes('Think deeply first'))
  assert.equal(personaFor(0, 'deepseek-v4-flash'), 'You are a helpful software engineer assistant.')
})

test('guideFor: 轮次/复杂度/模型分派', () => {
  // 第 1-2 轮 + 简单任务 -> 基础分类 + 快速收敛尾
  const g1 = guideFor(1, '写个脚本', 'deepseek-v4-flash')
  assert.ok(g1.includes('classify this task (build or fix)'))
  assert.ok(g1.includes('commit and act'))
  assert.ok(!g1.includes('architecture'))
  // 第 3 轮起 -> boost 重分类（勿沿用上轮风格）
  const g3 = guideFor(3, '写个脚本', 'deepseek-v4-flash')
  assert.ok(g3.includes('NEW task'))
  assert.ok(!g3.includes('classify this task'))
  // 复杂任务 -> 有向深思考；Flash 不加决策闭合
  const gDeep = guideFor(1, '帮我重构这个系统的架构，做全面分析', 'deepseek-v4-flash')
  assert.ok(gDeep.includes('architecture, edge cases, and integration points'))
  assert.ok(!gDeep.includes('decision or an information need'))
  // 非 Flash 复杂任务 -> 加决策闭合
  const gDeepPro = guideFor(1, '帮我重构这个系统的架构，做全面分析', 'deepseek-v4-pro')
  assert.ok(gDeepPro.includes('decision or an information need'))
  // 复杂任务 boost 轮
  const gDeep3 = guideFor(3, '帮我重构这个系统的架构', 'deepseek-v4-flash')
  assert.ok(gDeep3.includes('NEW task'))
  assert.ok(gDeep3.includes('architecture'))
})

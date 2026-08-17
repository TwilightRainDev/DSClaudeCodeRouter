# DSClaudeCodeRouter 一键安装（Windows PowerShell）
# 1) 复制 hook 到 ~/.claude/hooks/router
# 2) 复制 /router-status 命令到 ~/.claude/commands
# 3) 输出 settings.json 接线指引（不修改用户配置）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '=== [1/2] 安装 hook ===' -ForegroundColor Cyan
$hookTarget = Join-Path $env:USERPROFILE '.claude\hooks\router'
if (Test-Path (Join-Path $hookTarget 'hook.js')) {
  Write-Host "[WARN] $hookTarget 已存在，未覆盖（如需重装请先手动删除）" -ForegroundColor Yellow
} else {
  New-Item -ItemType Directory -Force -Path $hookTarget | Out-Null
  Copy-Item -Force (Join-Path $root 'hook\*') $hookTarget
  Write-Host "[OK] hook 已安装：$hookTarget" -ForegroundColor Green
}

Write-Host '=== [2/2] 安装 /router-status 命令 ===' -ForegroundColor Cyan
$cmdTarget = Join-Path $env:USERPROFILE '.claude\commands\router-status.md'
if (Test-Path $cmdTarget) {
  Write-Host "[WARN] $cmdTarget 已存在，未覆盖" -ForegroundColor Yellow
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $cmdTarget) | Out-Null
  Copy-Item -Force (Join-Path $root 'commands\router-status.md') $cmdTarget
  Write-Host "[OK] 命令已安装：$cmdTarget" -ForegroundColor Green
}

Write-Host '=== 接线指引 ===' -ForegroundColor Cyan
Write-Host '1. 在 ~/.claude/settings.json 的 "hooks" 中加入：' -ForegroundColor Yellow
Write-Host "   `"UserPromptSubmit`": [{ `"hooks`": [{ `"type`": `"command`", `"command`": `"node \`"$hookTarget\hook.js\`"`", `"timeout`": 10 }] }]" -ForegroundColor Gray
Write-Host '2. 会话内输入 /hooks 重载配置，或重启 Claude Code' -ForegroundColor Yellow
Write-Host '3. 验证：发一条含"修复/开发"关键词的消息，/router-status 应出现注入记录' -ForegroundColor Yellow

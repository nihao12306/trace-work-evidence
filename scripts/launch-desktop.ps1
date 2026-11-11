$ErrorActionPreference = 'Stop'
$traceRoot = Split-Path -Parent $PSScriptRoot
$traceUrl = 'http://127.0.0.1:4173/records'

function Test-TraceService($uri) {
  try {
    $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch { return $false }
}

try {
  $nodePath = (Get-Command node -ErrorAction Stop).Source
  $logDirectory = Join-Path $env:LOCALAPPDATA 'Trace/logs'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  if (-not $env:TRACE_CODEX_HOME) {
    $env:TRACE_CODEX_HOME = Join-Path $env:USERPROFILE '.codex'
  }
  $localFeishu = Join-Path (Split-Path -Parent $traceRoot) 'feishu_exports'
  if (-not $env:TRACE_FEISHU_EXPORT_DIR -and (Test-Path -LiteralPath $localFeishu)) {
    $env:TRACE_FEISHU_EXPORT_DIR = $localFeishu
  }
  if (-not (Test-TraceService 'http://127.0.0.1:43817/health')) {
    Start-Process -FilePath $nodePath -ArgumentList 'companion/server.mjs' -WorkingDirectory $traceRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'companion.out.log') -RedirectStandardError (Join-Path $logDirectory 'companion.err.log')
  }
  if (-not (Test-TraceService $traceUrl)) {
    Start-Process -FilePath $nodePath -ArgumentList 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort' -WorkingDirectory $traceRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'web.out.log') -RedirectStandardError (Join-Path $logDirectory 'web.err.log')
  }
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Test-TraceService $traceUrl) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Trace 启动失败。请查看日志：$logDirectory" }
  Start-Process $traceUrl
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Trace 启动失败') | Out-Null
  exit 1
}

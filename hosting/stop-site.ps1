$ErrorActionPreference = "Stop"

$pidPath = Join-Path $PSScriptRoot "site-server.pid"

if (-not (Test-Path $pidPath)) {
  Write-Host "No running Goal Tracker server was found."
  exit 0
}

$serverPid = Get-Content $pidPath -ErrorAction SilentlyContinue
if (-not $serverPid) {
  Remove-Item $pidPath -ErrorAction SilentlyContinue
  Write-Host "No running Goal Tracker server was found."
  exit 0
}

$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $serverPid
  Write-Host "Stopped Goal Tracker server (PID $serverPid)."
} else {
  Write-Host "The previous Goal Tracker server process was not running."
}

Remove-Item $pidPath -ErrorAction SilentlyContinue

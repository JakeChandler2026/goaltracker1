param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

$hostingRoot = $PSScriptRoot
$serverScript = Join-Path $hostingRoot "local-static-server.ps1"
$siteRoot = (Resolve-Path (Join-Path $hostingRoot "..")).Path
$pidPath = Join-Path $hostingRoot "site-server.pid"

if (Test-Path $pidPath) {
  $existingPid = Get-Content $pidPath -ErrorAction SilentlyContinue
  if ($existingPid) {
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existingProcess) {
      Write-Host "Goal Tracker is already running at http://localhost:$Port/"
      exit 0
    }
  }
  Remove-Item $pidPath -ErrorAction SilentlyContinue
}

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$serverScript`"",
  "-SitePath", "`"$siteRoot`"",
  "-Port", "$Port",
  "-PidFile", "`"$pidPath`""
)

$argumentString = $arguments -join " "
& cmd.exe /c "start ""Goal Tracker Host"" /min powershell.exe $argumentString" | Out-Null

$startedPid = $null
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  if (Test-Path $pidPath) {
    $startedPid = Get-Content $pidPath -ErrorAction SilentlyContinue
    if ($startedPid) {
      break
    }
  }
}

if ($startedPid -and (Get-Process -Id $startedPid -ErrorAction SilentlyContinue)) {
  Write-Host "Goal Tracker started at http://localhost:$Port/"
  Write-Host "PID: $startedPid"
} else {
  throw "The site server did not stay running."
}

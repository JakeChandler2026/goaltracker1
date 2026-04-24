param(
  [int]$Port = 8080,
  [string]$BrowserPath = "",
  [string]$NodePath = "",
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$serverScript = Join-Path $PSScriptRoot "local-static-server.ps1"
$pidPath = Join-Path $PSScriptRoot "site-server.pid"
$testScript = Join-Path $projectRoot "tests\e2e-harness.js"
$bundledNodeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node"
$bundledNodeExe = Join-Path $bundledNodeRoot "bin\node.exe"
$bundledNodeModules = Join-Path $bundledNodeRoot "node_modules"

function Find-Browser {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    if (Test-Path $ExplicitPath) {
      return (Resolve-Path $ExplicitPath).Path
    }
    throw "BrowserPath was provided but not found: $ExplicitPath"
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  foreach ($command in @("chrome.exe", "msedge.exe", "chromium.exe")) {
    $resolved = Get-Command $command -ErrorAction SilentlyContinue
    if ($resolved) {
      return $resolved.Source
    }
  }

  throw "Could not find Chrome, Edge, or Chromium. Pass -BrowserPath with the browser executable path."
}

function Find-Node {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    if (Test-Path $ExplicitPath) {
      return (Resolve-Path $ExplicitPath).Path
    }
    throw "NodePath was provided but not found: $ExplicitPath"
  }

  if (Test-Path $bundledNodeExe) {
    return (Resolve-Path $bundledNodeExe).Path
  }

  $resolved = Get-Command "node.exe" -ErrorAction SilentlyContinue
  if ($resolved) {
    return $resolved.Source
  }

  throw "Could not find Node.js. Pass -NodePath with the node.exe path."
}

function Ensure-Server {
  param([int]$ServerPort)

  if (Test-Path $pidPath) {
    $existingPid = Get-Content $pidPath -ErrorAction SilentlyContinue
    if ($existingPid) {
      $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
      if ($existingProcess) {
        Write-Output "Goal Tracker is already running at http://localhost:$ServerPort/"
        return
      }
    }
    Remove-Item $pidPath -ErrorAction SilentlyContinue
  }

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$serverScript`"",
    "-SitePath", "`"$projectRoot`"",
    "-Port", "$ServerPort",
    "-PidFile", "`"$pidPath`""
  )

  Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Minimized | Out-Null

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
    Write-Output "Goal Tracker started at http://localhost:$ServerPort/"
    Write-Output "PID: $startedPid"
    return
  }

  throw "The site server did not stay running."
}

if (-not $OutputPath) {
  $OutputPath = Join-Path $projectRoot "chrome-test-output.html"
}

Ensure-Server -ServerPort $Port

$browser = Find-Browser -ExplicitPath $BrowserPath
$node = Find-Node -ExplicitPath $NodePath
$env:E2E_URL = "http://localhost:$Port/test-harness.html"
$env:E2E_OUTPUT_PATH = $OutputPath
$env:E2E_BROWSER_PATH = $browser

if (Test-Path $bundledNodeModules) {
  $env:NODE_PATH = $bundledNodeModules
}

& $node $testScript

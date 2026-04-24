param(
  [string]$SitePath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$Port = 8080,
  [string]$HostName = "localhost",
  [string]$PidFile = ""
)

$ErrorActionPreference = "Stop"

function Get-ContentType {
  param([string]$Path)

  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".js" { "application/javascript; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".svg" { "image/svg+xml" }
    ".ico" { "image/x-icon" }
    ".txt" { "text/plain; charset=utf-8" }
    default { "application/octet-stream" }
  }
}

function Write-HttpResponse {
  param(
    [Parameter(Mandatory = $true)] [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType = "text/plain; charset=utf-8"
  )

  if ($null -eq $Body) {
    $Body = [byte[]]::new(0)
  }

  $headerText = @(
    "HTTP/1.1 $StatusCode $StatusText",
    "Content-Type: $ContentType",
    "Content-Length: $($Body.Length)",
    "Connection: close",
    ""
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes("$headerText`r`n")
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
  $Stream.Flush()
}

if (-not (Test-Path $SitePath)) {
  throw "Site path not found: $SitePath"
}

$resolvedSitePath = (Resolve-Path $SitePath).Path
if ($PidFile) {
  $PID | Set-Content -Path $PidFile
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

Write-Host "Goal Tracker is running at http://${HostName}:$Port/"
Write-Host "Serving files from $resolvedSitePath"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()

    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()

      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        $client.Close()
        continue
      }

      while ($reader.ReadLine() -ne "") { }

      $parts = $requestLine.Split(" ")
      if ($parts.Length -lt 2) {
        Write-HttpResponse -Stream $stream -StatusCode 400 -StatusText "Bad Request" -Body ([System.Text.Encoding]::UTF8.GetBytes("Bad request."))
        $client.Close()
        continue
      }

      $method = $parts[0].ToUpperInvariant()
      $rawPath = [System.Uri]::UnescapeDataString($parts[1].Split("?")[0].TrimStart("/"))

      if ($method -ne "GET" -and $method -ne "HEAD") {
        Write-HttpResponse -Stream $stream -StatusCode 405 -StatusText "Method Not Allowed" -Body ([System.Text.Encoding]::UTF8.GetBytes("Method not allowed."))
        $client.Close()
        continue
      }

      if ([string]::IsNullOrWhiteSpace($rawPath)) {
        $rawPath = "index.html"
      }

      $candidatePath = Join-Path $resolvedSitePath $rawPath
      try {
        $resolvedCandidate = [System.IO.Path]::GetFullPath($candidatePath)
      } catch {
        Write-HttpResponse -Stream $stream -StatusCode 400 -StatusText "Bad Request" -Body ([System.Text.Encoding]::UTF8.GetBytes("Invalid path."))
        $client.Close()
        continue
      }

      if (-not $resolvedCandidate.StartsWith($resolvedSitePath, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-HttpResponse -Stream $stream -StatusCode 403 -StatusText "Forbidden" -Body ([System.Text.Encoding]::UTF8.GetBytes("Forbidden."))
        $client.Close()
        continue
      }

      if ((Test-Path $resolvedCandidate) -and (Get-Item $resolvedCandidate).PSIsContainer) {
        $resolvedCandidate = Join-Path $resolvedCandidate "index.html"
      }

      if (-not (Test-Path $resolvedCandidate)) {
        Write-HttpResponse -Stream $stream -StatusCode 404 -StatusText "Not Found" -Body ([System.Text.Encoding]::UTF8.GetBytes("Not found."))
        $client.Close()
        continue
      }

      $bytes = if ($method -eq "HEAD") { [byte[]]::new(0) } else { [System.IO.File]::ReadAllBytes($resolvedCandidate) }
      Write-HttpResponse -Stream $stream -StatusCode 200 -StatusText "OK" -Body $bytes -ContentType (Get-ContentType -Path $resolvedCandidate)
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}

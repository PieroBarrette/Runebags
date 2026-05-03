$ErrorActionPreference = "Stop"

$port = 8080
$url = "http://127.0.0.1:$port"
$root = Join-Path $PSScriptRoot ".."

Write-Host "Starting RuneBags online-ready server at $url" -ForegroundColor Cyan

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm was not found on PATH." -ForegroundColor Red
  Write-Host "Install Node.js and run this script again." -ForegroundColor Yellow
  exit 1
}

Push-Location $root

if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Host "Installing dependencies..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "Failed to install dependencies." -ForegroundColor Red
    exit 1
  }
}

try {
  Start-Process $url
  npm run start:server
  exit 0
} finally {
  Pop-Location
}

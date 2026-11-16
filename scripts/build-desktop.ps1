# Builds the Miston Windows desktop executable (portable .exe).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $root 'desktop'

Write-Host '==> Building server and client...'
Push-Location $root
$env:VITE_BASE_PATH = '/'
$env:VITE_API_URL = ''
try {
  npm run build
} finally {
  Remove-Item Env:VITE_BASE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host '==> Copying build output into desktop app...'
New-Item -ItemType Directory -Force (Join-Path $desktop 'server') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $desktop 'client') | Out-Null
Copy-Item -Recurse -Force (Join-Path $root 'server\dist\*') (Join-Path $desktop 'server')
Copy-Item -Recurse -Force (Join-Path $root 'client\dist\*') (Join-Path $desktop 'client')
Remove-Item -Recurse -Force (Join-Path $desktop 'database') -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force (Join-Path $root 'database') (Join-Path $desktop 'database')

Write-Host '==> Installing desktop dependencies...'
Push-Location $desktop
try {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

  Write-Host '==> Packaging portable exe...'
  npm run build:win
  if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }
} finally {
  Pop-Location
}

Write-Host "==> Done. EXE: $desktop\release"

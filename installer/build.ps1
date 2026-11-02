<#
  Builds the installer: dist\Transcriptor-Setup-<version>.exe and its .sha256.
  The version comes from package.json.
  Usage:  powershell -ExecutionPolicy Bypass -File installer\build.ps1
  It only writes to the repo's out\ and dist\ folders.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root

# npm doesn't run install scripts by default: download the binaries the app needs.
if (-not (Test-Path -LiteralPath 'node_modules\electron\dist\electron.exe')) { node node_modules\electron\install.js }
if (-not (Test-Path -LiteralPath 'node_modules\ffmpeg-static\ffmpeg.exe')) { node node_modules\ffmpeg-static\install.js }
node scripts\copy-engine.mjs

npx electron-vite build
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
npx electron-builder --win --publish never
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = "dist\Transcriptor-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw "$installer was not generated" }
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLower()
"$hash  Transcriptor-Setup-$version.exe" | Out-File -FilePath "$installer.sha256" -Encoding ascii -NoNewline
Write-Host "Done: $installer ($([math]::Round((Get-Item -LiteralPath $installer).Length / 1MB)) MB)"
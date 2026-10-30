<#
  Arma el instalador: dist\Transcriptor-Setup-<version>.exe y su .sha256.
  La versión sale de package.json.
  Uso:  powershell -ExecutionPolicy Bypass -File installer\armar.ps1
  Solo escribe en las carpetas out\ y dist\ del repo.
#>
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $raiz

# npm no ejecuta scripts de instalación por defecto: se bajan los binarios que la app necesita.
if (-not (Test-Path -LiteralPath 'node_modules\electron\dist\electron.exe')) { node node_modules\electron\install.js }
if (-not (Test-Path -LiteralPath 'node_modules\ffmpeg-static\ffmpeg.exe')) { node node_modules\ffmpeg-static\install.js }
node scripts\copiar-motor.mjs

npx electron-vite build
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación' }
npx electron-builder --win
if ($LASTEXITCODE -ne 0) { throw 'Falló el empaquetado' }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$instalador = "dist\Transcriptor-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $instalador)) { throw "No se generó $instalador" }
$hash = (Get-FileHash -LiteralPath $instalador -Algorithm SHA256).Hash.ToLower()
"$hash  Transcriptor-Setup-$version.exe" | Out-File -FilePath "$instalador.sha256" -Encoding ascii -NoNewline
Write-Host "Listo: $instalador ($([math]::Round((Get-Item -LiteralPath $instalador).Length / 1MB)) MB)"

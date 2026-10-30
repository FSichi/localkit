<#
  Prueba el instalador en el CI:
    1. Lo instala en silencio en una carpeta temporal y verifica los archivos. No debe dejar la app abierta.
    2. Abre la app instalada, comprueba que sigue viva y que crea sus datos.
    3. Lo vuelve a instalar como lo hace la app al actualizarse (--force-run) y comprueba que se vuelve a abrir.
  Pensado para los runners de GitHub Actions, que se descartan al terminar.
#>
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $raiz 'package.json') -Raw | ConvertFrom-Json).version
$instalador = Join-Path $raiz "dist\Transcriptor-Setup-$version.exe"
$temporal = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$dir = Join-Path $temporal 'transcriptor-instalado'
$exe = Join-Path $dir 'Transcriptor.exe'
$datos = Join-Path $env:APPDATA 'transcriptor-desktop'

function Instalar([string[]]$Extra = @()) {
  # /D= tiene que ser el último argumento y va sin comillas.
  $p = Start-Process -FilePath $instalador -ArgumentList (@('/S') + $Extra + @("/D=$dir")) -PassThru
  $null = $p.Handle # sin esto, ExitCode puede quedar vacío
  if (-not $p.WaitForExit(240000)) { throw 'El instalador no terminó en 4 minutos' }
  if ($p.ExitCode -ne 0) { throw "El instalador terminó con código $($p.ExitCode)" }
}
function AppAbierta {
  [bool](Get-Process Transcriptor -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
}
function EsperarApp {
  for ($i = 0; $i -lt 40; $i++) {
    if (AppAbierta) { return $true }
    Start-Sleep -Seconds 1
  }
  $false
}
function CerrarApp {
  Get-Process Transcriptor -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
  Start-Sleep -Seconds 2
}

# 1. Instalación silenciosa
Instalar
$ffmpeg = 'resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe'
foreach ($f in 'Transcriptor.exe', 'resources\app.asar', $ffmpeg) {
  if (-not (Test-Path -LiteralPath (Join-Path $dir $f))) { throw "La instalación no tiene $f" }
}
& (Join-Path $dir $ffmpeg) -hide_banner -version | Select-Object -First 1
Start-Sleep -Seconds 4
if (AppAbierta) {
  CerrarApp
  throw 'La instalación silenciosa dejó la app abierta: solo tiene que abrirla al actualizarse (--force-run)'
}
Write-Host 'Archivos instalados, sin abrir la app: OK'

# 2. La app instalada arranca y no se cae
$proceso = Start-Process -FilePath $exe -PassThru
try {
  Start-Sleep -Seconds 12
  if ($proceso.HasExited) { throw "La app instalada se cerró sola (código $($proceso.ExitCode))" }
  if (-not (Test-Path -LiteralPath (Join-Path $datos 'ajustes.json'))) { throw 'La app no creó sus ajustes' }
  Write-Host 'La app instalada arranca y crea sus datos: OK'
} finally {
  CerrarApp
}

# 3. Actualización: el instalador vuelve a abrir la app
Instalar @('--force-run', '--updated')
try {
  if (-not (EsperarApp)) { throw 'Después de actualizar, la app no se volvió a abrir' }
  Write-Host 'Al actualizar, la app se vuelve a abrir: OK'
} finally {
  CerrarApp
}

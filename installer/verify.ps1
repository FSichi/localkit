<#
  Tests the installer on CI:
    1. Installs it silently into a temp folder and checks the files. It must not leave the app open.
    2. Opens the installed app and checks that it stays alive and creates its data.
    3. Installs it again the way the app does when updating (--force-run) and checks it reopens.
  Meant for GitHub Actions runners, which are discarded afterwards.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $root "dist\Transcriptor-Setup-$version.exe"
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$installDir = Join-Path $tempRoot 'localkit-installed'
$exe = Join-Path $installDir 'Transcriptor.exe'
$dataDir = Join-Path $env:APPDATA 'Transcriptor'

function Install-App([string[]]$Extra = @()) {
  # /D= has to be the last argument and goes without quotes.
  $process = Start-Process -FilePath $installer -ArgumentList (@('/S') + $Extra + @("/D=$installDir")) -PassThru
  $null = $process.Handle # without this, ExitCode can stay empty
  if (-not $process.WaitForExit(240000)) { throw 'The installer did not finish in 4 minutes' }
  if ($process.ExitCode -ne 0) { throw "The installer exited with code $($process.ExitCode)" }
}
function Test-AppOpen {
  [bool](Get-Process Transcriptor -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
}
function Wait-AppOpen {
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-AppOpen) { return $true }
    Start-Sleep -Seconds 1
  }
  $false
}
function Stop-App {
  Get-Process Transcriptor -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
  Start-Sleep -Seconds 2
}

# 1. Silent install
Install-App
$ffmpeg = 'resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe'
foreach ($file in 'Transcriptor.exe', 'resources\app.asar', $ffmpeg, 'resources\app.asar.unpacked\node_modules\sharp\package.json', 'licenses\THIRD_PARTY.md') {
  if (-not (Test-Path -LiteralPath (Join-Path $installDir $file))) { throw "The install is missing $file" }
}
if (-not (Get-ChildItem -LiteralPath (Join-Path $installDir 'resources\app.asar.unpacked\node_modules\@img') -Recurse -Filter '*.node')) { throw 'The install is missing the sharp native module' }
& (Join-Path $installDir $ffmpeg) -hide_banner -version | Select-Object -First 1
Start-Sleep -Seconds 4
if (Test-AppOpen) {
  Stop-App
  throw 'The silent install left the app open: it should only open when updating (--force-run)'
}
Write-Host 'Files installed, app not opened: OK'

# 2. The installed app starts and doesn't crash
$process = Start-Process -FilePath $exe -PassThru
try {
  $settings = Join-Path $dataDir 'settings.json'
  for ($i = 0; $i -lt 30 -and -not (Test-Path -LiteralPath $settings); $i++) { Start-Sleep -Seconds 1 }
  if ($process.HasExited) { throw "The installed app closed by itself (code $($process.ExitCode))" }
  if (-not (Test-Path -LiteralPath $settings)) { throw 'The app did not create its settings' }
  Write-Host 'The installed app starts and creates its data: OK'
} finally {
  Stop-App
}

# 3. Update: the installer reopens the app
Install-App @('--force-run', '--updated')
try {
  if (-not (Wait-AppOpen)) { throw 'After updating, the app did not reopen' }
  Write-Host 'After updating, the app reopens: OK'
} finally {
  Stop-App
}
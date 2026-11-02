<#
  Tests what someone on version 0.2.0 goes through when updating to this one:
    1. Installs the published 0.2.0 and leaves data in its folder.
    2. Runs the new installer the way that version does, with the app still open.
    3. Checks the app came back as LocalKit with its data, and that deleted items stay deleted.
  Only for GitHub Actions runners: on a real PC it would replace the installed app and move its models.
#>
$ErrorActionPreference = 'Stop'
if (-not $env:GITHUB_ACTIONS) { throw 'This script replaces the installed app: it only runs on GitHub Actions' }

$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$oldVersion = '0.2.0'
$newInstaller = Join-Path $root "dist\LocalKit-Setup-$version.exe"
$oldInstaller = Join-Path $env:RUNNER_TEMP "Transcriptor-Setup-$oldVersion.exe"
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\Transcriptor'
$oldExe = Join-Path $installDir 'Transcriptor.exe'
$newExe = Join-Path $installDir 'LocalKit.exe'
$oldData = Join-Path $env:APPDATA 'Transcriptor'
$newData = Join-Path $env:APPDATA 'LocalKit'
$itemName = 'library\upgraded-item.json'
$modelFile = 'models\onnx-community\whisper-base\config.json'

function Assert-That([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
  Write-Host "$Message`: OK"
}
function Invoke-Installer([string]$Path, [string[]]$Arguments) {
  $process = Start-Process -FilePath $Path -ArgumentList $Arguments -PassThru
  $null = $process.Handle # without this, ExitCode can stay empty
  if (-not $process.WaitForExit(240000)) { throw 'The installer did not finish in 4 minutes' }
  if ($process.ExitCode -ne 0) { throw "The installer exited with code $($process.ExitCode)" }
}
function Wait-Until([scriptblock]$Condition, [int]$Seconds = 40) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (& $Condition) { return $true }
    Start-Sleep -Seconds 1
  }
  $false
}
function Test-Running([string]$Name, [string]$Path) {
  [bool](Get-Process $Name -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Path })
}
function Stop-LocalKit {
  Get-Process LocalKit -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $newExe } | Stop-Process -Force
  Start-Sleep -Seconds 2
}
function Get-ShortcutTarget([string]$Path) {
  (New-Object -ComObject WScript.Shell).CreateShortcut($Path).TargetPath
}

# 1. Version 0.2.0, installed and with data
Invoke-WebRequest -Uri "https://github.com/FSichi/localkit/releases/download/v$oldVersion/Transcriptor-Setup-$oldVersion.exe" -OutFile $oldInstaller
Invoke-Installer $oldInstaller @('/S')
Assert-That (Test-Path -LiteralPath $oldExe) "Version $oldVersion installed"

$null = New-Item -ItemType Directory -Force -Path (Join-Path $oldData 'library'), (Split-Path (Join-Path $oldData $modelFile))
'{"theme":"light","checkForUpdates":false}' | Set-Content -LiteralPath (Join-Path $oldData 'settings.json') -Encoding ascii
'{"id":"upgraded-item","title":"Old item","kind":"file","createdAt":"2026-11-01T10:00:00.000Z","duration":1,"status":"transcribed","segments":[]}' | Set-Content -LiteralPath (Join-Path $oldData $itemName) -Encoding ascii
'{}' | Set-Content -LiteralPath (Join-Path $oldData $modelFile) -Encoding ascii

$null = Start-Process -FilePath $oldExe
Assert-That (Wait-Until { Test-Running 'Transcriptor' $oldExe }) "Version $oldVersion opens"
Start-Sleep -Seconds 5

# 2. Update, with the old app still open
Invoke-Installer $newInstaller @('/S', '--force-run', '--updated')
Assert-That (-not (Test-Path -LiteralPath $oldExe)) 'The old executable is gone'
Assert-That (Test-Path -LiteralPath $newExe) 'The new executable is in the same folder'
Assert-That (Wait-Until { Test-Running 'LocalKit' $newExe }) 'The app reopens as LocalKit'
Assert-That (Wait-Until { Test-Path -LiteralPath (Join-Path $newData 'migrated-from-transcriptor') }) 'The data migration finishes'
Stop-LocalKit

# 3. Everything came across
$settings = Get-Content -LiteralPath (Join-Path $newData 'settings.json') -Raw | ConvertFrom-Json
Assert-That ($settings.theme -eq 'light') 'Settings are kept'
Assert-That ($settings.recordingsFolder -eq (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Transcriptor')) 'Recordings keep their folder'
Assert-That (Test-Path -LiteralPath (Join-Path $newData $itemName)) 'The library came across'
Assert-That (Test-Path -LiteralPath (Join-Path $oldData $itemName)) 'The old library stays as a safety copy'
Assert-That (Test-Path -LiteralPath (Join-Path $newData $modelFile)) 'Models came across'
Assert-That (-not (Test-Path -LiteralPath (Join-Path $oldData $modelFile))) 'Models are not duplicated'

$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'LocalKit.lnk'
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'LocalKit.lnk'
Assert-That ((Get-ShortcutTarget $desktop) -eq $newExe) 'The desktop shortcut opens the new executable'
Assert-That ((Get-ShortcutTarget $startMenu) -eq $newExe) 'The Start menu shortcut opens the new executable'

$entries = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -like 'LocalKit*' })
Assert-That ($entries.Count -eq 1 -and $entries[0].DisplayVersion -eq $version) 'Windows lists one LocalKit, on the new version'

# 4. What the user deletes stays deleted
Remove-Item -LiteralPath (Join-Path $newData $itemName) -Force
$null = Start-Process -FilePath $newExe
Assert-That (Wait-Until { Test-Running 'LocalKit' $newExe }) 'The app opens again'
Start-Sleep -Seconds 5
Stop-LocalKit
Assert-That (-not (Test-Path -LiteralPath (Join-Path $newData $itemName))) 'A deleted item does not come back'

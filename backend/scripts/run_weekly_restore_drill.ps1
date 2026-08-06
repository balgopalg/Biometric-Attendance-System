param(
  [string]$BackendRoot = "$PSScriptRoot\..",
  [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"

$resolvedBackend = (Resolve-Path $BackendRoot).Path
Set-Location $resolvedBackend

if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  $venvPython = Join-Path $resolvedBackend ".venv\Scripts\python.exe"
  $workspaceVenvPython = Join-Path $resolvedBackend "..\.venv\Scripts\python.exe"
  if (Test-Path $venvPython) {
    $PythonExe = $venvPython
  } elseif (Test-Path $workspaceVenvPython) {
    $PythonExe = (Resolve-Path $workspaceVenvPython).Path
  } else {
    $PythonExe = "python"
  }
}

if ($PythonExe -eq "python") {
  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if (-not $pythonCmd) {
    throw "Python executable not found. Pass -PythonExe explicitly or create .venv."
  }
}

$logDir = Join-Path $resolvedBackend "logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $logDir "restore-drill-$ts.log"

function Invoke-Step {
  param(
    [string]$Name,
    [string]$CommandText,
    [scriptblock]$CommandAction
  )

  Write-Host "[STEP] $Name"
  Write-Host "[CMD ] $CommandText"
  Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] STEP: $Name"
  Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] CMD : $CommandText"

  & $CommandAction 2>&1 | Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Name (exit=$LASTEXITCODE)"
  }
}

$backupRoot = Join-Path $resolvedBackend "backups"
if (-not (Test-Path $backupRoot)) {
  throw "Backup root not found: $backupRoot"
}

$latestBackup = Get-ChildItem -Path $backupRoot -Directory -Filter "backup-*" |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1

if (-not $latestBackup) {
  throw "No backup directory found under: $backupRoot"
}

$manifestPath = Join-Path $latestBackup.FullName "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "Latest backup has no manifest.json: $($latestBackup.FullName)"
}

Write-Host "Starting weekly restore drill in $resolvedBackend"
Write-Host "Using backup: $($latestBackup.FullName)"
Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] START"

Invoke-Step -Name "Restore dry-run" -CommandText "$PythonExe restore.py --input-dir \"$($latestBackup.FullName)\" --dry-run" -CommandAction {
  & $PythonExe restore.py --input-dir $latestBackup.FullName --dry-run
}
Invoke-Step -Name "Migration status" -CommandText "$PythonExe migrate.py status" -CommandAction {
  & $PythonExe migrate.py status
}
Invoke-Step -Name "Diagnostics" -CommandText "$PythonExe db_diagnostics.py" -CommandAction {
  & $PythonExe db_diagnostics.py
}

Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] END"
Write-Host "Restore drill complete. Log: $logPath"

param(
  [string]$BackendRoot = "$PSScriptRoot\..",
  [string]$PythonExe = "",
  [switch]$DryRun
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
$logPath = Join-Path $logDir "maintenance-$ts.log"

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

Write-Host "Starting daily maintenance in $resolvedBackend"
Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] START"

if ($DryRun) {
  Invoke-Step -Name "Backup dry-run" -CommandText "$PythonExe backup.py --dry-run" -CommandAction { & $PythonExe backup.py --dry-run }
  Invoke-Step -Name "Cleanup dry-run" -CommandText "$PythonExe cleanup_data_lifecycle.py --dry-run" -CommandAction { & $PythonExe cleanup_data_lifecycle.py --dry-run }
} else {
  Invoke-Step -Name "Backup" -CommandText "$PythonExe backup.py --output-dir backups" -CommandAction { & $PythonExe backup.py --output-dir backups }
  Invoke-Step -Name "Cleanup" -CommandText "$PythonExe cleanup_data_lifecycle.py --apply" -CommandAction { & $PythonExe cleanup_data_lifecycle.py --apply }
  Invoke-Step -Name "Diagnostics" -CommandText "$PythonExe db_diagnostics.py" -CommandAction { & $PythonExe db_diagnostics.py }
}

Add-Content -Path $logPath -Value "[$(Get-Date -Format o)] END"
Write-Host "Maintenance complete. Log: $logPath"

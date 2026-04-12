param(
  [string]$TaskName = "BiometricAttendance-DailyMaintenance",
  [string]$BackendRoot = "$PSScriptRoot\..",
  [string]$RunTime = "02:30",
  [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"

$resolvedBackend = (Resolve-Path $BackendRoot).Path
$runnerScript = Join-Path $resolvedBackend "scripts\run_daily_maintenance.ps1"

if (-not (Test-Path $runnerScript)) {
  throw "Runner script missing: $runnerScript"
}

if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  $venvPython = Join-Path $resolvedBackend ".venv\Scripts\python.exe"
  $workspaceVenvPython = Join-Path $resolvedBackend "..\.venv\Scripts\python.exe"
  if (Test-Path $venvPython) {
    $PythonExe = $venvPython
  } elseif (Test-Path $workspaceVenvPython) {
    $PythonExe = (Resolve-Path $workspaceVenvPython).Path
  }
}

$argParts = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", ('"{0}"' -f $runnerScript)
)

if (-not [string]::IsNullOrWhiteSpace($PythonExe)) {
  $argParts += @("-PythonExe", ('"{0}"' -f $PythonExe))
}

$taskCommand = "powershell.exe"
$taskArgs = $argParts -join " "

& cmd /c "schtasks /Query /TN \"$TaskName\" >NUL 2>&1"
if ($LASTEXITCODE -eq 0) {
  schtasks /Delete /TN $TaskName /F | Out-Null
}

$startBoundary = "{0:yyyy-MM-dd}T{1}:00" -f (Get-Date), $RunTime
$xmlPath = Join-Path $env:TEMP ("{0}.xml" -f ([guid]::NewGuid().ToString("N")))

$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$startBoundary</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT6H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$taskCommand</Command>
      <Arguments>$taskArgs</Arguments>
    </Exec>
  </Actions>
</Task>
"@

$taskXml | Out-File -FilePath $xmlPath -Encoding Unicode

$createProc = Start-Process -FilePath "schtasks.exe" -ArgumentList @(
  "/Create",
  "/TN", $TaskName,
  "/XML", $xmlPath,
  "/F"
) -NoNewWindow -Wait -PassThru

Remove-Item -Path $xmlPath -Force -ErrorAction SilentlyContinue

if ($createProc.ExitCode -ne 0) {
  throw "Failed to create scheduled task: $TaskName"
}

Write-Host "Scheduled task created: $TaskName"
Write-Host "Run time: $RunTime"
Write-Host "Command: $taskCommand $taskArgs"
Write-Host "Manual run test: schtasks /Run /TN $TaskName"

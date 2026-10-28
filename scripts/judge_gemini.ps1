# Gemini editor: render prompt -> agy -> validate -> one repair pass. Leaves data/inbox/<day>.gemini.json. ASCII only.
param(
    [string]$Day = (Get-Date -Format "yyyy-MM-dd"),
    [string]$Model = "gemini-3.8-flash-high",
    [int]$TimeoutSec = 1800
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$agy = Join-Path $env:USERPROFILE ".gemini\bin\agy.exe"
$dir = Join-Path $root "data\inbox"
New-Item -ItemType Directory -Force $dir | Out-Null
$inbox = Join-Path $dir "$Day.gemini.json"
$errs = Join-Path $dir "$Day.gemini.errors.txt"
$prompt = Join-Path $dir "$Day.prompt.md"
$pending = Join-Path $root "data\pending\$Day.json"
$since = ([datetime]::ParseExact($Day, "yyyy-MM-dd", $null)).AddDays(-3).ToString("yyyy-MM-dd")
$utf8 = New-Object System.Text.UTF8Encoding $false

function Render([string]$name, [string]$out) {
    $t = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $name), $utf8)
    $t = $t.Replace("{DATE}", $Day).Replace("{SINCE}", $since).Replace("{INBOX}", $inbox).Replace("{PENDING}", $pending)
    $t = $t.Replace("{ERRORS}", $errs).Replace("{PROMPT}", $prompt)
    [IO.File]::WriteAllText($out, $t, $utf8)
}

function Invoke-Agy([string]$file, [string]$tag) {
    $log = Join-Path $dir "$Day.$tag.log"
    $a = "-p `"Read the file $file and follow it exactly. This is an unattended batch job.`" --add-dir `"$root`" --model $Model --mode accept-edits --print-timeout ${TimeoutSec}s"
    $t0 = Get-Date
    $p = Start-Process -FilePath $agy -ArgumentList $a -WorkingDirectory $root -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    $sec = [int]((Get-Date) - $t0).TotalSeconds
    Write-Output ("gemini " + $tag + ": exit " + $p.ExitCode + " in " + $sec + "s; " + ((Get-Content $log -Raw) -replace '\s+', ' ').Trim())
    $e = (Get-Content "$log.err" -Raw)
    if ($e -match 'auto-denied|no output produced') { Write-Output ("gemini " + $tag + " stderr: " + $e.Trim()) }
}

function Test-Inbox([string]$mode) {
    $flags = @("scripts\submit_digest.py", $inbox, "--day", $Day, "--check")
    if ($mode -eq "lenient") { $flags += "--lenient" }
    python @flags | Out-Host
    return $LASTEXITCODE
}

if (-not (Test-Path $pending)) { throw "no pending file $pending" }
if (Test-Path $inbox) { Move-Item -Force $inbox "$inbox.prev" }
Render "gemini_prompt.md" $prompt
Invoke-Agy $prompt "run"
if (-not (Test-Path $inbox)) { throw "gemini wrote no inbox file" }

$rc = Test-Inbox "strict"
if ($rc -ne 0) {
    # One repair pass with the error list
    $fix = Join-Path $dir "$Day.repair.md"
    Render "gemini_repair.md" $fix
    Invoke-Agy $fix "repair"
    $rc = Test-Inbox "lenient"
    if ($rc -ne 0) { throw "gemini output still invalid after repair (see $errs)" }
}
Write-Output "gemini judge ok: $inbox"

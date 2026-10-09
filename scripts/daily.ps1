# Daily pipeline: fetch -> judge (claude -p) -> validate/build -> TODO actions. ASCII only.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$day = Get-Date -Format "yyyy-MM-dd"
$log = Join-Path $root "logs\$day.log"
Start-Transcript -Path $log -Append | Out-Null
try {
    python scripts\fetch.py
    if ($LASTEXITCODE -ne 0) { throw "fetch failed ($LASTEXITCODE)" }
    $n = [int](python -c "import json,sys;print(len(json.load(open(sys.argv[1],encoding='utf-8'))))" "data\pending\$day.json")
    if ($n -gt 0) {
        $prompt = (Get-Content "scripts\judge_prompt.md" -Raw -Encoding UTF8).Replace("{DATE}", $day)
        claude -p $prompt --allowedTools "Read" "Write" --permission-mode acceptEdits
        if ($LASTEXITCODE -ne 0) { throw "judge failed ($LASTEXITCODE)" }
        python scripts\build.py
        if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
        python scripts\apply_actions.py $day
    } else {
        Write-Output "nothing new"
    }
} catch {
    Write-Output "FAILED: $_"
    '' | powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\ghs\.claude\notify-done.ps1" -Title "uw-news-digest FAILED" -Message ("$_".Substring(0, [Math]::Min(200, "$_".Length))) 2>$null
    Stop-Transcript | Out-Null
    exit 1
}
Stop-Transcript | Out-Null

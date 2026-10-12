# Daily pipeline: fetch -> judge (claude -p) -> validate/build -> TODO actions -> publish. ASCII only.
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
        # A second run on the same day writes a suffixed file; build.py merges them by id
        $out = "$day.json"
        $k = 2
        while (Test-Path "data\digest\$out") { $out = "$day-r$k.json"; $k++ }
        $prompt = (Get-Content "scripts\judge_prompt.md" -Raw -Encoding UTF8).Replace("{DATE}", $day).Replace("{OUT}", $out)
        # Prompt via stdin as UTF-8 (PS 5.1 breaks args with embedded quotes)
        $OutputEncoding = New-Object System.Text.UTF8Encoding $false
        $prompt | claude -p --allowedTools "Read" "Write" --permission-mode acceptEdits
        if ($LASTEXITCODE -ne 0) { throw "judge failed ($LASTEXITCODE)" }
        python scripts\build.py
        if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }
        python scripts\apply_actions.py $day
    } else {
        Write-Output "nothing new"
    }
    # Push data commits so the live site updates
    & "$PSScriptRoot\publish.ps1" -Day $day
} catch {
    Write-Output "FAILED: $_"
    '' | powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\ghs\.claude\notify-done.ps1" -Title "uw-news-digest FAILED" -Message ("$_".Substring(0, [Math]::Min(200, "$_".Length))) 2>$null
    Stop-Transcript | Out-Null
    exit 1
}
Stop-Transcript | Out-Null

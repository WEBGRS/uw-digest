# Commit digest data, then push only the data commits to origin/main (dev commits stay local). ASCII only.
param([string]$Day = (Get-Date -Format "yyyy-MM-dd"), [switch]$DryRun)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$paths = @("data/digest", "data/images.json", "site/data/digest.json")

# Commit data paths only
git add -- $paths
git diff --cached --quiet -- $paths
if ($LASTEXITCODE -ne 0) {
    git commit -q -m "Daily digest $Day" -- $paths
    if ($LASTEXITCODE -ne 0) { throw "commit failed" }
}

# Data commits not yet on origin/main, oldest first
git fetch -q origin
if ($LASTEXITCODE -ne 0) { throw "fetch failed" }
$todo = @(git cherry -v origin/main HEAD | ForEach-Object { if ($_ -match '^\+ ([0-9a-f]+) Daily digest ') { $Matches[1] } })
if ($todo.Count -eq 0) { Write-Output "publish: nothing to push"; exit 0 }

# Replay them on origin/main in a temp worktree and push
$wt = Join-Path $env:TEMP "uw-digest-publish"
if (Test-Path $wt) { git worktree remove --force $wt; if (Test-Path $wt) { Remove-Item -Recurse -Force $wt } }
git worktree prune
git worktree add -q --detach $wt origin/main
if ($LASTEXITCODE -ne 0) { throw "worktree add failed" }
try {
    foreach ($c in $todo) {
        git -C $wt cherry-pick $c
        if ($LASTEXITCODE -ne 0) { git -C $wt cherry-pick --abort; throw "cherry-pick $c failed" }
    }
    git -C $wt log --oneline --stat origin/main..HEAD
    if ($DryRun) { git -C $wt push --dry-run origin HEAD:main } else { git -C $wt push -q origin HEAD:main }
    if ($LASTEXITCODE -ne 0) {
        # Retry with the gh token passed through env; log why the helper failed
        $gh = 'C:\Users\ghs\AppData\Local\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe'
        $ErrorActionPreference = "Continue"
        $env:GH_PUSH_TOKEN = "$(& $gh auth token 2>$null)".Trim()
        Write-Output ("publish: gh auth token exit " + $LASTEXITCODE + ", length " + $env:GH_PUSH_TOKEN.Length)
        git -C $wt -c credential.helper= -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$GH_PUSH_TOKEN"; }; f' push -q origin HEAD:main
        $rc = $LASTEXITCODE
        Remove-Item Env:GH_PUSH_TOKEN
        if ($rc -ne 0) { throw "push failed" }
        Write-Output "publish: retry with gh token worked"
    }
    Write-Output ("publish: pushed " + $todo.Count + " data commit(s)")
} finally {
    git worktree remove --force $wt
}

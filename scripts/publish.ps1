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
    if ($LASTEXITCODE -ne 0) { throw "push failed" }
    Write-Output ("publish: pushed " + $todo.Count + " data commit(s)")
} finally {
    git worktree remove --force $wt
}

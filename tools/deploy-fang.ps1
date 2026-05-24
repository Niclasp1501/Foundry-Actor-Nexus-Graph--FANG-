# FANG Foundry module deploy script. ASCII-only for Windows PowerShell 5.1.
[CmdletBinding()]
param(
    [switch]$DryRun,
    [ValidateSet("prod", "testv14")]
    [string]$Target = "prod"
)

$ErrorActionPreference = "Stop"
$ModuleId = "fang"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $PSScriptRoot "deploy-config.json"
$cfg = Get-Content $configPath -Raw | ConvertFrom-Json

$HostAlias = $cfg.HostAlias
if ($Target -eq "testv14") { $HostAlias = "foundry-testv14" }
$RemoteTarget = "$($cfg.RemoteModulesPath)/$ModuleId"

$uploadItems = @(
    "module.json",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "scripts",
    "styles",
    "templates",
    "lang",
    "assets"
)

$denylist = @(
    ".claude",
    "tools",
    "AGENTS.md",
    "DEVELOPER_GUIDE.md",
    "CONTENT-INVENTORY.md",
    "TODO.md",
    "node_modules",
    ".git",
    ".github",
    ".vscode",
    "*.log",
    "module-beta.json",
    "module-beta.zip",
    "module.zip",
    "dist-beta"
)

function Should-Skip($name) {
    foreach ($p in $denylist) {
        if ($name -like $p) { return $true }
    }
    return $false
}

$resolved = @()
foreach ($item in $uploadItems) {
    if (Should-Skip $item) { continue }
    $path = Join-Path $ProjectRoot $item
    if (Test-Path $path) { $resolved += $path }
}

Write-Host "==> Deploy $ModuleId to ${HostAlias}:$RemoteTarget"
Write-Host "==> Files:"
foreach ($path in $resolved) { Write-Host "  - $(Split-Path -Leaf $path)" }

if ($DryRun) {
    Write-Host "==> DryRun only. No files uploaded."
    exit 0
}

& ssh $HostAlias "mkdir -p '$RemoteTarget'"
if ($LASTEXITCODE -ne 0) { throw "ssh mkdir failed" }

foreach ($path in $resolved) {
    $leaf = Split-Path -Leaf $path
    & scp -r -p -q $path "${HostAlias}:$RemoteTarget/"
    if ($LASTEXITCODE -ne 0) { throw "scp failed on $leaf" }
    Write-Host "  OK: $leaf"
}

Write-Host "==> Done. Reload the Foundry world in the UI. Do not restart the service."

# Generic Foundry deploy script for FANG.
# ASCII-only (PowerShell 5.1 compatibility).
# Usage:
#   .\tools\deploy-fang.ps1 -DryRun    # preview, no upload
#   .\tools\deploy-fang.ps1            # real upload via scp
[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$ModuleId = "fang"

$configPath  = Join-Path $PSScriptRoot "deploy-config.json"
$cfg         = Get-Content $configPath -Raw | ConvertFrom-Json
$HostAlias   = $cfg.HostAlias
$RemoteTarget = "$($cfg.RemoteModulesPath)/$ModuleId"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Allowlist: only runtime files that Foundry actually loads.
# tools/ stays OUT on purpose - dev scripts have no business on the server.
$uploadItems = @(
    "module.json",
    "LICENSE",
    "scripts",
    "styles",
    "templates",
    "lang",
    "assets"
)

# Sanity check: every entry must exist locally.
$missing = @()
$resolved = @()
foreach ($i in $uploadItems) {
    $f = Join-Path $ProjectRoot $i
    if (Test-Path $f) {
        $resolved += $f
    } else {
        $missing += $i
    }
}

if ($missing.Count -gt 0) {
    Write-Warning ("Missing locally, will be skipped: " + ($missing -join ", "))
}

Write-Host ""
Write-Host "==> Deploying $ModuleId to ${HostAlias}:$RemoteTarget"
Write-Host "    Mode: $(if ($DryRun) { 'DRY RUN (no upload)' } else { 'REAL upload' })"
Write-Host ""

if (-not $DryRun) {
    & ssh $HostAlias "mkdir -p '$RemoteTarget'"
    if ($LASTEXITCODE -ne 0) { throw "ssh mkdir failed" }
}

foreach ($f in $resolved) {
    $leaf = Split-Path -Leaf $f
    if ($DryRun) {
        Write-Host "  [DryRun] would scp -r -p $leaf"
        continue
    }
    & scp -r -p -q $f "${HostAlias}:$RemoteTarget/"
    if ($LASTEXITCODE -ne 0) { throw "scp failed on $leaf" }
    Write-Host "  OK: $leaf"
}

if (-not $DryRun) {
    Write-Host ""
    Write-Host "==> Verifying on server..."
    & ssh $HostAlias "grep version '$RemoteTarget/module.json'"
}

Write-Host ""
Write-Host "==> Done. Reload world in Foundry to pick up changes."

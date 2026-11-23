<#
.SYNOPSIS
  1-Command Clean Uninstaller for the State of West Virginia Antigravity Suite (Zero-Residue Audit).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$TargetConfigDir = "",

  [Parameter(Mandatory = $false)]
  [switch]$PurgeMemoryData
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($TargetConfigDir)) {
  $UserHome = [Environment]::GetFolderPath("UserProfile")
  if ([string]::IsNullOrWhiteSpace($UserHome)) { $UserHome = $HOME }
  $TargetConfigDir = Join-Path $UserHome ".gemini\config"
}

$WvPlugins = @(
  "wv-onboarding",
  "wv-coordinator",
  "wv-connectors",
  "wv-design-studio",
  "wv-state-workflows",
  "wv-engineering-cloud",
  "wv-security",
  "wv-second-brain",
  "wv-automations"
)

foreach ($p in $WvPlugins) {
  $target = Join-Path $TargetConfigDir ("plugins\" + $p)
  if (Test-Path $target) {
    Remove-Item -Recurse -Force -Path $target
  }
}

$RulePath = Join-Path $TargetConfigDir "rules\wv-voice-profile.md"
if (Test-Path $RulePath) {
  Remove-Item -Force -Path $RulePath
}

if ($PurgeMemoryData) {
  foreach ($d in @("wv-onboarding", "wv-coordinator", "wv-connectors", "wv-design-studio", "wv-antigravity")) {
    $dp = Join-Path $TargetConfigDir ("plugin_data\" + $d)
    if (Test-Path $dp) {
      Remove-Item -Recurse -Force -Path $dp
    }
  }
}
Write-Host "Cleanly removed WV Antigravity Suite from $TargetConfigDir" -ForegroundColor Green

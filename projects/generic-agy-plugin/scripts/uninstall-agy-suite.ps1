<#
.SYNOPSIS
  1-Command Clean Uninstaller for the Generic AGY Plugin Suite (Zero-Residue Audit).
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

$AgyPlugins = @(
  "agy-onboarding",
  "agy-coordinator",
  "agy-connectors",
  "agy-design-studio",
  "agy-public-workflows",
  "agy-engineering-cloud",
  "agy-security",
  "agy-second-brain",
  "agy-twin-automations"
)

foreach ($p in $AgyPlugins) {
  $target = Join-Path $TargetConfigDir ("plugins\" + $p)
  if (Test-Path $target) {
    Remove-Item -Recurse -Force -Path $target
  }
}

$RulePath = Join-Path $TargetConfigDir "rules\my-voice-profile.md"
if (Test-Path $RulePath) {
  Remove-Item -Force -Path $RulePath
}

if ($PurgeMemoryData) {
  foreach ($d in @("agy-onboarding", "agy-coordinator", "agy-connectors", "agy-design-studio", "my-antigravity", "updates-feed", "token-telemetry")) {
    $dp = Join-Path $TargetConfigDir ("plugin_data\" + $d)
    if (Test-Path $dp) {
      Remove-Item -Recurse -Force -Path $dp
    }
  }
}

Write-Host "Cleanly removed Generic AGY Plugin Suite from $TargetConfigDir" -ForegroundColor Green

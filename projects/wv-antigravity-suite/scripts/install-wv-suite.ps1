<#
.SYNOPSIS
  Fast (<2 second) zero-dependency installer & updater for the State of West Virginia Antigravity Suite.
.DESCRIPTION
  Installs or updates all 6 WV Antigravity plugins into ~/.gemini/config/plugins/ from either:
    1. A local checkout/extracted folder (./plugins or ./dist/wv-antigravity-suite.zip), OR
    2. An HTTPS ZIP URL (-ZipUrl) with strict ZipSlip path traversal protection (no git required).
  Optionally pre-configures the user's Gemini Enterprise (GE) instance (-GeInstance) so federated
  connectors (Outlook, SharePoint, OneDrive, Teams, Gmail, Drive, GitHub) work on Turn 1.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ZipUrl = "",

  [Parameter(Mandatory = $false)]
  [string]$GeInstance = "",

  [Parameter(Mandatory = $false)]
  [string]$OAuthClientId = "",

  [Parameter(Mandatory = $false)]
  [string]$OAuthClientSecret = "",

  [Parameter(Mandatory = $false)]
  [string]$TargetConfigDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TargetConfigDir)) {
  $TargetConfigDir = Join-Path $HOME ".gemini\config"
}
$PluginsDest = Join-Path $TargetConfigDir "plugins"
$PluginDataDir = Join-Path $TargetConfigDir "plugin_data\wv-connectors"

New-Item -ItemType Directory -Force -Path $PluginsDest | Out-Null
New-Item -ItemType Directory -Force -Path $PluginDataDir | Out-Null

function Test-SafeArchiveEntries {
  param([string]$ZipPath, [string]$ExtractRoot)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $fullRoot = [System.IO.Path]::GetFullPath($ExtractRoot)
  if (-not $fullRoot.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $fullRoot += [System.IO.Path]::DirectorySeparatorChar
  }
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    foreach ($entry in $archive.Entries) {
      $destPath = [System.IO.Path]::GetFullPath((Join-Path $fullRoot $entry.FullName))
      if (-not $destPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Blocked unsafe archive entry (ZipSlip traversal attempt): $($entry.FullName)"
      }
    }
  } finally {
    $archive.Dispose()
  }
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SuiteRoot = Split-Path -Parent $ScriptRoot
$TempDir = $null
$SourcePluginsDir = $null

try {
  if (-not [string]::IsNullOrWhiteSpace($ZipUrl)) {
    if (-not $ZipUrl.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing non-HTTPS ZipUrl: $ZipUrl"
    }
    $TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("wv-agy-suite-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
    $ZipFile = Join-Path $TempDir "wv-antigravity-suite.zip"
    Write-Host "Downloading WV Antigravity Suite (~150 KB)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile -UseBasicParsing
    $ExtractDir = Join-Path $TempDir "extracted"
    New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
    Test-SafeArchiveEntries -ZipPath $ZipFile -ExtractRoot $ExtractDir
    Expand-Archive -Path $ZipFile -DestinationPath $ExtractDir -Force
    if (Test-Path (Join-Path $ExtractDir "plugins")) {
      $SourcePluginsDir = Join-Path $ExtractDir "plugins"
    } else {
      $sub = Get-ChildItem -Path $ExtractDir -Directory | Select-Object -First 1
      if ($null -ne $sub -and (Test-Path (Join-Path $sub.FullName "plugins"))) {
        $SourcePluginsDir = Join-Path $sub.FullName "plugins"
      }
    }
  } elseif (Test-Path (Join-Path $SuiteRoot "plugins")) {
    $SourcePluginsDir = Join-Path $SuiteRoot "plugins"
  } elseif (Test-Path (Join-Path $SuiteRoot "dist\wv-antigravity-suite.zip")) {
    $TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("wv-agy-suite-" + [System.Guid]::NewGuid().ToString("N"))
    $ExtractDir = Join-Path $TempDir "extracted"
    New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
    $LocalZip = Join-Path $SuiteRoot "dist\wv-antigravity-suite.zip"
    Test-SafeArchiveEntries -ZipPath $LocalZip -ExtractRoot $ExtractDir
    Expand-Archive -Path $LocalZip -DestinationPath $ExtractDir -Force
    $SourcePluginsDir = Join-Path $ExtractDir "plugins"
  }

  if ([string]::IsNullOrWhiteSpace($SourcePluginsDir) -or -not (Test-Path $SourcePluginsDir)) {
    throw "Could not locate plugins/ directory to install."
  }

  # Prefer native `agy plugin install` when agy CLI is on PATH so manifest tracking stays in sync
  $AgyCmd = Get-Command "agy" -ErrorAction SilentlyContinue
  $ParentOfPlugins = Split-Path -Parent $SourcePluginsDir
  if ($null -ne $AgyCmd) {
    Write-Host "Installing WV Antigravity Suite via native 'agy plugin install'..." -ForegroundColor Cyan
    & $AgyCmd.Source plugin install $ParentOfPlugins
  } else {
    $InstalledNames = @()
    foreach ($dir in (Get-ChildItem -Path $SourcePluginsDir -Directory)) {
      if ($dir.Name.StartsWith(".")) { continue }
      if (($dir.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing symlink/reparse point plugin directory: $($dir.Name)"
      }
      $reparseChild = Get-ChildItem -Path $dir.FullName -Recurse -Force | Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 } | Select-Object -First 1
      if ($null -ne $reparseChild) {
        throw "Refusing symlink/reparse point inside plugin $($dir.Name): $($reparseChild.FullName)"
      }
      if (-not (Test-Path (Join-Path $dir.FullName "plugin.json"))) { continue }
      $dest = Join-Path $PluginsDest $dir.Name
      if (Test-Path $dest) {
        Remove-Item -Recurse -Force -Path $dest
      }
      Copy-Item -Recurse -Force -Path $dir.FullName -Destination $dest
      $InstalledNames += $dir.Name
    }
    Write-Host ("Installed {0} WV plugins to {1}: {2}" -f $InstalledNames.Count, $PluginsDest, ($InstalledNames -join ", ")) -ForegroundColor Green
  }

  if (-not [string]::IsNullOrWhiteSpace($GeInstance)) {
    $GeConfigPath = Join-Path $PluginDataDir "ge-instance.json"
    $Payload = @{
      rawInput          = $GeInstance
      oauthClientId     = $OAuthClientId
      oauthClientSecret = $OAuthClientSecret
      updatedAt         = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Depth 4
    Set-Content -Path $GeConfigPath -Value $Payload -Encoding UTF8
    Write-Host "Saved default Gemini Enterprise instance to $GeConfigPath" -ForegroundColor Green
  }

  # Re-apply any per-skill toggles saved by the user in the WV Skills UI panel
  $LedgerPath = Join-Path $TargetConfigDir "plugin_data\wv-onboarding\skill-toggles.json"
  if (Test-Path $LedgerPath) {
    try {
      $Ledger = Get-Content -Raw -Path $LedgerPath | ConvertFrom-Json
      if ($null -ne $Ledger.disabledSkills) {
        foreach ($prop in $Ledger.disabledSkills.PSObject.Properties) {
          if ($prop.Value -eq $true) {
            $parts = $prop.Name -split "/"
            if ($parts.Length -eq 2) {
              $mdPath = Join-Path $PluginsDest "$($parts[0])\skills\$($parts[1])\SKILL.md"
              if (Test-Path $mdPath) {
                Move-Item -Force -Path $mdPath -Destination "$mdPath.disabled"
              }
            }
          }
        }
      }
    } catch {}
  }

  Write-Host "`nReady! Open Google Antigravity and type /wv-onboard or /connect-ge to begin." -ForegroundColor Green
} finally {
  if ($null -ne $TempDir -and (Test-Path $TempDir)) {
    Remove-Item -Recurse -Force -Path $TempDir -ErrorAction SilentlyContinue
  }
}

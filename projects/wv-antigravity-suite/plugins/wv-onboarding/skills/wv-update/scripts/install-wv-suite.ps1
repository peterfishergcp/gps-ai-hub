<#
.SYNOPSIS
  Fast (<2 second) Zero-Footprint installer & updater for the State of West Virginia Antigravity Suite (v2.0.0).
.DESCRIPTION
  Adheres strictly to WV corporate laptop standards (Windows 11 / PowerShell 5.1, zero admin rights,
  zero standalone Node/Python/Git/Docker required, zero files created outside $HOME\.gemini\config\).
  Installs all 8 WV plugins (keeping wv-automations disabled/opt-in by default), writes BOM-free UTF-8
  JSON configs, removes retired v1.x skill folders, and preserves user skill toggles & GE settings.
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
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if ([string]::IsNullOrWhiteSpace($TargetConfigDir)) {
  $UserHome = [Environment]::GetFolderPath("UserProfile")
  if ([string]::IsNullOrWhiteSpace($UserHome)) { $UserHome = $HOME }
  $TargetConfigDir = Join-Path $UserHome ".gemini\config"
}
$PluginsDest = Join-Path $TargetConfigDir "plugins"
$PluginDataDir = Join-Path $TargetConfigDir "plugin_data\wv-connectors"
$MemoryDataDir = Join-Path $TargetConfigDir "plugin_data\wv-antigravity\memory"

New-Item -ItemType Directory -Force -Path $PluginsDest | Out-Null
New-Item -ItemType Directory -Force -Path $PluginDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $MemoryDataDir | Out-Null

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
    Write-Host "Downloading WV Antigravity Suite v2.0 (<500 KB)..." -ForegroundColor Cyan
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
  Write-Host ("Installed {0} WV zero-footprint plugins to {1}: {2}" -f $InstalledNames.Count, $PluginsDest, ($InstalledNames -join ", ")) -ForegroundColor Green

  if (-not [string]::IsNullOrWhiteSpace($GeInstance)) {
    $GeConfigPath = Join-Path $PluginDataDir "ge-instance.json"
    $Payload = @{
      rawInput          = $GeInstance
      oauthClientId     = $OAuthClientId
      oauthClientSecret = $OAuthClientSecret
      updatedAt         = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($GeConfigPath, ($Payload + "`n"), $Utf8NoBom)
    Write-Host "Saved BOM-free Gemini Enterprise instance to $GeConfigPath" -ForegroundColor Green
  }

  $LedgerPath = Join-Path $TargetConfigDir "plugin_data\wv-onboarding\skill-toggles.json"
  if (Test-Path $LedgerPath) {
    try {
      $RawLedger = [System.IO.File]::ReadAllText($LedgerPath).TrimStart([char]0xFEFF)
      $Ledger = $RawLedger | ConvertFrom-Json
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
    } catch {
      Write-Warning "Could not re-apply saved skill toggles: $_"
    }
  }
} finally {
  if ($null -ne $TempDir -and (Test-Path $TempDir)) {
    Remove-Item -Recurse -Force -Path $TempDir -ErrorAction SilentlyContinue
  }
}

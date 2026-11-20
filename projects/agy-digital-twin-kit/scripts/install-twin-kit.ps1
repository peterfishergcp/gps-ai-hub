<#
.SYNOPSIS
  Fast (<2 second) installer & updater for the Antigravity Digital Twin & Second Brain Kit.
.DESCRIPTION
  Installs all 4 modular Digital Twin plugins (agy-twin-memory, agy-twin-workflows,
  agy-twin-voice, agy-twin-automations) into ~/.gemini/config/plugins/ from a local
  folder or offline/HTTPS .zip archive with ZipSlip and symlink protection.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ZipUrl = "",

  [Parameter(Mandatory = $false)]
  [string]$Role = "",

  [Parameter(Mandatory = $false)]
  [string]$Name = "",

  [Parameter(Mandatory = $false)]
  [string]$Org = "",

  [Parameter(Mandatory = $false)]
  [string]$TargetConfigDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TargetConfigDir)) {
  $TargetConfigDir = Join-Path $HOME ".gemini\config"
}
$PluginsDest = Join-Path $TargetConfigDir "plugins"
New-Item -ItemType Directory -Force -Path $PluginsDest | Out-Null

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
        throw "Blocked unsafe archive entry (ZipSlip traversal): $($entry.FullName)"
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
    $TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("agy-twin-kit-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
    $ZipFile = Join-Path $TempDir "antigravity-digital-twin-kit.zip"
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile -UseBasicParsing
    $ExtractDir = Join-Path $TempDir "extracted"
    New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
    Test-SafeArchiveEntries -ZipPath $ZipFile -ExtractRoot $ExtractDir
    Expand-Archive -Path $ZipFile -DestinationPath $ExtractDir -Force
    if (Test-Path (Join-Path $ExtractDir "plugins")) {
      $SourcePluginsDir = Join-Path $ExtractDir "plugins"
    }
  } elseif (Test-Path (Join-Path $SuiteRoot "plugins")) {
    $SourcePluginsDir = Join-Path $SuiteRoot "plugins"
  } elseif (Test-Path (Join-Path $SuiteRoot "dist\antigravity-digital-twin-kit.zip")) {
    $TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("agy-twin-kit-" + [System.Guid]::NewGuid().ToString("N"))
    $ExtractDir = Join-Path $TempDir "extracted"
    New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
    $LocalZip = Join-Path $SuiteRoot "dist\antigravity-digital-twin-kit.zip"
    Test-SafeArchiveEntries -ZipPath $LocalZip -ExtractRoot $ExtractDir
    Expand-Archive -Path $LocalZip -DestinationPath $ExtractDir -Force
    $SourcePluginsDir = Join-Path $ExtractDir "plugins"
  }

  if ([string]::IsNullOrWhiteSpace($SourcePluginsDir) -or -not (Test-Path $SourcePluginsDir)) {
    throw "Could not locate plugins/ directory to install."
  }
  $pluginsRootItem = Get-Item -LiteralPath $SourcePluginsDir -Force
  if (($pluginsRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing symlink/reparse point plugins root: $SourcePluginsDir"
  }
  $anyReparse = @(Get-ChildItem -Path $SourcePluginsDir -Recurse -Force | Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 })
  if ($anyReparse.Count -gt 0) {
    throw "Refusing symlink/reparse point inside plugins bundle: $($anyReparse[0].FullName)"
  }

  $AgyCmd = Get-Command "agy" -ErrorAction SilentlyContinue
  $ParentOfPlugins = Split-Path -Parent $SourcePluginsDir
  if ($null -ne $AgyCmd -and $TargetConfigDir -eq (Join-Path $HOME ".gemini\config")) {
    Write-Host "Installing Antigravity Digital Twin Kit via native 'agy plugin install'..." -ForegroundColor Cyan
    & $AgyCmd.Source plugin install $ParentOfPlugins
  } else {
    $InstalledNames = @()
    foreach ($dir in (Get-ChildItem -Path $SourcePluginsDir -Directory -Force)) {
      if ($dir.Name.StartsWith(".")) { continue }
      if (($dir.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing symlink/reparse point plugin directory: $($dir.Name)"
      }
      $childReparse = @(Get-ChildItem -Path $dir.FullName -Recurse -Force | Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 })
      if ($childReparse.Count -gt 0) {
        throw "Refusing symlink/reparse point inside plugin $($dir.Name): $($childReparse[0].FullName)"
      }
      if (-not (Test-Path (Join-Path $dir.FullName "plugin.json"))) { continue }
      $dest = Join-Path $PluginsDest $dir.Name
      if (Test-Path $dest) {
        Remove-Item -Recurse -Force -Path $dest
      }
      Copy-Item -Recurse -Force -Path $dir.FullName -Destination $dest
      $InstalledNames += $dir.Name
    }
    Write-Host ("Installed {0} Digital Twin plugins to {1}: {2}" -f $InstalledNames.Count, $PluginsDest, ($InstalledNames -join ", ")) -ForegroundColor Green
  }

  $NodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
  if (-not [string]::IsNullOrWhiteSpace($Role) -and $null -ne $NodeCmd) {
    $VaultCli = Join-Path $PluginsDest "agy-twin-memory\scripts\vault_cli.mjs"
    if (Test-Path $VaultCli) {
      & $NodeCmd.Source $VaultCli init --role $Role --name $Name --org $Org --seed-demo --force
    }
  }

  Write-Host "Ready! Open Google Antigravity -> Extensions -> Twin Vault (or run /twin-setup) to begin." -ForegroundColor Green
} finally {
  if ($null -ne $TempDir -and (Test-Path $TempDir)) {
    Remove-Item -Recurse -Force -Path $TempDir -ErrorAction SilentlyContinue
  }
}

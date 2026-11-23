<#
.SYNOPSIS
  Fast (<2 second) Zero-Footprint installer & updater for the Public Sector Antigravity Suite (v1.7.4).
.DESCRIPTION
  Stages strictly inside $HOME\.gemini\config\.install_stage_<guid> (zero %TEMP% writes, zero
  'agy plugin install' prompts, zero standalone Node/Python/Git required). Installs all 9 AGY plugins,
  writes BOM-free UTF-8 JSON configs, and preserves user skill toggles, personal skills, and GE settings.
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
$DefaultZipUrl = "https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/feat/agy-coordinator-prototype/projects/generic-agy-plugin/dist/generic-agy-plugin.zip"

if ([string]::IsNullOrWhiteSpace($TargetConfigDir)) {
  $UserHome = [Environment]::GetFolderPath("UserProfile")
  if ([string]::IsNullOrWhiteSpace($UserHome)) { $UserHome = $HOME }
  $TargetConfigDir = Join-Path $UserHome ".gemini\config"
}
$PluginsDest = Join-Path $TargetConfigDir "plugins"
$PluginDataDir = Join-Path $TargetConfigDir "plugin_data\agy-connectors"
$MemoryDataDir = Join-Path $TargetConfigDir "plugin_data\my-antigravity\memory"
$CoordDataDir = Join-Path $TargetConfigDir "plugin_data\agy-coordinator"

New-Item -ItemType Directory -Force -Path $PluginsDest | Out-Null
New-Item -ItemType Directory -Force -Path $PluginDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $MemoryDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $CoordDataDir | Out-Null

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

$SuiteRoot = ""
if (-not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
  $ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
  $SuiteRoot = Split-Path -Parent $ScriptRoot
}

if ([string]::IsNullOrWhiteSpace($ZipUrl)) {
  $HasLocalPlugins = (-not [string]::IsNullOrWhiteSpace($SuiteRoot)) -and (Test-Path (Join-Path $SuiteRoot "plugins"))
  $HasLocalZip = (-not [string]::IsNullOrWhiteSpace($SuiteRoot)) -and (Test-Path (Join-Path $SuiteRoot "dist\generic-agy-plugin.zip"))
  if ((-not $HasLocalPlugins) -and (-not $HasLocalZip)) {
    $ZipUrl = $DefaultZipUrl
  }
}

$StageDir = $null
$SourcePluginsDir = $null

try {
  if (-not [string]::IsNullOrWhiteSpace($ZipUrl)) {
    if (-not $ZipUrl.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing non-HTTPS ZipUrl: $ZipUrl"
    }
    $StageDir = Join-Path $TargetConfigDir (".install_stage_" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
    $ZipFile = Join-Path $StageDir "generic-agy-plugin.zip"
    Write-Host "Downloading Generic AGY Plugin Suite v1.7.4 (<500 KB)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile -UseBasicParsing
    $ExtractDir = Join-Path $StageDir "extracted"
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
  } elseif ((-not [string]::IsNullOrWhiteSpace($SuiteRoot)) -and (Test-Path (Join-Path $SuiteRoot "plugins"))) {
    $SourcePluginsDir = Join-Path $SuiteRoot "plugins"
  } elseif ((-not [string]::IsNullOrWhiteSpace($SuiteRoot)) -and (Test-Path (Join-Path $SuiteRoot "dist\generic-agy-plugin.zip"))) {
    $StageDir = Join-Path $TargetConfigDir (".install_stage_" + [System.Guid]::NewGuid().ToString("N"))
    $ExtractDir = Join-Path $StageDir "extracted"
    New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
    $LocalZip = Join-Path $SuiteRoot "dist\generic-agy-plugin.zip"
    Test-SafeArchiveEntries -ZipPath $LocalZip -ExtractRoot $ExtractDir
    Expand-Archive -Path $LocalZip -DestinationPath $ExtractDir -Force
    $SourcePluginsDir = Join-Path $ExtractDir "plugins"
  }

  if ([string]::IsNullOrWhiteSpace($SourcePluginsDir) -or -not (Test-Path $SourcePluginsDir)) {
    throw "Could not locate plugins/ directory to install."
  }

  # Protect any stock SKILL.md that the user customized locally before upgrading plugin folders
  $BaselineJsonPath = Join-Path $TargetConfigDir "plugin_data\agy-onboarding\baseline-hashes.json"
  $BaselineRaw = if (Test-Path $BaselineJsonPath) { [System.IO.File]::ReadAllText($BaselineJsonPath).TrimStart([char]0xFEFF) } else { "" }
  $PersonalSkillsDir = Join-Path $TargetConfigDir "skills"
  if ((-not [string]::IsNullOrWhiteSpace($BaselineRaw)) -and (Test-Path $PluginsDest)) {
    foreach ($newPdir in (Get-ChildItem -Path $SourcePluginsDir -Directory)) {
      $skillsSub = Join-Path $newPdir.FullName "skills"
      if (-not (Test-Path $skillsSub)) { continue }
      foreach ($newSdir in (Get-ChildItem -Path $skillsSub -Directory)) {
        $sid = $newSdir.Name
        $oldSdir = Join-Path $PluginsDest "$($newPdir.Name)\skills\$sid"
        $oldMd = Join-Path $oldSdir "SKILL.md"
        $newMd = Join-Path $newSdir.FullName "SKILL.md"
        if ((Test-Path $oldMd) -and (Test-Path $newMd)) {
          $oldSha = (Get-FileHash -Algorithm SHA256 -Path $oldMd).Hash.ToLowerInvariant()
          $newSha = (Get-FileHash -Algorithm SHA256 -Path $newMd).Hash.ToLowerInvariant()
          if (($oldSha -ne $newSha) -and (-not $BaselineRaw.Contains($oldSha))) {
            New-Item -ItemType Directory -Force -Path $PersonalSkillsDir | Out-Null
            $backupSlug = "$sid-saved"
            if (Test-Path (Join-Path $PersonalSkillsDir $backupSlug)) {
              $backupSlug = "$sid-saved-" + (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
            }
            $backupDest = Join-Path $PersonalSkillsDir $backupSlug
            Copy-Item -Recurse -Force -Path $oldSdir -Destination $backupDest
            $metaObj = @{
              slug         = $backupSlug
              forkedFrom   = $sid
              sourcePlugin = $newPdir.Name
              mode         = "copy"
              title        = "$sid (Saved Local Edits)"
              subtitle     = "Auto-preserved local edits before plugin upgrade"
              seedPrompt   = "/$backupSlug Run my customized workflow."
              createdAt    = (Get-Date).ToUniversalTime().ToString("o")
              updatedAt    = (Get-Date).ToUniversalTime().ToString("o")
            } | ConvertTo-Json -Depth 4
            [System.IO.File]::WriteAllText((Join-Path $backupDest ".agy-skill-meta.json"), ($metaObj + "`n"), $Utf8NoBom)
            Write-Host "Protected your local edits to /$sid -> $backupDest" -ForegroundColor Yellow
          }
        }
      }
    }
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
  Write-Host ("Installed {0} zero-footprint AGY plugins to {1}: {2}" -f $InstalledNames.Count, $PluginsDest, ($InstalledNames -join ", ")) -ForegroundColor Green

  if (-not [string]::IsNullOrWhiteSpace($GeInstance)) {
    $GeConfigPath = Join-Path $PluginDataDir "ge-instance.json"
    $Payload = @{
      rawInput          = $GeInstance
      oauthClientId     = $OAuthClientId
      oauthClientSecret = $OAuthClientSecret
      updatedAt         = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($GeConfigPath, ($Payload + "`n"), $Utf8NoBom)
    $AgyRoot = Join-Path (Split-Path -Parent $TargetConfigDir) "antigravity"
    if (Test-Path $AgyRoot) {
      $AgyDataDir = Join-Path $AgyRoot "plugin_data\agy-connectors"
      New-Item -ItemType Directory -Force -Path $AgyDataDir | Out-Null
      [System.IO.File]::WriteAllText((Join-Path $AgyDataDir "ge-instance.json"), ($Payload + "`n"), $Utf8NoBom)
    }
    Write-Host "Saved BOM-free Gemini Enterprise instance to $GeConfigPath" -ForegroundColor Green
  }

  $LedgerPath = Join-Path $TargetConfigDir "plugin_data\agy-onboarding\skill-toggles.json"
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
    } catch {}
  }

  Write-Host "`nReady! Open Google Antigravity -> Extensions -> My Antigravity or Skills (or run /agy-onboard) to begin." -ForegroundColor Green
} finally {
  if ($null -ne $StageDir -and (Test-Path $StageDir)) {
    Remove-Item -Recurse -Force -Path $StageDir -ErrorAction SilentlyContinue
  }
}

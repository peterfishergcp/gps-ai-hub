<#
.SYNOPSIS
  Fast (<2 second) Zero-Footprint installer & updater for the Public Sector Antigravity Suite (v2.0.2).
.DESCRIPTION
  Stages strictly inside $HOME\.gemini\config\.install_stage_<guid> (zero %TEMP% writes, zero
  local MCP subprocesses, zero standalone Node/Python/Git required). Verifies SHA-256 integrity
  of downloaded bundles (fail-closed), installs all 7 AGY plugins (3 UI panels: My Hub, Skills
  [with inline Ask Clawy], Preview; agy-twin-automations opt-in), auto-cleans deprecated legacy
  plugins and credential directories (agy-connectors, agy-coordinator) on upgrade, writes
  BOM-free UTF-8 JSON configs, and preserves user skill toggles, personal skills, and memory.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ZipUrl = "",

  [Parameter(Mandatory = $false)]
  [string]$Ref = "agy-v2.0.2",

  [Parameter(Mandatory = $false)]
  [string]$ExpectedSha256 = "",

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
$SuiteVersion = "2.0.2"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
if ($Ref -notmatch '^[A-Za-z0-9._/-]+$' -or $Ref.Contains('..')) {
  throw "Refusing invalid -Ref value: $Ref"
}
$DefaultZipUrl = "https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/$Ref/projects/generic-agy-plugin/dist/generic-agy-plugin.zip"

if ([string]::IsNullOrWhiteSpace($TargetConfigDir)) {
  $UserHome = [Environment]::GetFolderPath("UserProfile")
  if ([string]::IsNullOrWhiteSpace($UserHome)) { $UserHome = $HOME }
  $TargetConfigDir = Join-Path $UserHome ".gemini\config"
}
$PluginsDest = Join-Path $TargetConfigDir "plugins"
$PluginDataDest = Join-Path $TargetConfigDir "plugin_data"
$MemoryDataDir = Join-Path $PluginDataDest "my-antigravity\memory"

New-Item -ItemType Directory -Force -Path $PluginsDest | Out-Null
New-Item -ItemType Directory -Force -Path $MemoryDataDir | Out-Null

function Assert-ZipSha256 {
  param([string]$ZipPath, [string]$ExpectedHex)
  $cleanExpected = ($ExpectedHex -replace '^\s+|\s+$', '').Split()[0].ToLowerInvariant()
  if ($cleanExpected -notmatch '^[0-9a-f]{64}$') {
    throw "Refusing install: missing or malformed SHA-256 digest."
  }
  $actualHex = (Get-FileHash -Algorithm SHA256 -Path $ZipPath).Hash.ToLowerInvariant()
  if ($actualHex -ne $cleanExpected) {
    throw "SHA-256 integrity mismatch for $ZipPath (expected $cleanExpected, got $actualHex)"
  }
}

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
    Write-Host "Downloading Generic AGY Plugin Suite v$SuiteVersion ($Ref, <700 KB)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile -UseBasicParsing
    if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
      $ShaFile = Join-Path $StageDir "generic-agy-plugin.zip.sha256"
      Invoke-WebRequest -Uri "$ZipUrl.sha256" -OutFile $ShaFile -UseBasicParsing
      $ExpectedSha256 = [System.IO.File]::ReadAllText($ShaFile)
    }
    Assert-ZipSha256 -ZipPath $ZipFile -ExpectedHex $ExpectedSha256
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
    $LocalSha = Join-Path $SuiteRoot "dist\generic-agy-plugin.zip.sha256"
    if ([string]::IsNullOrWhiteSpace($ExpectedSha256) -and (Test-Path $LocalSha)) {
      $ExpectedSha256 = [System.IO.File]::ReadAllText($LocalSha)
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedSha256)) {
      Assert-ZipSha256 -ZipPath $LocalZip -ExpectedHex $ExpectedSha256
    }
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

  # Clean up deprecated plugins AND their retired credential directories from pre-v2.0.0 installs
  foreach ($legacyP in @("agy-connectors", "agy-coordinator")) {
    $legacyPath = Join-Path $PluginsDest $legacyP
    if (Test-Path $legacyPath) {
      Remove-Item -Recurse -Force -Path $legacyPath
    }
    $legacyDataPath = Join-Path $PluginDataDest $legacyP
    if (Test-Path $legacyDataPath) {
      Remove-Item -Recurse -Force -Path $legacyDataPath
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
  Write-Host ("Installed {0} zero-footprint AGY plugins (v{1}) to {2}: {3}" -f $InstalledNames.Count, $SuiteVersion, $PluginsDest, ($InstalledNames -join ", ")) -ForegroundColor Green

  try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.CommandLine -and ($_.CommandLine -match '--agy-sidecar=' -or $_.CommandLine -match 'coordinator-ui')
    } | ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  } catch {
    # Non-fatal if CIM is restricted on locked-down workstations
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

  Write-Host "`nReady! Open Google Antigravity -> Plugins -> My Hub, Skills (with Ask Clawy), or Preview (or run /agy-onboard) to begin." -ForegroundColor Green
} finally {
  if ($null -ne $StageDir -and (Test-Path $StageDir)) {
    Remove-Item -Recurse -Force -Path $StageDir -ErrorAction SilentlyContinue
  }
}

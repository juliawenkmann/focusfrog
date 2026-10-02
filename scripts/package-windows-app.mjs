#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const packageName = 'FocusFrog-win32';
const packageDir = path.join(distDir, packageName);
const resourcesDir = path.join(packageDir, 'resources');
const webuiDir = path.join(resourcesDir, 'webui');
const serverSrc = path.join(rootDir, 'scripts', 'focusfrog-server.mjs');
const iconSrc = path.join(rootDir, 'static', 'logo.png');
const zipPath = path.join(distDir, `${packageName}.zip`);
const webuiTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'focusfrog-webui-'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function copyDirectoryContents(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir)) {
    fs.cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), {
      recursive: true,
      force: true,
    });
  }
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function writeWindowsText(filePath, text) {
  writeText(filePath, text.replace(/\n/g, '\r\n'));
}

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore', shell: false });
  return !result.error && result.status === 0;
}

function createArchive() {
  fs.rmSync(zipPath, { force: true });

  if (process.platform === 'win32' && commandExists('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'])) {
    run(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Compress-Archive -Path '${packageName}' -DestinationPath '${packageName}.zip' -Force`,
      ],
      { cwd: distDir }
    );
    return true;
  }

  if (commandExists('zip', ['--version'])) {
    run('zip', ['-qr', `${packageName}.zip`, packageName], { cwd: distDir });
    return true;
  }

  console.warn('No zip tool found; created the portable folder without a .zip archive.');
  return false;
}

const cmdLauncher = `@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-FocusFrog.ps1"
`;

const powershellLauncher = String.raw`$ErrorActionPreference = 'Stop'

function Show-FocusFrogMessage([string]$Message) {
  try {
    Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
    [System.Windows.MessageBox]::Show($Message, 'FocusFrog') | Out-Null
  } catch {
    Write-Host $Message
  }
}

function Test-FocusFrogUrl([string]$Url) {
  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Get-FocusFrogHealth([string]$Url) {
  try {
    return Invoke-RestMethod -Uri $Url -UseBasicParsing -TimeoutSec 1
  } catch {
    return $null
  }
}

function Test-FocusFrogServerCurrent([string]$Url, [string]$ExpectedDist) {
  $health = Get-FocusFrogHealth $Url
  try {
    $currentDist = [System.IO.Path]::GetFullPath([string]$health.distDir)
    $expectedDistPath = [System.IO.Path]::GetFullPath($ExpectedDist)
  } catch {
    return $false
  }
  return [bool](
    $health -and
    $health.app -eq 'FocusFrog' -and
    $health.apiVersion -eq 2 -and
    $health.capabilities -and
    $health.capabilities.visionBoardImages -and
    $currentDist -eq $expectedDistPath
  )
}

function Get-ActivityWatchTarget {
  if ($env:AW_API_TARGET) {
    $candidate = $env:AW_API_TARGET.TrimEnd('/')
    if (Test-FocusFrogUrl "$candidate/api/0/info") {
      return $candidate
    }
  }

  foreach ($target in @('http://127.0.0.1:5600', 'http://127.0.0.1:5666')) {
    if (Test-FocusFrogUrl "$target/api/0/info") {
      return $target
    }
  }

  return $null
}

function Start-ActivityWatch {
  $candidates = @()
  if ($env:LOCALAPPDATA) {
    $candidates += Join-Path $env:LOCALAPPDATA 'Programs\ActivityWatch\ActivityWatch.exe'
    $candidates += Join-Path $env:LOCALAPPDATA 'Programs\ActivityWatch\aw-qt.exe'
    $candidates += Join-Path $env:LOCALAPPDATA 'ActivityWatch\ActivityWatch.exe'
    $candidates += Join-Path $env:LOCALAPPDATA 'ActivityWatch\aw-qt.exe'
  }
  if ($env:ProgramFiles) {
    $candidates += Join-Path $env:ProgramFiles 'ActivityWatch\ActivityWatch.exe'
    $candidates += Join-Path $env:ProgramFiles 'ActivityWatch\aw-qt.exe'
  }
  $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  if ($programFilesX86) {
    $candidates += Join-Path $programFilesX86 'ActivityWatch\ActivityWatch.exe'
    $candidates += Join-Path $programFilesX86 'ActivityWatch\aw-qt.exe'
  }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      Start-Process -FilePath $candidate -WindowStyle Minimized
      return
    }
  }

  $awQt = Get-Command 'aw-qt.exe' -ErrorAction SilentlyContinue
  if ($awQt) {
    Start-Process -FilePath $awQt.Source -WindowStyle Minimized
  }
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Resources = Join-Path $Root 'resources'
$ServerScript = Join-Path $Resources 'focusfrog-server.mjs'
$WebuiDir = Join-Path $Resources 'webui'
$Port = if ($env:FOCUSFROG_PORT) { $env:FOCUSFROG_PORT } else { '27180' }
$FocusFrogUrl = "http://127.0.0.1:$Port/#/home"
$HealthUrl = "http://127.0.0.1:$Port/focusfrog-healthz"
$LogDir = Join-Path $env:TEMP 'FocusFrog'
$ServerOutLog = Join-Path $LogDir 'focusfrog-server.out.log'
$ServerErrLog = Join-Path $LogDir 'focusfrog-server.err.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$AwTarget = Get-ActivityWatchTarget
if (-not $AwTarget) {
  Start-ActivityWatch
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $AwTarget = Get-ActivityWatchTarget
    if ($AwTarget) {
      break
    }
  }
}

if (-not $AwTarget) {
  $AwTarget = 'http://127.0.0.1:5600'
  Show-FocusFrogMessage 'I could not reach ActivityWatch yet. I will open FocusFrog, but time data may load only after ActivityWatch is running.'
}

if (-not (Test-FocusFrogServerCurrent $HealthUrl $WebuiDir)) {
  $staleHealth = Get-FocusFrogHealth $HealthUrl
  if ($staleHealth -and $staleHealth.app -eq 'FocusFrog') {
    $stalePids = @()
    if ($staleHealth.pid) {
      $stalePids += [int]$staleHealth.pid
    } else {
      $stalePids += @(
        Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess -Unique
      )
    }
    foreach ($stalePid in $stalePids) {
      Stop-Process -Id $stalePid -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
  }

  $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
  if (-not $node) {
    Show-FocusFrogMessage 'FocusFrog needs Node.js to run this portable Windows package. Node.js was not found on PATH.'
    exit 1
  }

  $nodeMajor = 0
  try {
    $nodeMajor = [int]([string](& $node.Source -p "Number(process.versions.node.split('.')[0])"))
  } catch {
    $nodeMajor = 0
  }
  if ($nodeMajor -lt 20) {
    Show-FocusFrogMessage 'FocusFrog needs Node.js 20 or newer to run this portable Windows package.'
    exit 1
  }

  $env:AW_API_TARGET = $AwTarget
  $env:FOCUSFROG_DIST = $WebuiDir
  $env:FOCUSFROG_PORT = $Port

  $serverStartArgs = @{
    FilePath = $node.Source
    ArgumentList = ('"' + $ServerScript + '"')
    WorkingDirectory = $Root
    WindowStyle = 'Hidden'
    RedirectStandardOutput = $ServerOutLog
    RedirectStandardError = $ServerErrLog
  }
  Start-Process @serverStartArgs

  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-FocusFrogServerCurrent $HealthUrl $WebuiDir) {
      break
    }
  }
}

if (-not (Test-FocusFrogServerCurrent $HealthUrl $WebuiDir)) {
  Show-FocusFrogMessage "FocusFrog could not start its local server. See $ServerErrLog for details."
  exit 1
}

Start-Process $FocusFrogUrl
`;

const windowsReadme = `FocusFrog for Windows
=====================

Run FocusFrog.cmd to start the local FocusFrog server and open the dashboard.

Requirements:
- Node.js 20 or newer must be installed and available on PATH.
- ActivityWatch should be installed or already running locally.

What the launcher does:
- Reuses ActivityWatch at http://127.0.0.1:5600 or http://127.0.0.1:5666 when available.
- Tries common ActivityWatch install paths if ActivityWatch is not already running.
- Starts FocusFrog on http://127.0.0.1:27180.
- Stores FocusFrog todos and planning state in %APPDATA%\\FocusFrog\\storage.json.

Logs:
%TEMP%\\FocusFrog\\focusfrog-server.out.log
%TEMP%\\FocusFrog\\focusfrog-server.err.log
`;

try {
  if (!fs.existsSync(serverSrc)) {
    throw new Error(`Launcher server not found: ${serverSrc}`);
  }

  console.log('Building FocusFrog web UI...');
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'run',
    'build',
    '--',
    '--dest',
    webuiTmp,
  ]);

  console.log(`Creating ${packageDir}...`);
  fs.mkdirSync(distDir, { recursive: true });
  fs.rmSync(packageDir, { recursive: true, force: true });
  fs.mkdirSync(webuiDir, { recursive: true });
  copyDirectoryContents(webuiTmp, webuiDir);

  fs.copyFileSync(serverSrc, path.join(resourcesDir, 'focusfrog-server.mjs'));
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, path.join(resourcesDir, 'FocusFrog.png'));
  }

  writeWindowsText(path.join(packageDir, 'FocusFrog.cmd'), cmdLauncher);
  writeText(path.join(packageDir, 'Start-FocusFrog.ps1'), powershellLauncher);
  writeWindowsText(path.join(packageDir, 'README-Windows.txt'), windowsReadme);

  const archived = createArchive();
  console.log(`Created ${packageDir}`);
  if (archived) {
    console.log(`Created ${zipPath}`);
  }
} finally {
  fs.rmSync(webuiTmp, { recursive: true, force: true });
}

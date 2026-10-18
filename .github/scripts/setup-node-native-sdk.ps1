$ErrorActionPreference = 'Stop'
$version = node -p 'process.versions.node'
$arch = node -p 'process.arch'
if ($arch -ne 'x64') { throw "Native Windows proof requires its configured x64 runner, got $arch" }
$root = Join-Path $env:RUNNER_TEMP 'apack-node-native-sdk'
New-Item -ItemType Directory -Force -Path $root | Out-Null
$base = "https://nodejs.org/dist/v$version"
$checksumFile = Join-Path $root 'SHASUMS256.txt'
Invoke-WebRequest "$base/SHASUMS256.txt" -OutFile $checksumFile -TimeoutSec 30
$checksums = Get-Content -Raw $checksumFile
function Download-Checked([string] $name, [string] $target) {
  $match = [regex]::Match($checksums, '(?m)^([a-f0-9]{64})\s+' + [regex]::Escape($name) + '\r?$')
  if (-not $match.Success) { throw "Missing Node checksum for $name" }
  Invoke-WebRequest "$base/$name" -OutFile $target -TimeoutSec 30
  if ((Get-FileHash -Algorithm SHA256 $target).Hash.ToLowerInvariant() -ne $match.Groups[1].Value) {
    throw "Node SDK checksum differs: $name"
  }
}
$headers = Join-Path $root 'headers.tar.gz'
$importLibrary = Join-Path $root 'node.lib'
Download-Checked "node-v$version-headers.tar.gz" $headers
Download-Checked "win-$arch/node.lib" $importLibrary
tar -xzf $headers -C $root
if ($LASTEXITCODE -ne 0) { throw 'Cannot extract Node headers' }
$include = Join-Path $root "node-v$version/include/node"
if (-not (Test-Path (Join-Path $include 'node_api.h'))) { throw 'Node API header is missing' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installation) { throw 'MSVC x64 toolchain is missing' }
$vcvars = Join-Path $installation 'VC/Auxiliary/Build/vcvars64.bat'
$compilerEnvironment = & cmd.exe /d /s /c "call `"$vcvars`" >nul && set"
if ($LASTEXITCODE -ne 0) { throw 'Cannot configure MSVC environment' }
foreach ($line in $compilerEnvironment) {
  if ($line -match '^(PATH|INCLUDE|LIB|LIBPATH)=(.*)$') {
    "$($Matches[1])=$($Matches[2])" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  }
}
"APACK_TEST_NODE_HEADERS=$include" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
"APACK_TEST_NODE_IMPORT_LIBRARY=$importLibrary" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
Write-Output "Native proof SDK: Node $version / $arch"

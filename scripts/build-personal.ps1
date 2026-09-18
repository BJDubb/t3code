param(
  [string]$Version,
  [string]$OutputDirectory = 'release/personal'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!(Test-Path 'apps/server/package.json')) { throw 'Run from the T3 Code checkout.' }
if (!$Version) {
  $baseVersion = (Get-Content 'apps/server/package.json' -Raw | ConvertFrom-Json).version -replace '-.*$', ''
  $Version = "$baseVersion-preview.$(Get-Date -Format yyyyMMdd).$(Get-Date -Format HHmmss)"
}
if ($Version -notmatch '^\d+\.\d+\.\d+-preview\.\d{8}\.\d+$') {
  throw 'Use X.Y.Z-preview.YYYYMMDD.N so the packaged app has no upstream update feed.'
}
& git diff --quiet HEAD
if ($LASTEXITCODE -ne 0) { throw 'Commit tracked changes before building a personal release.' }
if (@(& git ls-files --others --exclude-standard).Count -gt 0) {
  throw 'Commit or ignore untracked files before building a personal release.'
}

# Public client configuration from official 0.0.42 (719a76ca1dbf). These are
# application identifiers, not credentials. Do not copy upstream telemetry tokens.
$env:T3CODE_CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsudDMuY29kZXMk'
$env:T3CODE_CLERK_JWT_TEMPLATE = 't3-relay'
$env:T3CODE_CLERK_CLI_OAUTH_CLIENT_ID = 'hzxSgY2cH10sDU2r'
$env:T3CODE_RELAY_URL = 'https://relay.t3.codes'
$env:T3CODE_DESKTOP_SIGNED = 'false'
$env:T3CODE_DESKTOP_MOCK_UPDATES = 'false'
$env:T3CODE_DESKTOP_SKIP_BUILD = 'false'
Remove-Item Env:T3CODE_DESKTOP_WSL_RUNTIME -ErrorAction SilentlyContinue
Remove-Item Env:T3CODE_DESKTOP_UPDATE_REPOSITORY -ErrorAction SilentlyContinue

& node scripts/build-desktop-artifact.ts --platform win --target nsis --arch x64 --build-version $Version --output-dir $OutputDirectory --verbose
if ($LASTEXITCODE -ne 0) { throw "Desktop build failed ($LASTEXITCODE)." }
$installer = Join-Path $OutputDirectory "T3-Code-$Version-x64.exe"
if (!(Test-Path $installer)) { throw "Missing installer: $installer" }
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path $installer -Leaf)" | Set-Content -LiteralPath "$installer.sha256" -Encoding ascii
Write-Host "Installer: $((Resolve-Path $installer).Path)"
Write-Host "SHA256: $hash"

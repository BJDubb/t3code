param(
  [ValidateSet('build', 'setup', 'credentials', 'config', 'submit', 'status', 'list', 'register', 'devices', 'setup-direct', 'build-direct', 'update')]
  [string]$Action = 'build'
)
$ErrorActionPreference = 'Stop'
$mobile = Join-Path (Split-Path $PSScriptRoot -Parent) 'apps/mobile'
Set-Location $mobile
$profile = (Get-Content eas.json -Raw | ConvertFrom-Json).build.personal
foreach ($property in $profile.env.PSObject.Properties) {
  [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
}
switch ($Action) {
  'build' { & eas workflow:run .eas/workflows/personal-store-build.yml --non-interactive }
  'setup' { & eas credentials:configure-build --profile personal --platform ios }
  'credentials' { & eas credentials --platform ios }
  'config' { & vp exec expo config --type public --json }
  'submit' {
    $buildJson = & eas build:list --build-profile personal --platform ios --distribution store --status finished --limit 1 --json --non-interactive
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $builds = @($buildJson | ConvertFrom-Json)
    if ($builds.Count -eq 0) { throw 'No completed personal TestFlight build found. Run the build action first.' }
    & eas submit --profile personal --platform ios --id $builds[0].id --non-interactive
  }
  'status' { & eas submit:status --profile personal --platform ios --non-interactive }
  'list' { & eas build:list --build-profile personal --platform ios --limit 5 --non-interactive }
  'register' { & eas device:create }
  'devices' { & eas device:list --apple-team-id $profile.env.T3CODE_PERSONAL_APPLE_TEAM_ID --non-interactive }
  'setup-direct' { & eas credentials:configure-build --profile personal-direct --platform ios }
  'build-direct' {
    # Resolve native fingerprints in the cloud, consistently with OTA publishing.
    & eas workflow:run .eas/workflows/personal-build.yml --non-interactive
  }
  'update' { & eas workflow:run .eas/workflows/personal-update.yml --non-interactive }
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

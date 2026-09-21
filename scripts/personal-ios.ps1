param(
  [ValidateSet('build', 'setup', 'credentials', 'config', 'submit')]
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
  'build' { & eas build --profile personal --platform ios --non-interactive --no-wait }
  'setup' { & eas build --profile personal --platform ios --no-wait }
  'credentials' { & eas credentials --platform ios }
  'config' { & vp exec expo config --type public --json }
  'submit' { & eas submit --profile personal --platform ios }
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

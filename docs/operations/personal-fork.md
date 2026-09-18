# Personal Windows builds

`main` follows upstream. `personal` contains the UI customization and this build
setup. Do not reset `personal` to upstream or use GitHub's discard-changes sync.

## Build and install

Build a committed checkout with `pwsh -File scripts/build-personal.ps1`. Local
builds need the Windows prerequisites checked by `build-desktop-artifact.ts`,
including Rust, Python and Visual Studio C++ tools with Spectre libraries.
The installer and its SHA-256 are written to `release/personal`.

Alternatively, push a tag such as `personal-v0.0.42-preview.20260918.1` to
`origin`. The Personal Windows installer workflow builds that exact revision;
download the installer artifact from its Actions run. Builds are unsigned and
omit WSL. They use upstream's preview version format specifically to omit the
update feed, even on GitHub runners. Updates are installed manually.

Keep the standard application identity to reuse the installed desktop profile.
Before replacing an installation, quit T3 and back up both `%USERPROFILE%\.t3`
and `%APPDATA%\t3code` (or the legacy `%APPDATA%\T3 Code (Alpha)` if present).
Never run production and test copies against the same data. Test packaged builds
with separate `T3CODE_HOME` and `APPDATA` directories before cutting over.

Keep the previous installer and the matching data backup together. Rolling back
across a database migration may require restoring that backup and will lose work
created after it; installing an older executable alone is not a safe rollback.

The build script includes only the official release's public T3 Connect client
identifiers, not telemetry credentials. Recheck these and sign-in compatibility
when upstream changes its authentication configuration.

## Adopt an upstream release

Start from a clean checkout. Fetch upstream tags, create an update branch from
`personal`, and merge the selected release tag. For example, replacing the
placeholder with a real release:

```powershell
git fetch upstream --tags
git switch personal
git switch -c update/t3-release
git merge <upstream-release-tag>
```

Resolve conflicts, then run the focused test command in
`.github/workflows/personal-windows.yml` and web/server checks appropriate to
the changed code. Verify the real tool-call playground: separate collapsed
calls, intent headings, failures, colored output, long output expansion, MCP
parameters/results, and file diffs. Also verify desktop startup and connections.

Once verified, fast-forward `personal` to the update branch, push it, and create
a new `personal-vX.Y.Z-preview.YYYYMMDD.N` tag to build an installer. Tags are
immutable release records; use a new number for a rebuild. No force-push is
needed. Keep the installer locally because Actions artifacts expire after 30 days.

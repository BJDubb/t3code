# Personal iOS builds

The `personal` EAS profile builds T3 Code Personal for TestFlight under
`neps-beck/t3-code-personal`. It uses bundle ID `com.bjdubb.t3code.personal`
and Apple team `QYLD5HP4HU`. This is a paid-team build with sharing and widget
extensions; do not enable `T3CODE_IOS_PERSONAL_TEAM`, which removes capabilities.

From the repository root on Windows:

```powershell
pwsh -File scripts/personal-ios.ps1 setup
```

The first run needs interactive Apple authentication and provisioning for all
three targets. Confirm the selected paid team in the Apple prompt. EAS can
reuse an existing distribution certificate; do not revoke certificates used
by other apps. Enter passwords and verification codes only in the CLI prompts.

After signing credentials exist, start later builds with:

```powershell
pwsh -File scripts/personal-ios.ps1 build
```

The wrapper loads the personal profile before EAS resolves the Expo project,
so it cannot select upstream's project from the default app configuration.
Use `config` to inspect the public configuration. The app's sharing and widget
targets use its own application group. OTA updates use this fork's Expo project
and `personal` channel. The personal profile uses the `fingerprint` runtime
policy, so bundles that require different native code cannot reach an older
installation. Windows and macOS resolve some fingerprint inputs differently;
use the cloud workflows below for OTA-capable builds and publishing.

Once a build succeeds, run `pwsh -File scripts/personal-ios.ps1 submit` to upload
the latest completed store build from the `personal` profile. Direct-install
builds are excluded. Submission uses the separate `personal` profile,
never upstream's App Store Connect app ID. The first submission needs an app
record in your App Store Connect account and Apple submission credentials.
The submission profile pins this fork's App Store Connect app ID, `6814363017`.
Check build history with `pwsh -File scripts/personal-ios.ps1 list` and Apple
processing/testing status with `pwsh -File scripts/personal-ios.ps1 status`.
Internal testers must belong to an internal testing group for this app in
App Store Connect. External testing needs Apple's beta review before an external
invitation or public testing link can install the build.

## Direct installation without TestFlight

The `personal-direct` profile inherits the personal app identity and public
configuration, but uses ad hoc signing. The resulting Release app installs from
an EAS link and runs without Metro. It replaces an existing installation of
T3 Code Personal because the bundle ID stays the same.

Run `pwsh -File scripts/personal-ios.ps1 register` and choose website registration.
Open the registration link in Safari on the iPhone and complete the device
registration. Check it with `pwsh -File scripts/personal-ios.ps1 devices`.
For initial ad hoc provisioning, run `pwsh -File scripts/personal-ios.ps1 setup-direct`.
Initial setup assigns a distribution certificate to the ad hoc credentials for
each target. EAS can reuse the fresh Apple session from registration for this
interactive step. Later builds use `pwsh -File scripts/personal-ios.ps1 build-direct`
to reuse the configured signing profiles without an Apple password or
verification-code prompt. Re-run `setup-direct` to include a newly registered
phone in all three targets' profiles. The command
uploads the checkout and runs `personal-build.yml` in EAS Workflows, which
resolves the native fingerprint in the cloud. This requires
EAS CLI 19.1.0 or later. Open the completed build's EAS installation
link on the registered phone. Adding another phone needs a fresh build or re-sign.

The current EAS device-registration command requires an interactive Apple login;
Apple can expire that saved session. For a single phone, register it once and
then use the API-key build commands above. Build, submit, and status commands
run non-interactively and report an error rather than opening a new login prompt.
If the stored API key is revoked or lacks provisioning permissions, fix its
configuration through `credentials`. Expired or revoked signing certificates
may also need an explicit credentials setup.

## OTA publishing

After installing an OTA-enabled build, publish compatible JavaScript changes
with `pwsh -File scripts/personal-ios.ps1 update`. This runs
`apps/mobile/.eas/workflows/personal-update.yml` in the cloud and publishes only
to the personal project's iOS `personal` channel. Its public environment must
match the personal build profile. Do not publish this fingerprinted runtime
directly from Windows. Native dependency/config changes require a fresh build;
fingerprint matching prevents the incompatible update from loading.

In the app, Settings → App updates shows the installed version/build, running
bundle/update, runtime, channel, pending update, and last check. Check for updates
downloads a compatible update; Restart to install update saves pending writes
before restarting. Automatic checks use the same safe restart flow.
Build 11 and earlier had OTA disabled and need a direct installation of the
first OTA-enabled binary before they can receive updates.

Direct installation does not change the hosted T3 Connect authentication
requirements below. See [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

## Connections and data

Keep the official app installed during verification. Pair the personal app to
the existing server to access its projects and conversations. Phone-local
credentials and preferences do not migrate from the official app's sandbox.

The profile embeds the same public Clerk and relay configuration as the desktop
fork. This does not grant a new app identity access to every hosted capability.
As checked on 2026-10-12, `clerk.t3.codes/.well-known/apple-app-site-association`
lists upstream's Apple team/apps, not this fork. Native passkey association
requires the service owner to add this team and bundle ID. Push delivery and
native Apple sign-in also need verification/configuration for the new identity;
retaining their entitlements is not proof the hosted services support them.
Clerk's production native authentication also requires registering this fork's
bundle ID and Apple team in the service owner's Native applications settings,
plus the callback allowlist for any mobile SSO used. See
[Clerk's Expo deployment requirements](https://clerk.com/docs/guides/development/deployment/expo).
Changing the local Expo config alone cannot grant this hosted registration.

Before relying on this app, verify direct/remote pairing, existing threads,
sending a message, attachments, terminal access, and reconnecting after the app
is backgrounded. Separately verify any hosted authentication and notifications
you use. A successful EAS build alone does not establish remote feature parity.

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
targets use its own application group. OTA updates are disabled and the update
URL belongs to this fork, so the app runs only the bundle shipped in its build.

Once a build succeeds, run `pwsh -File scripts/personal-ios.ps1 submit` and
select that personal build. Submission uses the separate `personal` profile,
never upstream's App Store Connect app ID. The first submission needs an app
record in your App Store Connect account and Apple submission credentials.
TestFlight installation/testing follows Apple's normal processing requirements.

## Connections and data

Keep the official app installed during verification. Pair the personal app to
the existing server to access its projects and conversations. Phone-local
credentials and preferences do not migrate from the official app's sandbox.

The profile embeds the same public Clerk and relay configuration as the desktop
fork. This does not grant a new app identity access to every hosted capability.
As checked on 2026-09-21, `clerk.t3.codes/.well-known/apple-app-site-association`
lists upstream's Apple team/apps, not this fork. Native passkey association
requires the service owner to add this team and bundle ID. Push delivery and
native Apple sign-in also need verification/configuration for the new identity;
retaining their entitlements is not proof the hosted services support them.

Before relying on this app, verify direct/remote pairing, existing threads,
sending a message, attachments, terminal access, and reconnecting after the app
is backgrounded. Separately verify any hosted authentication and notifications
you use. A successful EAS build alone does not establish remote feature parity.

import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { ScreenScrollView } from "../../components/ScreenScrollView";
import {
  type AppUpdateCheckState,
  isAppUpdateCheckAvailable,
  runAppUpdateCheck,
} from "../updates/app-updates";
import { SettingsActionRow } from "./components/SettingsActionRow";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";

export function SettingsUpdatesRouteScreen() {
  const insets = useSafeAreaInsets();
  const updates = Updates.useUpdates();
  const [state, setState] = useState<AppUpdateCheckState>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false);
  const enabled = isAppUpdateCheckAvailable();
  const current = updates.currentlyRunning;
  const pending = updates.downloadedUpdate ?? updates.availableUpdate;
  const busy =
    updates.isChecking ||
    updates.isDownloading ||
    updates.isRestarting ||
    state === "checking" ||
    state === "downloading" ||
    state === "restarting";
  const version = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "Unknown";
  const build = Constants.nativeBuildVersion;
  const status = !enabled
    ? "Updates are unavailable in this build"
    : updates.isRestarting || state === "restarting"
      ? "Restarting…"
      : updates.isDownloading
        ? `Downloading${updates.downloadProgress === undefined ? "…" : ` ${Math.round(updates.downloadProgress * 100)}%`}`
        : updates.isChecking
          ? "Checking…"
          : updates.isUpdatePending || state === "ready"
            ? "Update ready to install"
            : updates.isUpdateAvailable
              ? "Update available"
              : state === "current"
                ? "Up to date"
                : "Automatic updates enabled";
  const error = failure ?? updates.downloadError?.message ?? updates.checkError?.message;

  const check = async (install: boolean) => {
    if (inFlight.current || !enabled) return;
    inFlight.current = true;
    setFailure(null);
    try {
      await runAppUpdateCheck({
        applyMode: install ? "immediate" : "background",
        onFailure: setFailure,
        onStateChange: setState,
      });
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <SettingsScreen title="App updates">
      <ScreenScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title="Running">
          <View className="gap-2 p-4">
            <Text className="font-t3-medium text-lg">
              {Constants.expoConfig?.name ?? "T3 Code"} {version}
              {build ? ` (${build})` : ""}
            </Text>
            <Text selectable className="text-sm text-foreground-muted">
              {current.isEmbeddedLaunch
                ? "Installed bundle"
                : current.updateId
                  ? `OTA ${current.updateId}`
                  : "Development session"}
            </Text>
            {current.createdAt ? (
              <Text className="text-sm text-foreground-muted">
                {current.createdAt.toLocaleString()}
              </Text>
            ) : null}
            <Text className="text-sm text-foreground-muted">
              Channel: {current.channel ?? "Not configured"}
            </Text>
            <Text selectable className="text-xs text-foreground-muted">
              Runtime: {current.runtimeVersion ?? "Not configured"}
            </Text>
            {current.isEmergencyLaunch ? (
              <Text className="text-sm text-danger-foreground">
                The last update could not start. The app recovered using its installed bundle.
              </Text>
            ) : null}
          </View>
        </SettingsSection>
        <SettingsSection title="Updates">
          <View className="gap-2 p-4">
            <Text accessibilityLiveRegion="polite" className="text-base">
              {status}
            </Text>
            {pending ? (
              <Text selectable className="text-sm text-foreground-muted">
                {pending.type === "rollback"
                  ? "Return to installed bundle"
                  : `Next: ${pending.updateId}`}{" "}
                · {pending.createdAt.toLocaleString()}
              </Text>
            ) : null}
            {updates.lastCheckForUpdateTimeSinceRestart ? (
              <Text className="text-sm text-foreground-muted">
                Last checked: {updates.lastCheckForUpdateTimeSinceRestart.toLocaleString()}
              </Text>
            ) : null}
            {error ? (
              <Text selectable className="text-sm text-danger-foreground">
                {error}
              </Text>
            ) : null}
          </View>
          <SettingsActionRow
            icon="arrow.clockwise"
            label="Check for updates"
            loading={updates.isChecking}
            disabled={!enabled || busy}
            onPress={() => void check(false)}
          />
          {updates.isUpdatePending || state === "ready" ? (
            <SettingsActionRow
              icon="arrow.clockwise"
              label="Restart to install update"
              disabled={!enabled || busy}
              onPress={() =>
                Alert.alert(
                  "Install update?",
                  "T3 Code will save your pending changes and restart.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Restart", onPress: () => void check(true) },
                  ],
                )
              }
            />
          ) : null}
        </SettingsSection>
        <Text className="px-2 text-sm text-foreground-muted">
          Updates download automatically and apply when the app can safely restart. Changes to
          native features require a new app installation.
        </Text>
      </ScreenScrollView>
    </SettingsScreen>
  );
}

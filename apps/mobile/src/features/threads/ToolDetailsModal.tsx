import { useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ScopedTheme, ScopedVariables, withUniwind } from "uniwind";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { getMobileUniwindThemeName } from "../../lib/mobileThemeRuntime";

import {
  commandScriptBody,
  displayShellCommand,
  plainToolOutput,
  shellDisplayTokens,
  shellLanguage,
} from "@t3tools/client-runtime/work-log/tool-command-presentation";
import { AppText as Text } from "../../components/AppText";
import { tryCopyTextWithHaptic } from "../../lib/copyTextWithHaptic";

const ThemedSafeAreaView = withUniwind(SafeAreaView);

const TOKEN_COLORS = {
  plain: "text-foreground",
  command: "text-adaptive-blue-600-400",
  operator: "text-foreground-muted",
  comment: "text-foreground-muted",
  string: "text-adaptive-emerald-600-400",
  variable: "text-adaptive-blue-600-400",
  parameter: "text-foreground-muted",
  number: "text-adaptive-emerald-600-400",
};

function CodeText({ text, language }: { text: string; language: string }) {
  const tokens = useMemo(
    () =>
      text.length <= 32_000 && (language === "powershell" || language === "shellscript")
        ? shellDisplayTokens(text)
        : null,
    [text, language],
  );
  return (
    <Text selectable className="font-mono text-xs leading-relaxed">
      {tokens
        ? tokens.map((token) => (
            <Text key={token.start} className={`font-mono ${TOKEN_COLORS[token.kind]}`}>
              {token.text}
            </Text>
          ))
        : text}
    </Text>
  );
}

function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={async () => setCopied(await tryCopyTextWithHaptic(text))}
      className="min-h-11 justify-center px-3 active:opacity-70"
    >
      <Text className="text-xs text-foreground-muted">{copied ? "Copied" : "Copy"}</Text>
    </Pressable>
  );
}

/** Full details mount only after a compact activity row is opened. */
export function ToolDetailsModal(props: {
  command?: string | undefined;
  rawCommand?: string | undefined;
  output?: string | undefined;
  detail?: string | undefined;
  detailContent?: ReactNode;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const appearance = useAppearancePreferences();
  if (!props.open) return null;
  const invocation = props.rawCommand ?? props.command ?? "";
  const command = displayShellCommand(invocation);
  const script = commandScriptBody(invocation);
  const language = script?.language ?? shellLanguage(invocation);
  const output = props.output ? plainToolOutput(props.output) : "";
  const sections = props.command
    ? [
        { title: "Command", text: script?.text ?? command, language },
        ...(output ? [{ title: "Output", text: output, language: "text" }] : []),
        ...(script || invocation !== command
          ? [{ title: "Invocation", text: invocation, language: shellLanguage(invocation) }]
          : []),
      ]
    : [{ title: "Details", text: props.detail ?? "", language: "text" }];
  const section = sections[sectionIndex] ?? sections[0]!;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={props.onClose}
      onDismiss={props.onClose}
    >
      <ScopedTheme
        theme={getMobileUniwindThemeName(appearance.themeId, appearance.themeAppearance)}
      >
        <ScopedVariables variables={appearance.themeVariables}>
          <SafeAreaProvider>
            <ThemedSafeAreaView className="flex-1 bg-screen">
              <View className="min-h-12 flex-row items-center justify-between border-b border-border px-4">
                <Text className="font-t3-medium text-base">
                  {props.command ? "Tool details" : "Details"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close tool details"
                  onPress={props.onClose}
                  className="min-h-11 justify-center px-3 active:opacity-70"
                >
                  <Text className="text-sm text-adaptive-blue-600-400">Done</Text>
                </Pressable>
              </View>
              <Text numberOfLines={3} className="px-4 py-3 font-t3-medium text-sm">
                {props.title ?? "Command"}
              </Text>
              <View className="flex-row items-center border-b border-border px-2">
                {sections.map((item, index) => (
                  <Pressable
                    key={item.title}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: index === sectionIndex }}
                    onPress={() => setSectionIndex(index)}
                    className="min-h-11 justify-center px-3"
                  >
                    <Text
                      className={
                        index === sectionIndex
                          ? "text-sm text-adaptive-blue-600-400"
                          : "text-sm text-foreground-muted"
                      }
                    >
                      {item.title}
                    </Text>
                  </Pressable>
                ))}
                <View className="flex-1" />
                <CopyText text={section.text} label={`Copy ${section.title.toLowerCase()}`} />
              </View>
              <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
                {props.detailContent && !props.command ? (
                  props.detailContent
                ) : (
                  <CodeText text={section.text} language={section.language} />
                )}
              </ScrollView>
            </ThemedSafeAreaView>
          </SafeAreaProvider>
        </ScopedVariables>
      </ScopedTheme>
    </Modal>
  );
}

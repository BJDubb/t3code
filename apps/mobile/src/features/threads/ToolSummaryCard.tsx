import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { tryCopyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { toolSummaryLabel, type ToolSummary } from "@t3tools/shared/toolSummary";

function Copy({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState(label);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={async () =>
        setStatus((await tryCopyTextWithHaptic(value)) ? "Copied" : "Copy failed")
      }
      className="py-2"
    >
      <Text className="text-xs text-foreground-muted">{status}</Text>
    </Pressable>
  );
}

export function ToolSummaryCard({
  summary,
  details,
}: {
  summary: ToolSummary;
  details: string | null;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [all, setAll] = useState(false);
  return (
    <View className="gap-2">
      {summary.kind === "web" ? (
        <>
          <Text selectable className="text-xs text-foreground-muted">
            {summary.action === "search"
              ? [
                  summary.queries.join(" · "),
                  summary.resultCount !== undefined ? `${summary.resultCount} results` : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : summary.action === "findInPage"
                ? `Find “${summary.pattern ?? ""}”`
                : "Opened page"}
          </Text>
          {(all ? summary.results : summary.results.slice(0, 3)).map((result) => (
            <View key={result.id} className="gap-1">
              <Text selectable className="text-xs font-t3-bold">
                {result.title}
              </Text>
              {result.domain ? (
                <Text className="text-xs text-foreground-muted">{result.domain}</Text>
              ) : null}
              {result.snippet && !/^Total lines: \d+$/.test(result.snippet) ? (
                <Text selectable className="text-xs text-foreground-muted">
                  {result.snippet}
                </Text>
              ) : null}
              {result.url ? (
                <View className="flex-row gap-4">
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(result.url!)}
                    className="py-2"
                  >
                    <Text className="text-xs text-foreground-muted">Open in browser ↗</Text>
                  </Pressable>
                  <Copy value={result.url} label="Copy URL" />
                </View>
              ) : null}
            </View>
          ))}
          {!summary.results.length && summary.url ? (
            <View className="flex-row gap-4">
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(summary.url!)}
                className="py-2"
              >
                <Text className="text-xs">Open in browser ↗</Text>
              </Pressable>
              <Copy value={summary.url} label="Copy URL" />
            </View>
          ) : null}
          {summary.results.length > 3 ? (
            <Pressable accessibilityRole="button" onPress={() => setAll(!all)} className="py-2">
              <Text className="text-xs text-foreground-muted">
                {all ? "Show fewer results" : "Show more results"}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : summary.kind === "credentials" ? (
        <>
          <Text className="text-xs text-foreground-muted">
            {[summary.query, summary.environment, `${summary.count} matches`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {summary.credentials.map((credential) => (
            <View key={credential.id ?? credential.name}>
              <Text selectable className="text-xs font-t3-bold">
                {credential.name}
              </Text>
              <Text selectable className="text-xs text-foreground-muted">
                {[credential.account, credential.folder].filter(Boolean).join(" · ")}
              </Text>
              {showDetails && credential.id ? <Copy value={credential.id} label="Copy ID" /> : null}
            </View>
          ))}
          <Text className="text-xs text-foreground-muted">Metadata only</Text>
        </>
      ) : (
        <>
          <Text className="text-xs font-t3-bold">{toolSummaryLabel(summary)}</Text>
          {summary.purpose ? (
            <Text selectable className="text-xs">
              {summary.purpose}
            </Text>
          ) : null}
          <Text className="text-xs text-foreground-muted">
            {[
              summary.credentialCount ? `${summary.credentialCount} credentials` : undefined,
              summary.outputMode ? `${summary.outputMode} output` : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {summary.withheld ? (
            <Text className="text-xs">Output withheld</Text>
          ) : (
            <>
              {summary.stdout ? (
                <Text selectable className="font-mono text-xs">
                  {summary.stdout}
                </Text>
              ) : null}
              {summary.stderr ? (
                <>
                  <Text className="text-xs font-t3-bold">Standard error</Text>
                  <Text selectable className="font-mono text-xs">
                    {summary.stderr}
                  </Text>
                </>
              ) : null}
              {!summary.stdout && !summary.stderr ? (
                <Text className="text-xs text-foreground-muted">No output</Text>
              ) : null}
            </>
          )}
          {summary.truncated ? (
            <Text className="text-xs text-foreground-muted">Output preview truncated</Text>
          ) : null}
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails(!showDetails)}
        className="py-2"
      >
        <Text className="text-xs text-foreground-muted">
          {showDetails ? "Hide details" : "Details"}
        </Text>
      </Pressable>
      {showDetails && details ? (
        <Text selectable className="font-mono text-2xs text-foreground-muted">
          {details}
        </Text>
      ) : null}
    </View>
  );
}

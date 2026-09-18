import { EventId, type ScopedThreadRef } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";
import { ArrowUpRightIcon } from "lucide-react";
import { orchestrationEnvironment } from "../../state/orchestration";
import { ToolOutputViewer } from "./ToolOutputViewer";
import { ToolTextDialog } from "./ToolTextDialog";
import { ToolTextBlock, ToolCopyButton } from "./ToolTextBlock";
import { shellLanguage, displayShellCommand } from "./toolCommandPresentation";

function DetailAction({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowUpRightIcon aria-hidden className="size-3" />
    </button>
  );
}

function OutputPreview({
  output,
  theme,
  onOpen,
}: {
  output?: string | undefined;
  theme: "light" | "dark";
  onOpen?: (() => void) | undefined;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-1 pt-3 pb-1 text-muted-foreground">
        <span className="text-xs font-medium">Output</span>
        <div className="flex items-center gap-1">
          {onOpen ? <DetailAction onClick={onOpen}>Full output</DetailAction> : null}
          {output ? <ToolCopyButton text={output} /> : null}
        </div>
      </div>
      {output ? (
        <ToolTextBlock text={output} language="ansi" theme={theme} />
      ) : (
        <p className="px-1 py-2 text-xs text-muted-foreground">No output preview available.</p>
      )}
    </>
  );
}

/** Mounted only for expanded, finished calls. */
function SavedOutputPreview({
  threadRef,
  activityId,
  fallback,
  theme,
  onOpen,
}: {
  threadRef: ScopedThreadRef;
  activityId: string;
  fallback?: string | undefined;
  theme: "light" | "dark";
  onOpen: () => void;
}) {
  const result = useAtomValue(
    orchestrationEnvironment.toolOutput({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, activityId: EventId.make(activityId), offset: 0 },
    }),
  );
  const value = result._tag === "Success" ? result.value : null;
  return (
    <>
      <OutputPreview
        output={value?.available ? value.contents : fallback}
        theme={theme}
        onOpen={onOpen}
      />
      {value?.nextOffset != null ? (
        <p className="px-1 pb-3 text-xs text-muted-foreground">
          Preview of the first page. Open full output for the remaining pages.
        </p>
      ) : null}
    </>
  );
}

export function ToolCommandPanel({
  command: savedCommand,
  rawCommand: savedRawCommand,
  output,
  theme,
  threadRef,
  activityId,
  isRunning = false,
}: {
  threadRef?: ScopedThreadRef | undefined;
  activityId?: string | undefined;
  isRunning?: boolean | undefined;
  command: string;
  rawCommand?: string | undefined;
  output?: string | undefined;
  theme: "light" | "dark";
}) {
  const command = displayShellCommand(savedRawCommand ?? savedCommand);
  const rawCommand = savedRawCommand ?? (command !== savedCommand ? savedCommand : undefined);
  const [showOutput, setShowOutput] = useState(false);
  const [showInvocation, setShowInvocation] = useState(false);
  return (
    <section className="min-w-0" aria-label="Command details">
      <div className="flex items-center justify-between px-1 py-1 text-muted-foreground">
        <span className="text-xs font-medium">Command</span>
        <div className="flex items-center gap-1">
          {rawCommand && rawCommand !== command ? (
            <DetailAction onClick={() => setShowInvocation(true)}>Original invocation</DetailAction>
          ) : null}
          <ToolCopyButton text={command} />
        </div>
      </div>
      <ToolTextBlock text={command} language={shellLanguage(rawCommand ?? command)} theme={theme} />
      {showInvocation && rawCommand ? (
        <ToolTextDialog
          title="Original invocation"
          text={rawCommand}
          language={shellLanguage(rawCommand)}
          theme={theme}
          onClose={() => setShowInvocation(false)}
        />
      ) : null}
      {threadRef && activityId && !isRunning ? (
        <SavedOutputPreview
          threadRef={threadRef}
          activityId={activityId}
          fallback={output}
          theme={theme}
          onOpen={() => setShowOutput(true)}
        />
      ) : (
        <OutputPreview
          output={output}
          theme={theme}
          onOpen={threadRef && activityId ? () => setShowOutput(true) : undefined}
        />
      )}
      {showOutput && threadRef && activityId ? (
        <ToolOutputViewer
          threadRef={threadRef}
          activityId={activityId}
          theme={theme}
          onClose={() => setShowOutput(false)}
        />
      ) : null}
    </section>
  );
}

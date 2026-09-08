import type { ScopedThreadRef } from "@t3tools/contracts";
import { ToolOutputViewer } from "./ToolOutputViewer";
import { useEffect, useState } from "react";
import { getSyntaxHighlighterPromise } from "../../lib/syntaxHighlighting";
import { resolveDiffThemeName } from "../../lib/diffRendering";
import { shellLanguage, displayShellCommand, plainToolOutput } from "./toolCommandPresentation";

function CopyText({ text }: { text: string }) {
  const [status, setStatus] = useState("Copy");
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-xs text-foreground/80 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setStatus("Copied");
        } catch {
          setStatus("Copy failed");
        }
      }}
    >
      {status}
    </button>
  );
}

export function ToolCommandPanel({
  command: savedCommand,
  rawCommand: savedRawCommand,
  output,
  theme,
  onCollapse,
  threadRef,
  activityId,
}: {
  threadRef?: ScopedThreadRef | undefined;
  activityId?: string | undefined;
  command: string;
  rawCommand?: string | undefined;
  output?: string | undefined;
  theme: "light" | "dark";
  onCollapse: () => void;
}) {
  const command = displayShellCommand(savedCommand);
  const rawCommand = savedRawCommand ?? (command !== savedCommand ? savedCommand : undefined);
  const [showOutput, setShowOutput] = useState(false);
  const [highlight, setHighlight] = useState<{
    source: string;
    theme: string;
    html: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Huge scripts remain selectable plain text; don't tokenize them on the UI thread.
    if (command.length > 12_000) return;
    const language = shellLanguage(rawCommand ?? command);
    void getSyntaxHighlighterPromise(language)
      .then((highlighter) => {
        if (cancelled) return;
        const html = highlighter.codeToHtml(command, {
          lang: language,
          theme: resolveDiffThemeName(theme),
        });
        if (!cancelled) setHighlight({ source: command, theme, html });
      })
      .catch(() => {
        /* Plain text remains available if the grammar cannot load. */
      });
    return () => {
      cancelled = true;
    };
  }, [command, rawCommand, theme]);
  const html = highlight?.source === command && highlight.theme === theme ? highlight.html : null;
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label="Command details"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="text-xs font-medium text-foreground">Command</span>
        <CopyText text={command} />
      </div>
      <div className="max-h-48 overflow-auto p-3 text-xs leading-relaxed [&_pre]:!bg-transparent [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:font-mono">
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-foreground">{command}</pre>
        )}
      </div>
      {rawCommand && rawCommand !== command ? (
        <details className="border-t border-border px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Original invocation</summary>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words py-2">
            {rawCommand}
          </pre>
          <CopyText text={rawCommand} />
        </details>
      ) : null}
      {output ? (
        <>
          <div className="flex items-center justify-between border-y border-border bg-muted/30 px-3 py-1">
            <span className="text-xs font-medium">Output preview</span>
            <CopyText text={output} />
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground/90">
            {plainToolOutput(output)}
          </pre>
        </>
      ) : (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          No output preview available.
        </p>
      )}
      {showOutput && threadRef && activityId ? (
        <ToolOutputViewer
          threadRef={threadRef}
          activityId={activityId}
          onClose={() => setShowOutput(false)}
        />
      ) : null}
      <div className="flex justify-between border-t border-border px-2 py-1">
        {threadRef && activityId ? (
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-info-foreground hover:bg-accent"
            onClick={() => setShowOutput(true)}
          >
            Open retained output
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={onCollapse}
          className="rounded px-2 py-1 text-xs text-foreground/80 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          Collapse details
        </button>
      </div>
    </section>
  );
}

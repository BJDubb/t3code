import { EventId, type ScopedThreadRef } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { orchestrationEnvironment } from "../../state/orchestration";
import { ToolOutputViewer } from "./ToolOutputViewer";
import { summarizeTool } from "@t3tools/shared/toolSummary";
import { ToolSummaryCard } from "./ToolSummaryCard";
import { useEffect, useState } from "react";
import { FileDiff } from "@pierre/diffs/react";
import { getFiletypeFromFileName, type FileDiffMetadata } from "@pierre/diffs";
import { getSyntaxHighlighterPromise, PREFERRED_HIGHLIGHTER } from "../../lib/syntaxHighlighting";
import {
  getRenderablePatch,
  getDiffLineStat,
  resolveDiffThemeName,
  resolveFileDiffPath,
} from "../../lib/diffRendering";
import { Dialog, DialogPopup, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { ToolCopyButton, ToolTextBlock } from "./ToolTextBlock";
import { useThread, useProject } from "../../state/entities";
import { useRightPanelStore } from "../../rightPanelStore";
import {
  useFileContextMenuHandler,
  resolveFileContextMenuAbsolutePath,
} from "../../fileContextMenu";

type ToolFileActions = {
  threadRef: ScopedThreadRef | undefined;
  workspaceRoot: string | undefined;
  onOpenDiff: ((filePath: string) => void) | undefined;
};

// Retained edits may contain unified headers without Git metadata. Supply it so
// the parser treats a/ and b/ as diff prefixes rather than parts of the filename.
function toolPatchWithFileMetadata(diff: string): string {
  if (/^diff --git /m.test(diff)) return diff;
  return diff.replace(
    /^--- (a\/[^\r\n]+|\/dev\/null)\r?\n\+\+\+ (b\/[^\r\n]+|\/dev\/null)/gm,
    (headers: string, before: string, after: string) => {
      const oldPath = before === "/dev/null" ? `a/${after.slice(2)}` : before;
      const newPath = after === "/dev/null" ? `b/${before.slice(2)}` : after;
      return `diff --git ${JSON.stringify(oldPath)} ${JSON.stringify(newPath)}\n${headers}`;
    },
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readableToolValue(value: unknown): unknown {
  if (typeof value === "string" && value.length < 100_000) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  const obj = record(value);
  if (obj && Object.keys(obj).length === 1 && "content" in obj)
    return readableToolValue(obj.content);
  if (Array.isArray(value))
    return value.map((item) => {
      const block = record(item);
      return block?.type === "text" ? readableToolValue(block.text) : item;
    });
  return value;
}

function Fields({
  value,
  theme,
  depth = 0,
}: {
  value: unknown;
  theme: "light" | "dark";
  depth?: number;
}) {
  const [all, setAll] = useState(false);
  const normalized = readableToolValue(value);
  if (
    Array.isArray(normalized) &&
    normalized.every((item) => item === null || typeof item !== "object")
  ) {
    return (
      <ToolTextBlock
        text={normalized.map((item) => String(item ?? "None")).join(", ")}
        theme={theme}
      />
    );
  }
  const obj = record(normalized);
  const entries = obj
    ? Object.entries(obj)
    : Array.isArray(normalized)
      ? normalized.map((item, i) => [String(i + 1), item] as const)
      : null;
  if (!entries || depth >= 5)
    return (
      <ToolTextBlock
        text={
          typeof normalized === "string" ? normalized : (JSON.stringify(normalized) ?? "No value")
        }
        theme={theme}
      />
    );
  return (
    <div className="min-w-0 space-y-1">
      <dl className="min-w-0 divide-y divide-border/40">
        {(all ? entries : entries.slice(0, 20)).map(([key, item]) => (
          <div
            key={key}
            className="grid grid-cols-[minmax(5rem,1fr)_minmax(0,3fr)] gap-3 py-1.5 text-xs"
          >
            <dt className="break-words text-muted-foreground">
              {key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")}
            </dt>
            <dd className="min-w-0 break-words">
              {item !== null && typeof item === "object" ? (
                <Fields value={item} theme={theme} depth={depth + 1} />
              ) : typeof item === "boolean" ? (
                <span className={item ? "text-success" : "text-muted-foreground"}>
                  {item ? "Yes" : "No"}
                </span>
              ) : typeof item === "string" && item.length > 300 ? (
                <ToolTextBlock text={item} theme={theme} />
              ) : (
                String(item ?? "None")
              )}
            </dd>
          </div>
        ))}
      </dl>
      {entries.length > 20 ? (
        <button className="text-xs text-info-foreground" onClick={() => setAll(!all)}>
          {all ? "Show fewer fields" : `Show ${entries.length - 20} more fields`}
        </button>
      ) : null}
    </div>
  );
}

function EditDiff({
  change,
  theme,
  fileActions,
}: {
  change: Record<string, unknown>;
  theme: "light" | "dark";
  fileActions?: ToolFileActions | undefined;
}) {
  const path = typeof change.path === "string" ? change.path : "Changed file";
  const diff = typeof change.diff === "string" ? change.diff : "";
  const patch = getRenderablePatch(toolPatchWithFileMetadata(diff), `tool:${path}`);
  return (
    <section className="min-w-0">
      {patch?.kind !== "files" ? (
        <div className="mb-2 break-all text-xs font-medium">{path}</div>
      ) : null}
      {patch?.kind === "files" ? (
        <div className="space-y-3">
          {patch.files.map((file) => (
            <CompactToolDiff
              key={resolveFileDiffPath(file)}
              file={file}
              theme={theme}
              fileActions={fileActions}
            />
          ))}
        </div>
      ) : diff ? (
        <ToolTextBlock text={diff} language="diff" theme={theme} />
      ) : (
        <p className="text-xs text-muted-foreground">No patch was saved for this file.</p>
      )}
    </section>
  );
}

export function ToolDetailsPanel({
  title,
  text,
  data,
  theme,
  threadRef,
  activityId,
  fileActions,
}: {
  title: string;
  text: string;
  data?: unknown;
  theme: "light" | "dark";
  threadRef?: ScopedThreadRef;
  activityId?: string;
  fileActions?: ToolFileActions | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const contents = data !== undefined ? JSON.stringify(data, null, 2) : text;
  const obj = record(data);
  const changes = Array.isArray(obj?.changes)
    ? obj.changes.flatMap((item) => (record(item) ? [record(item)!] : []))
    : [];
  const result = obj?.result ?? obj?.output ?? obj?.response;
  const parameters = obj?.arguments ?? obj?.parameters ?? obj?.input;
  const summary = summarizeTool(data, text);
  const formatted = (details = false) => (
    <div className="space-y-4">
      {summary ? (
        <>
          <ToolSummaryCard summary={summary} theme={theme} />
          {threadRef && activityId && summary.kind !== "credentials" ? (
            <button
              type="button"
              className="text-xs text-info-foreground hover:underline"
              onClick={() => setShowOutput(true)}
            >
              Full output ↗
            </button>
          ) : null}
          {details ? (
            <>
              {parameters !== undefined ? (
                <section>
                  <h4 className="mb-2 text-xs text-muted-foreground">Invocation details</h4>
                  <Fields value={parameters} theme={theme} />
                </section>
              ) : null}
              {summary.kind === "credentials"
                ? summary.credentials.map((credential, index) => (
                    <div
                      key={credential.id ?? index}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="break-words">{credential.name}</span>
                      {credential.id ? (
                        <ToolCopyButton text={credential.id} label="Copy ID" />
                      ) : null}
                    </div>
                  ))
                : null}
            </>
          ) : null}
        </>
      ) : changes.length ? (
        changes.map((change) => (
          <EditDiff
            key={String(change.path ?? change.filename)}
            change={change}
            theme={theme}
            fileActions={fileActions}
          />
        ))
      ) : (
        <>
          {result !== undefined ? (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground">Result</h4>
                {threadRef && activityId ? (
                  <button
                    type="button"
                    onClick={() => setShowOutput(true)}
                    className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Full output &#8599;
                  </button>
                ) : null}
              </div>
              <ToolResult value={result} theme={theme} />
            </section>
          ) : null}
          {parameters !== undefined ? (
            <section>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">Parameters</h4>
              <Fields value={parameters} theme={theme} />
            </section>
          ) : null}
          {result === undefined && parameters === undefined ? (
            data !== undefined ? (
              <Fields value={data} theme={theme} />
            ) : (
              <ToolTextBlock text={text} theme={theme} />
            )
          ) : null}
        </>
      )}
    </div>
  );
  return (
    <section className="min-w-0" aria-label="Tool details">
      <div className="mb-2 flex justify-end gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded px-2 py-1 hover:bg-accent"
        >
          Open details &#8599;
        </button>
        <ToolCopyButton text={contents} />
      </div>
      {formatted()}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup
          className="flex max-h-[85dvh] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden"
          bottomStickOnMobile={false}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 px-4 pb-3">
            <button
              type="button"
              aria-pressed={!raw}
              onClick={() => setRaw(false)}
              className="rounded px-2 py-1 text-xs aria-pressed:bg-accent"
            >
              Formatted
            </button>
            <button
              type="button"
              aria-pressed={raw}
              onClick={() => setRaw(true)}
              className="rounded px-2 py-1 text-xs aria-pressed:bg-accent"
            >
              Raw JSON
            </button>
            {!raw || !summary ? <ToolCopyButton text={contents} /> : null}
          </div>
          <div className="min-h-0 overflow-auto px-4 pb-4">
            {raw && threadRef && activityId && summary ? (
              <RetainedToolJson
                threadRef={threadRef}
                activityId={activityId}
                theme={theme}
                data={data}
              />
            ) : raw ? (
              <ToolTextBlock
                text={contents}
                language={data !== undefined ? "json" : "text"}
                theme={theme}
                preview={false}
              />
            ) : (
              formatted(true)
            )}
          </div>
        </DialogPopup>
      </Dialog>
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

function RetainedToolJson({
  threadRef,
  activityId,
  theme,
  data,
}: {
  threadRef: ScopedThreadRef;
  activityId: string;
  theme: "light" | "dark";
  data: unknown;
}) {
  const result = useAtomValue(
    orchestrationEnvironment.toolOutput({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, activityId: EventId.make(activityId), offset: 0 },
    }),
  );
  const value = result._tag === "Success" ? result.value : null;
  const obj = record(data);
  const rawData = { ...obj };
  delete rawData.summary;
  const contents = value?.available
    ? summarizeTool(data)?.kind === "web"
      ? value.contents
      : JSON.stringify({ ...rawData, result: readableToolValue(value.contents) }, null, 2)
    : JSON.stringify(data, null, 2);
  return (
    <div className="space-y-2">
      {result._tag === "Initial" ? (
        <p className="text-xs text-muted-foreground">Loading retained output…</p>
      ) : null}
      {result._tag === "Failure" ? (
        <p className="text-xs text-muted-foreground">Could not load retained output.</p>
      ) : null}
      {value?.nextOffset !== null && value?.nextOffset !== undefined ? (
        <p className="text-xs text-muted-foreground">
          Raw output preview truncated. Use Full output to see the rest.
        </p>
      ) : null}
      <ToolCopyButton text={contents ?? ""} />
      <ToolTextBlock text={contents ?? ""} language="json" theme={theme} preview={false} />
    </div>
  );
}

export function SavedEditPanel({
  threadRef,
  activityId,
  title,
  theme,
  fileActions,
}: {
  threadRef: ScopedThreadRef;
  activityId: string;
  title: string;
  theme: "light" | "dark";
  fileActions: ToolFileActions;
}) {
  const [showFullPatch, setShowFullPatch] = useState(false);
  const result = useAtomValue(
    orchestrationEnvironment.toolOutput({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, activityId: EventId.make(activityId), offset: 0 },
    }),
  );
  const value = result._tag === "Success" ? result.value : null;
  return (
    <section className="min-w-0">
      {value?.available ? (
        <>
          <EditDiff
            change={{ path: title, diff: value.contents }}
            theme={theme}
            fileActions={fileActions}
          />
          {value.nextOffset !== null ? (
            <button
              type="button"
              className="text-xs text-info-foreground hover:underline"
              onClick={() => setShowFullPatch(true)}
            >
              Show full saved patch
            </button>
          ) : null}
        </>
      ) : (
        <p className="py-2 text-xs text-muted-foreground">
          {result._tag === "Failure"
            ? "Could not load the saved patch."
            : value
              ? "No patch was saved for this edit."
              : "Loading patch..."}
        </p>
      )}
      {showFullPatch ? (
        <ToolOutputViewer
          threadRef={threadRef}
          activityId={activityId}
          theme={theme}
          onClose={() => setShowFullPatch(false)}
        />
      ) : null}
    </section>
  );
}

function ToolResult({ value, theme }: { value: unknown; theme: "light" | "dark" }) {
  const decoded = readableToolValue(value);
  return (
    <ToolTextBlock
      text={typeof decoded === "string" ? decoded : JSON.stringify(decoded, null, 2)}
      language={typeof decoded === "object" && decoded !== null ? "json" : "ansi"}
      theme={theme}
    />
  );
}

function CompactToolDiff({
  file,
  theme,
  fileActions,
}: {
  file: FileDiffMetadata;
  theme: "light" | "dark";
  fileActions?: ToolFileActions | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const filePath = resolveFileDiffPath(file);
  const thread = useThread(fileActions?.threadRef ?? null);
  const project = useProject(
    thread?.projectId ? { environmentId: thread.environmentId, projectId: thread.projectId } : null,
  );
  const onFileContextMenu = useFileContextMenuHandler(
    fileActions?.threadRef?.environmentId ?? null,
  );
  const target = {
    environmentId: fileActions?.threadRef?.environmentId ?? null,
    filePath,
    workspaceRoot: fileActions?.workspaceRoot,
    repositoryRoot:
      thread?.worktreePath == null ? project?.repositoryIdentity?.rootPath : undefined,
  };
  const absolutePath = resolveFileContextMenuAbsolutePath(target);
  const threadRef = fileActions?.threadRef;
  const openFile =
    threadRef && absolutePath && file.type !== "deleted"
      ? () => useRightPanelStore.getState().openFile(threadRef, absolutePath)
      : undefined;
  const onOpenDiff = fileActions?.onOpenDiff;
  const openDiff = onOpenDiff ? () => onOpenDiff(filePath) : undefined;
  const stats = getDiffLineStat([file]);
  const language = getFiletypeFromFileName(resolveFileDiffPath(file));
  const [highlightReady, setHighlightReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getSyntaxHighlighterPromise(language).then(() => {
      if (!cancelled) setHighlightReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);
  const long = file.hunks.reduce((sum, hunk) => sum + hunk.unifiedLineCount, 0) > 8;
  return (
    <section className="overflow-hidden rounded-lg border border-border/80 bg-muted/15">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5 text-xs">
        <Tooltip>
          <TooltipTrigger
            render={<button type="button" />}
            onClick={openFile ?? openDiff}
            disabled={!openDiff && !openFile}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFileContextMenu(
                { ...target, onOpenInternal: openFile, onOpenDiff: openDiff, canCopyPath: true },
                event,
              );
            }}
            aria-label={`Open ${openFile ? "file" : "diff"} for ${filePath}`}
            className="min-w-0 truncate text-info-foreground underline decoration-current/40 underline-offset-2 enabled:hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring"
          >
            {resolveFileDiffPath(file).replace(/\\/g, "/").split("/").at(-1)}
          </TooltipTrigger>
          <TooltipPopup variant="code">{absolutePath ?? filePath}</TooltipPopup>
        </Tooltip>
        <span className="text-diff-addition">+{stats.additions}</span>
        <span className="text-diff-deletion">-{stats.deletions}</span>
      </div>
      <div
        className={
          long && !expanded
            ? "relative max-h-40 overflow-hidden [mask-image:linear-gradient(black_75%,transparent)]"
            : ""
        }
      >
        <FileDiff
          key={`${language}:${highlightReady}`}
          fileDiff={{ ...file, lang: language }}
          options={{
            diffStyle: "unified",
            theme: resolveDiffThemeName(theme),
            themeType: theme,
            preferredHighlighter: PREFERRED_HIGHLIGHTER,
            useTokenTransformer: false,
            diffIndicators: "classic",
            disableFileHeader: true,
            lineDiffType: "none",
            overflow: "scroll",
            unsafeCSS: `:host { --diffs-font-family: var(--font-mono); --diffs-font-size: 12px; --diffs-line-height: 20px; } [data-diff] { --diffs-bg: transparent; --diffs-bg-addition-override: light-dark(#e1f2e6, #173326); --diffs-bg-deletion-override: light-dark(#fbe4ec, #3b1729); }`,
          }}
        />
      </div>
      {long ? (
        <button
          className="w-full border-t border-border/50 py-1 text-xs text-muted-foreground hover:bg-accent"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Expand diff"}
        </button>
      ) : null}
    </section>
  );
}

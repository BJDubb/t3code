import { EventId, type ScopedThreadRef } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { orchestrationEnvironment } from "../../state/orchestration";
import { ToolOutputViewer } from "./ToolOutputViewer";
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
import { ToolCopyButton, ToolTextBlock } from "./ToolTextBlock";

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
  onOpen,
}: {
  change: Record<string, unknown>;
  theme: "light" | "dark";
  onOpen?: (() => void) | undefined;
}) {
  const path = typeof change.path === "string" ? change.path : "Changed file";
  const diff = typeof change.diff === "string" ? change.diff : "";
  const patch = getRenderablePatch(diff, `tool:${path}`);
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
              onOpen={onOpen}
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
}: {
  title: string;
  text: string;
  data?: unknown;
  theme: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const contents = data !== undefined ? JSON.stringify(data, null, 2) : text;
  const obj = record(data);
  const changes = Array.isArray(obj?.changes)
    ? obj.changes.flatMap((item) => (record(item) ? [record(item)!] : []))
    : [];
  const result = obj?.result ?? obj?.output ?? obj?.response;
  const parameters = obj?.arguments ?? obj?.parameters ?? obj?.input;
  const formatted = (
    <div className="space-y-4">
      {changes.length ? (
        changes.map((change) => (
          <EditDiff key={String(change.path ?? change.filename)} change={change} theme={theme} />
        ))
      ) : (
        <>
          {result !== undefined ? (
            <section>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">Result</h4>
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
      {formatted}
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
            <ToolCopyButton text={contents} />
          </div>
          <div className="min-h-0 overflow-auto px-4 pb-4">
            {raw ? (
              <ToolTextBlock
                text={contents}
                language={data !== undefined ? "json" : "text"}
                theme={theme}
                preview={false}
              />
            ) : (
              formatted
            )}
          </div>
        </DialogPopup>
      </Dialog>
    </section>
  );
}

export function SavedEditPanel({
  threadRef,
  activityId,
  title,
  theme,
}: {
  threadRef: ScopedThreadRef;
  activityId: string;
  title: string;
  theme: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
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
            onOpen={() => setOpen(true)}
          />
          {value.nextOffset !== null ? (
            <p className="text-xs text-muted-foreground">
              First page of a large patch. Open full patch for the remaining pages.
            </p>
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
      {open ? (
        <ToolOutputViewer
          theme={theme}
          threadRef={threadRef}
          activityId={activityId}
          onClose={() => setOpen(false)}
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
  onOpen,
}: {
  file: FileDiffMetadata;
  theme: "light" | "dark";
  onOpen?: (() => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
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
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          aria-label={`Open patch for ${resolveFileDiffPath(file)}`}
          className="min-w-0 truncate text-info-foreground underline decoration-current/40 underline-offset-2 enabled:hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring"
        >
          {resolveFileDiffPath(file).replace(/\\/g, "/").split("/").at(-1)}
        </button>
        <span className="text-emerald-400 light:text-emerald-700">+{stats.additions}</span>
        <span className="text-rose-400 light:text-rose-700">-{stats.deletions}</span>
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

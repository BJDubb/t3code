import { ToolTextBlock } from "./ToolTextBlock";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { plainToolOutput } from "./toolCommandPresentation";
import { useAtomValue } from "@effect/atom-react";
import { EventId, type ScopedThreadRef } from "@t3tools/contracts";
import { useState } from "react";
import { orchestrationEnvironment } from "../../state/orchestration";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";

export function ToolOutputViewer({
  threadRef,
  activityId,
  onClose,
  theme,
}: {
  threadRef: ScopedThreadRef;
  activityId: string;
  onClose: () => void;
  theme: "light" | "dark";
}) {
  const [offsets, setOffsets] = useState([0]);
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState("Copy page");
  const offset = offsets.at(-1)!;
  const result = useAtomValue(
    orchestrationEnvironment.toolOutput({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, activityId: EventId.make(activityId), offset },
    }),
  );
  const value = result._tag === "Success" ? result.value : null;
  const contents = value?.contents ?? "";
  const displayContents = plainToolOutput(contents);
  const visible = query
    ? displayContents
        .split("\n")
        .filter((line) => line.toLowerCase().includes(query.toLowerCase()))
        .join("\n")
    : contents;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        className="flex h-[85dvh] w-[min(72rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden"
        bottomStickOnMobile={false}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Tool output</DialogTitle>
          <DialogDescription>
            The output saved for this call. Any provider-side truncation remains. Large outputs are
            split into pages.
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 items-center gap-3 border-y border-border px-6 py-2">
          <input
            aria-label="Filter lines on this page"
            placeholder="Filter lines on this page…"
            className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!value?.available}
            onClick={async () => {
              try {
                await writeTextToClipboard(contents, "tool output");
                setCopyStatus("Copied");
              } catch {
                setCopyStatus("Copy failed");
              }
            }}
          >
            {copyStatus}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6" key={offset}>
          {result._tag === "Failure" ? (
            <p role="alert">
              Could not load this output. The server may need updating, or this activity may no
              longer be retained.
            </p>
          ) : !value ? (
            <p role="status">Loading output…</p>
          ) : !value.available ? (
            <p>No output was retained for this activity.</p>
          ) : (
            <ToolTextBlock
              language="ansi"
              text={visible || (query ? "No matching lines on this page." : "(Empty output)")}
              theme={theme}
              preview={false}
            />
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-3">
          <span className="text-xs text-muted-foreground">
            {value
              ? `${offset.toLocaleString()}–${(offset + contents.length).toLocaleString()} of ${value.totalChars.toLocaleString()} characters`
              : ""}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={offsets.length === 1}
              onClick={() => {
                setOffsets((previous) => previous.slice(0, -1));
                setCopyStatus("Copy page");
              }}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={value?.nextOffset == null}
              onClick={() => {
                if (value?.nextOffset != null)
                  setOffsets((previous) => [...previous, value.nextOffset!]);
                setCopyStatus("Copy page");
              }}
            >
              Next
            </Button>
            <Button onClick={onClose}>Close output</Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}

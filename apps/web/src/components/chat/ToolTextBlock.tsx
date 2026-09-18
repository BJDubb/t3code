import { useEffect, useRef, useState } from "react";
import { getSyntaxHighlighterPromise } from "../../lib/syntaxHighlighting";
import { resolveDiffThemeName } from "../../lib/diffRendering";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { shellDisplayTokens, toolTextPreview } from "./toolCommandPresentation";

export function ToolCopyButton({ text }: { text: string }) {
  const [status, setStatus] = useState("Copy");
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      onClick={async () => {
        try {
          await writeTextToClipboard(text, "tool details");
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

export function ToolTextBlock({
  text,
  language = "text",
  theme,
  preview = true,
}: {
  text: string;
  language?: string;
  theme: "light" | "dark";
  preview?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const collapse = () => {
    setExpanded(false);
    requestAnimationFrame(() => {
      blockRef.current?.scrollIntoView({ block: "nearest" });
      toggleRef.current?.focus({ preventScroll: true });
    });
  };
  const excerpt = toolTextPreview(text);
  const isShell = language === "powershell" || language === "shellscript";
  const source = preview && !expanded ? excerpt.text : text;
  const [highlight, setHighlight] = useState<{
    source: string;
    language: string;
    theme: string;
    html: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (language === "text" || isShell || source.length > (language === "ansi" ? 70_000 : 12_000))
      return;
    void getSyntaxHighlighterPromise(language)
      .then((highlighter) => {
        if (cancelled) return;
        const html = highlighter.codeToHtml(source, {
          lang: language,
          theme: resolveDiffThemeName(theme),
        });
        setHighlight({ source, language, theme, html });
      })
      .catch(() => {
        /* Keep the plain text fallback when a grammar is unavailable. */
      });
    return () => {
      cancelled = true;
    };
  }, [source, language, theme, isShell]);
  const html =
    highlight?.source === source && highlight.language === language && highlight.theme === theme
      ? highlight.html
      : null;
  return (
    <div ref={blockRef} className="relative min-w-0 scroll-mt-16">
      {preview && expanded && excerpt.truncated ? (
        <div className="pointer-events-none sticky top-14 z-10 flex h-0 justify-end">
          <button
            type="button"
            onClick={collapse}
            className="pointer-events-auto h-7 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground shadow-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show less
          </button>
        </div>
      ) : null}
      <div
        className={`px-1 py-2 text-xs leading-relaxed select-text [&_pre]:!bg-transparent [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:font-mono ${preview && expanded && excerpt.truncated ? "pr-24" : ""}`}
      >
        {isShell ? (
          <pre className="whitespace-pre-wrap break-words font-mono">
            {shellDisplayTokens(source).map((token) => (
              <span
                key={token.start}
                className={
                  {
                    command: "text-yellow-300 light:text-amber-800",
                    parameter: "text-zinc-400 light:text-zinc-600",
                    string: "text-green-300 light:text-green-700",
                    variable: "text-cyan-300 light:text-cyan-700",
                    number: "text-violet-300 light:text-violet-700",
                    comment: "text-muted-foreground italic",
                    operator: "text-muted-foreground",
                    plain: "text-foreground/90",
                  }[token.kind]
                }
              >
                {token.text}
              </span>
            ))}
          </pre>
        ) : html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-foreground/90">
            {source}
          </pre>
        )}
      </div>
      {preview && excerpt.truncated ? (
        <button
          type="button"
          ref={toggleRef}
          aria-expanded={expanded}
          onClick={() => (expanded ? collapse() : setExpanded(true))}
          className="mx-1 mb-2 rounded text-xs text-info-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import type { ToolSummary } from "@t3tools/shared/toolSummary";
import { readLocalApi } from "../../localApi";
import { ToolCopyButton, ToolTextBlock } from "./ToolTextBlock";

export function ToolUrlActions({ url }: { url: string }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 text-xs"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded px-2 py-1 text-muted-foreground hover:bg-accent"
        onClick={(event) => {
          const api = readLocalApi();
          if (api) {
            event.preventDefault();
            void api.shell.openExternal(url);
          }
        }}
      >
        Open ↗
      </a>
      <ToolCopyButton text={url} label="Copy URL" />
    </div>
  );
}

export function ToolSummaryCard({
  summary,
  theme,
}: {
  summary: ToolSummary;
  theme: "light" | "dark";
}) {
  const [all, setAll] = useState(false);
  if (summary.kind === "web") {
    const results = summary.results.length
      ? summary.results
      : summary.url
        ? [{ id: summary.url, title: summary.url, url: summary.url }]
        : [];
    return (
      <div className="space-y-3 text-xs">
        <p className="break-words text-muted-foreground">
          {summary.action === "findInPage"
            ? `Find “${summary.pattern ?? ""}”`
            : summary.action === "openPage"
              ? "Opened page"
              : summary.queries.join(" · ")}
        </p>
        {summary.action === "search" && summary.resultCount !== undefined ? (
          <p className="text-muted-foreground">{summary.resultCount} results</p>
        ) : null}
        {(all ? results : results.slice(0, 3)).map((result) => (
          <div key={result.id} className="space-y-1">
            {result.url ? (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-words font-medium text-info-foreground hover:underline"
                onClick={(event) => {
                  const api = readLocalApi();
                  if (api) {
                    event.preventDefault();
                    void api.shell.openExternal(result.url!);
                  }
                }}
              >
                {result.title}
              </a>
            ) : (
              <p className="break-words font-medium">{result.title}</p>
            )}
            {result.domain ? <p className="text-muted-foreground">{result.domain}</p> : null}
            {result.snippet && !/^Total lines: \d+$/.test(result.snippet) ? (
              <p className="break-words text-muted-foreground">{result.snippet}</p>
            ) : null}
            {result.url ? (
              <div className="flex items-center gap-2">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded px-2 py-1 text-muted-foreground hover:bg-accent"
                  onClick={(event) => {
                    const api = readLocalApi();
                    if (api) {
                      event.preventDefault();
                      void api.shell.openExternal(result.url!);
                    }
                  }}
                >
                  Open in browser ↗
                </a>
                <ToolCopyButton text={result.url} label="Copy URL" />
              </div>
            ) : null}
          </div>
        ))}
        {results.length > 3 ? (
          <button
            type="button"
            aria-expanded={all}
            className="text-info-foreground hover:underline"
            onClick={() => setAll(!all)}
          >
            {all ? "Show fewer results" : `Show ${results.length - 3} more results`}
          </button>
        ) : null}
        {summary.resultCount !== undefined && summary.resultCount > summary.results.length ? (
          <p className="text-muted-foreground">
            Showing the first {summary.results.length} of {summary.resultCount} results.
          </p>
        ) : null}
      </div>
    );
  }
  if (summary.kind === "credentials")
    return (
      <div className="space-y-3 text-xs">
        <p className="text-muted-foreground">
          {[
            summary.query ? `“${summary.query}”` : undefined,
            summary.environment,
            `${summary.count} matches`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {summary.credentials.map((credential) => (
          <div key={credential.id ?? credential.name} className="space-y-1">
            <p className="break-words font-medium">{credential.name}</p>
            <p className="break-words text-muted-foreground">
              {[credential.account, credential.folder].filter(Boolean).join(" · ")}
            </p>
          </div>
        ))}
        <p className="text-muted-foreground">Metadata only</p>
      </div>
    );
  return (
    <div className="space-y-2 text-xs">
      <p className={summary.failed ? "font-medium text-destructive" : "font-medium"}>
        {summary.status ?? "Execution result"}
        {summary.exitCode !== undefined ? ` · Exit code ${summary.exitCode}` : ""}
      </p>
      {summary.purpose ? <ToolTextBlock text={summary.purpose} theme={theme} /> : null}
      <p className="break-words text-muted-foreground">
        {[
          summary.script,
          summary.credentialCount ? `${summary.credentialCount} credentials` : undefined,
          summary.outputMode ? `${summary.outputMode} output` : undefined,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {summary.withheld ? (
        <p className="text-muted-foreground">Output withheld</p>
      ) : (
        <>
          {summary.stdout ? (
            <section>
              <h4 className="text-muted-foreground">Output</h4>
              <ToolTextBlock text={summary.stdout} theme={theme} language="ansi" />
            </section>
          ) : null}
          {summary.stderr ? (
            <section>
              <h4 className="text-destructive">Standard error</h4>
              <ToolTextBlock text={summary.stderr} theme={theme} language="ansi" />
            </section>
          ) : null}
          {!summary.stdout && !summary.stderr ? (
            <p className="text-muted-foreground">No output</p>
          ) : null}
        </>
      )}
      {summary.truncated ? (
        <p className="text-muted-foreground">
          Output preview truncated. Open full output for the rest.
        </p>
      ) : null}
    </div>
  );
}

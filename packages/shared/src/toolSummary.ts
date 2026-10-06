function toolRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Optional display fields must be absent, since wire JSON rejects undefined values. */
function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}

function string(value: unknown, limit = 4096): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : undefined;
}

function toolHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined;
  const text = string(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export type ToolSummary =
  | {
      kind: "web";
      action: string;
      queries: string[];
      url?: string | undefined;
      pattern?: string | undefined;
      results: {
        id: string;
        title: string;
        url?: string | undefined;
        domain?: string | undefined;
        snippet?: string | undefined;
      }[];
      resultCount?: number | undefined;
    }
  | {
      kind: "execution";
      purpose?: string | undefined;
      script?: string | undefined;
      credentialCount: number;
      outputMode?: string | undefined;
      status?: string | undefined;
      exitCode?: number | undefined;
      failed: boolean;
      withheld: boolean;
      stdout?: string | undefined;
      stderr?: string | undefined;
      truncated: boolean;
    }
  | {
      kind: "credentials";
      query?: string | undefined;
      environment?: string | undefined;
      count: number;
      credentials: {
        name: string;
        account?: string | undefined;
        folder?: string | undefined;
        id?: string | undefined;
      }[];
    };

function resultValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return value;
  if (typeof value === "string") {
    try {
      return resultValue(JSON.parse(value), depth + 1);
    } catch {
      return value;
    }
  }
  const obj = toolRecord(value);
  if (obj?.structuredContent) return resultValue(obj.structuredContent, depth + 1);
  if (obj?.content !== undefined) return resultValue(obj.content, depth + 1);
  if (Array.isArray(value) && value.length === 1) {
    const block = toolRecord(value[0]);
    return resultValue(block?.type === "text" ? block.text : value[0], depth + 1);
  }
  return value;
}

/** Build bounded display data before the wire projection trims raw tool output. */
export function summarizeTool(
  value: unknown,
  fallbackText?: string,
  web = false,
): ToolSummary | undefined {
  const data = toolRecord(value);
  if (!data) return undefined;
  const saved = toolRecord(data.summary);
  if (saved && ["web", "execution", "credentials"].includes(String(saved.kind)))
    return saved as ToolSummary;
  const item = toolRecord(data.item) ?? data;
  const input =
    toolRecord(item.input) ??
    toolRecord(item.rawInput) ??
    toolRecord(toolRecord(item.state)?.input);
  if (web && !item.action && !input?.query && !input?.url && !Array.isArray(item.results))
    return undefined;
  const action =
    toolRecord(item.action) ??
    (web
      ? { type: input?.url ? "openPage" : "search", url: input?.url, query: input?.query }
      : undefined);
  if (
    web ||
    item.type === "webSearch" ||
    action?.type === "openPage" ||
    action?.type === "findInPage"
  ) {
    const results = Array.isArray(item.results) ? item.results : [];
    const queries = Array.isArray(action?.queries) ? action.queries : [action?.query ?? item.query];
    return omitUndefined({
      kind: "web" as const,
      action: string(action?.type) ?? "search",
      queries: queries.flatMap((q) => (string(q) ? [string(q)!] : [])).slice(0, 20),
      url: toolHttpUrl(action?.url),
      pattern: string(action?.pattern),
      resultCount: Array.isArray(item.results) ? results.length : undefined,
      results: results.slice(0, 20).flatMap((value, index) => {
        const r = toolRecord(value);
        if (!r) return [];
        const url = toolHttpUrl(r.url);
        const title = string(r.title, 300) ?? url;
        return title
          ? [
              omitUndefined({
                id: string(r.ref_id) ?? `${url ?? title}:${index}`,
                title,
                url,
                domain: string(r.domain, 300),
                snippet: string(r.snippet, 600),
              }),
            ]
          : [];
      }),
    });
  }
  const name = `${item.server ?? ""} ${item.tool ?? item.toolName ?? ""}`.toLowerCase();
  const args = toolRecord(item.arguments ?? item.input) ?? {};
  const decoded = resultValue(item.result ?? item.output ?? item.response ?? fallbackText);
  const result = toolRecord(decoded);
  if (
    result &&
    (typeof result.stdout === "string" ||
      typeof result.stderr === "string" ||
      "exit_code" in result)
  ) {
    const exitCode = typeof result.exit_code === "number" ? result.exit_code : undefined;
    const failed =
      result.timed_out === true ||
      (exitCode !== undefined && exitCode !== 0) ||
      ["failed", "error"].includes(String(result.outcome));
    return omitUndefined({
      kind: "execution" as const,
      purpose: string(result.purpose ?? args.purpose),
      script: string(result.script ?? args.script)
        ?.replace(/\\/g, "/")
        .split("/")
        .at(-1),
      credentialCount: Array.isArray(args.credentials)
        ? args.credentials.length
        : Array.isArray(result.credentials)
          ? result.credentials.length
          : 0,
      outputMode: string(result.output_mode ?? args.output_mode),
      status:
        result.timed_out === true
          ? "Timed out"
          : failed
            ? "Failed"
            : string(result.outcome) === "completed"
              ? "Completed"
              : undefined,
      exitCode,
      failed,
      withheld: result.output_withheld === true,
      stdout: string(result.stdout, 8192),
      stderr: string(result.stderr, 4096),
      truncated:
        (typeof result.stdout === "string" && result.stdout.length > 8192) ||
        (typeof result.stderr === "string" && result.stderr.length > 4096),
    });
  }
  if (
    name.includes("passbolt") &&
    name.includes("search_credentials") &&
    typeof decoded === "string"
  ) {
    const credentials = [
      ...decoded.matchAll(
        /^\d+\. (.+)\r?\n\s*Account: (.*)\r?\n\s*Folder: (.*)\r?\n\s*ID: (.*)$/gm,
      ),
    ]
      .slice(0, 20)
      .map((m) =>
        omitUndefined({
          name: string(m[1], 1000) ?? "Credential",
          account: string(m[2], 300),
          folder: string(m[3], 600),
          id: m[4],
        }),
      );
    const count = /Found (\d+) matching credentials/.exec(decoded)?.[1];
    if (credentials.length || count === "0")
      return omitUndefined({
        kind: "credentials" as const,
        query: string(args.query),
        environment: string(args.environment),
        count: count ? Number(count) : credentials.length,
        credentials,
      });
  }
  return undefined;
}

export function toolSummaryLabel(summary: ToolSummary): string {
  if (summary.kind === "web") {
    if (summary.action === "openPage")
      return `Opened · ${summary.results[0]?.title ?? summary.url ?? "page"}`;
    if (summary.action === "findInPage") return `Find · ${summary.pattern ?? "text"}`;
    return `Search · ${summary.queries.join(" · ") || "web"}`;
  }
  if (summary.kind === "credentials")
    return `Passbolt · ${summary.count} credential${summary.count === 1 ? "" : "s"} found`;
  return `${summary.status ?? "Run"}${summary.exitCode !== undefined ? ` · Exit code ${summary.exitCode}` : ""}${summary.script ? ` · ${summary.script}` : ""}`;
}

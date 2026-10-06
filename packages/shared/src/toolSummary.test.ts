import { describe, expect, it } from "vite-plus/test";
import { summarizeTool, toolSummaryLabel } from "./toolSummary.ts";

describe("tool summaries", () => {
  it("uses returned page titles, preserves multiple pages, and rejects unsafe links", () => {
    const summary = summarizeTool({
      item: {
        type: "webSearch",
        action: { type: "openPage", url: "https://example.com" },
        results: [
          { title: "Page title", url: "https://example.com", snippet: "Total lines: 139" },
          { title: "Bad link", url: "javascript:alert(1)" },
        ],
      },
    });
    expect(summary).toMatchObject({
      kind: "web",
      resultCount: 2,
      results: [{ title: "Page title", url: "https://example.com/" }, { title: "Bad link" }],
    });
    expect(toolSummaryLabel(summary!)).toBe("Opened · Page title");
    if (summary?.kind === "web") expect(summary.results[1]).not.toHaveProperty("url");
  });
  it("keeps execution status and output when credential metadata precedes it", () => {
    const summary = summarizeTool({
      server: "passbolt",
      tool: "run_with_credentials",
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              credentials: Array.from({ length: 30 }, () => ({ expected_name: "x".repeat(500) })),
              outcome: "completed",
              exit_code: 0,
              stdout: "production: 4 records\r\npreprod: 4 records\r\n",
              stderr: "",
            }),
          },
        ],
      },
    });
    expect(summary).toMatchObject({
      kind: "execution",
      status: "Completed",
      exitCode: 0,
      failed: false,
      stdout: "production: 4 records\r\npreprod: 4 records",
    });
  });
  it("distinguishes process failure, timeout, and withheld output", () => {
    expect(
      summarizeTool({ result: { exit_code: 1, outcome: "completed", stderr: "bad" } }),
    ).toMatchObject({ failed: true, status: "Failed" });
    expect(
      summarizeTool({ result: { exit_code: 0, timed_out: true, output_withheld: true } }),
    ).toMatchObject({ failed: true, status: "Timed out", withheld: true });
  });
  it("parses complete Passbolt search matches without guessing at names", () => {
    const summary = summarizeTool({
      server: "passbolt",
      tool: "search_credentials",
      arguments: { query: "Jim2", environment: "Preprod" },
      result: {
        content: [
          {
            type: "text",
            text: "Found 1 matching credentials.\n\n1. Commeris — Jim2 — Preprod\n   Account: sa-readonly\n   Folder: Applications & Cloud / Commeris\n   ID: abc\n",
          },
        ],
      },
    });
    expect(summary).toMatchObject({
      kind: "credentials",
      query: "Jim2",
      count: 1,
      credentials: [{ name: "Commeris — Jim2 — Preprod", id: "abc" }],
    });
    expect(
      summarizeTool({ server: "other", tool: "search_credentials", result: "unexpected result" }),
    ).toBeUndefined();
  });
  it("bounds wire summaries while retaining total counts", () => {
    const summary = summarizeTool({
      type: "webSearch",
      results: Array.from({ length: 100 }, () => ({
        title: "x".repeat(1000),
        snippet: "x".repeat(10000),
      })),
    });
    expect(summary?.kind).toBe("web");
    if (summary?.kind !== "web") return;
    expect(summary.results).toHaveLength(20);
    expect(summary.resultCount).toBe(100);
    expect(summary.results[0]?.snippet).toHaveLength(600);
  });
});

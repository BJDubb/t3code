import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { Schema } from "effect";
import { projectActivityPayload } from "./ActivityPayloadProjection.ts";

const isJson = Schema.is(Schema.Json);

function activity(payload: Record<string, unknown>): OrchestrationThreadActivity {
  return {
    id: "activity-1",
    tone: "tool",
    kind: "tool.completed",
    summary: "Tool",
    payload,
    turnId: null,
    createdAt: "2026-08-01T10:00:00.000Z",
  } as unknown as OrchestrationThreadActivity;
}

/**
 * Wire-survival regression: the slimming pass rewrites payload.data but must
 * never strip the top-level per-agent fields the subagent fold depends on.
 * If slimming ever moves to an allowlist over the whole payload, these
 * assertions are the tripwire.
 */
describe("projectActivityPayload", () => {
  it.each([
    {
      itemType: "web_search",
      data: {
        item: {
          type: "webSearch",
          action: { type: "search", query: "daylight saving", queries: null },
        },
      },
    },
    {
      itemType: "web_search",
      data: { item: { type: "webSearch", results: [{ title: "Page without optional metadata" }] } },
    },
    {
      itemType: "mcp_tool_call",
      data: {
        item: {
          server: "passbolt",
          tool: "run_with_credentials",
          result: { exit_code: 0, stdout: "done", stderr: "" },
        },
      },
    },
    {
      itemType: "mcp_tool_call",
      data: {
        item: {
          server: "passbolt",
          tool: "search_credentials",
          result:
            "Found 1 matching credentials.\n\n1. Example\n   Account: \n   Folder: \n   ID: abc\n",
        },
      },
    },
  ])(
    "keeps summaries with missing optional fields valid for HTTP JSON responses: %j",
    (payload) => {
      const projected = projectActivityPayload(activity(payload));
      expect(isJson(projected.payload)).toBe(true);
    },
  );

  it("keeps web titles and links on the wire without shipping full search output", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "web_search",
        data: {
          item: {
            type: "webSearch",
            action: { type: "openPage", url: "https://example.com" },
            results: [
              { title: "Readable page", url: "https://example.com", snippet: "x".repeat(10000) },
            ],
          },
        },
      }),
    );
    const data = (projected.payload as { data: Record<string, unknown> }).data;
    expect(data.summary).toMatchObject({
      kind: "web",
      action: "openPage",
      results: [{ title: "Readable page", url: "https://example.com/" }],
    });
    expect(JSON.stringify(data).length).toBeLessThan(1500);
  });

  it("preserves Passbolt stdout beyond the MCP output preview cutoff", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "mcp_tool_call",
        data: {
          item: {
            server: "passbolt",
            tool: "run_with_credentials",
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    credentials: [{ expected_name: "x".repeat(8000) }],
                    outcome: "completed",
                    exit_code: 0,
                    stdout: "actual output",
                  }),
                },
              ],
            },
          },
        },
      }),
    );
    const item = (projected.payload as { data: { item: Record<string, unknown> } }).data.item;
    expect(item.summary).toMatchObject({ kind: "execution", stdout: "actual output", exitCode: 0 });
    expect(JSON.stringify(item.result).length).toBeLessThan(4500);
  });
  it("preserves tool attribution (agentId/parentToolUseId) through data slimming", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "command_execution",
        agentId: "task-123",
        parentToolUseId: "toolu_abc",
        data: {
          toolName: "Bash",
          input: { command: "ls" },
          command: "ls",
          rawOutput: { content: "x".repeat(10) },
          somethingClientNeverReads: { big: "blob" },
        },
      }),
    );
    const payload = projected.payload as Record<string, unknown>;
    expect(payload.agentId).toBe("task-123");
    expect(payload.parentToolUseId).toBe("toolu_abc");
    // Slimming itself still applies to data.
    const data = payload.data as Record<string, unknown>;
    expect(data.somethingClientNeverReads).toBeUndefined();
  });

  it("keeps a bounded Codex command output summary", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "command_execution",
        data: {
          item: {
            command: "/bin/zsh -lc 'printf hello'",
            aggregatedOutput: `hello from codex\n${"x".repeat(5000)}`,
          },
        },
      }),
    );
    const data = (projected.payload as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.item).toEqual({
      command: "/bin/zsh -lc 'printf hello'",
      aggregatedOutput: "hello from codex",
    });
    expect(JSON.stringify(projected.payload).length).toBeLessThan(500);
  });

  it("keeps preview normalization and fence-only fallback while scanning lines", () => {
    const preview = projectActivityPayload(
      activity({
        itemType: "command_execution",
        data: { rawOutput: `\`\`\`\n  actual\tresult  \n${"x".repeat(5000)}` },
      }),
    );
    const fences = projectActivityPayload(
      activity({
        itemType: "command_execution",
        data: { rawOutput: "```\r\n \t \n```\n" },
      }),
    );

    expect((preview.payload as { data: { rawOutput: unknown } }).data.rawOutput).toEqual({
      content: "actual result",
    });
    expect((fences.payload as { data: { rawOutput: unknown } }).data.rawOutput).toEqual({
      content: "2 lines",
    });
  });

  it("keeps bounded Claude and ACP command output summaries", () => {
    const claude = projectActivityPayload(
      activity({
        itemType: "command_execution",
        data: {
          command: "printf hello",
          rawOutput: { stdout: `hello from claude\n${"y".repeat(5000)}` },
        },
      }),
    );
    const acp = projectActivityPayload(
      activity({
        itemType: "command_execution",
        data: {
          command: "printf hello",
          content: [
            {
              type: "content",
              content: { type: "text", text: `hello from acp\n${"z".repeat(5000)}` },
            },
          ],
        },
      }),
    );

    const claudeData = (claude.payload as Record<string, unknown>).data as Record<string, unknown>;
    const acpData = (acp.payload as Record<string, unknown>).data as Record<string, unknown>;
    expect(claudeData.rawOutput).toEqual({ content: "hello from claude" });
    expect(acpData.rawOutput).toEqual({ content: "hello from acp" });
    expect(JSON.stringify(claude.payload).length).toBeLessThan(500);
    expect(JSON.stringify(acp.payload).length).toBeLessThan(500);
  });

  it("keeps bounded Claude command input and result summaries", () => {
    const claude = projectActivityPayload(
      activity({
        itemType: "command_execution",
        toolCallId: "claude-call-1",
        data: {
          toolName: "Bash",
          input: { command: "vp test run" },
          result: {
            type: "tool_result",
            content: [
              { type: "text", text: "tests passed" },
              { type: "text", text: "x".repeat(5_000) },
            ],
          },
        },
      }),
    );
    const openCode = projectActivityPayload(
      activity({
        itemType: "command_execution",
        toolCallId: "opencode-call-1",
        data: {
          tool: "bash",
          state: {
            status: "running",
            input: { command: "vp lint" },
            output: "x".repeat(5_000),
          },
        },
      }),
    );

    expect(claude.payload).toMatchObject({
      toolCallId: "claude-call-1",
      data: {
        toolName: "Bash",
        command: "vp test run",
        rawOutput: { content: "tests passed" },
      },
    });
    expect(openCode.payload).toMatchObject({
      toolCallId: "opencode-call-1",
      data: { command: "vp lint" },
    });
    expect(JSON.stringify(claude.payload).length).toBeLessThan(250);
    expect(JSON.stringify(openCode.payload).length).toBeLessThan(200);
  });

  it("keeps full Claude Read image paths through repeated projection", () => {
    const imagePath = `/workspace/${"nested folder/".repeat(16)}reference image.webp`;
    const projected = projectActivityPayload(
      activity({
        itemType: "dynamic_tool_call",
        detail: 'Read: {"file_path":"truncated..."}',
        data: {
          toolName: "Read",
          input: { file_path: imagePath },
          result: { content: "Image Size: 1280x720." },
        },
      }),
    );
    const projectedAgain = projectActivityPayload(projected);

    expect(projected.payload).toMatchObject({ data: { imagePath } });
    expect(projectedAgain.payload).toMatchObject({ data: { imagePath } });

    const textRead = projectActivityPayload(
      activity({
        itemType: "dynamic_tool_call",
        data: { toolName: "Read", input: { file_path: "/workspace/src/index.ts" } },
      }),
    );
    expect(textRead.payload).not.toMatchObject({ data: { imagePath: expect.anything() } });
  });

  it("slims Codex-shaped mcp_tool_call items to rendered fields plus a bounded result preview", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "mcp_tool_call",
        data: {
          item: {
            type: "mcpToolCall",
            id: "item-1",
            tool: "fetch_pr",
            server: "github",
            status: "completed",
            arguments: { pr: 42 },
            durationMs: 1200,
            result: {
              content: [{ type: "text", text: `PR body line one\n${"x".repeat(5000)}` }],
              structuredContent: { huge: "y".repeat(5000) },
            },
            _meta: { internal: true },
          },
        },
      }),
    );
    const data = (projected.payload as Record<string, unknown>).data as Record<string, unknown>;
    const item = data.item as Record<string, unknown>;
    expect(item.tool).toBe("fetch_pr");
    expect(item.server).toBe("github");
    expect(item.arguments).toEqual({ pr: 42 });
    expect(item._meta).toBeUndefined();
    expect((item.result as { content: string }).content).toMatch(/^PR body line one\n/);
    expect((item.result as { content: string }).content).toContain(
      "Open full output for the rest.",
    );
    expect(JSON.stringify(projected.payload).length).toBeLessThan(5000);
  });

  it("slims Claude-shaped mcp_tool_call data (toolName/input/result block)", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "mcp_tool_call",
        data: {
          toolName: "mcp__github__fetch_pr",
          input: { pr: 42 },
          result: {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: [{ type: "text", text: `first line of output\n${"z".repeat(5000)}` }],
          },
        },
      }),
    );
    const data = (projected.payload as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.toolName).toBe("mcp__github__fetch_pr");
    expect(data.input).toEqual({ pr: 42 });
    expect((data.result as { content: string }).content).toMatch(/^first line of output\n/);
    expect((data.result as { content: string }).content).toContain(
      "Open full output for the rest.",
    );
    expect(JSON.stringify(projected.payload).length).toBeLessThan(5000);
  });

  it.each([
    {
      item: {
        type: "mcpToolCall",
        server: "passbolt",
        tool: "search_credentials",
        result: {
          content: [
            {
              type: "text",
              text: "Searched Passbolt for: Jim2\nFound 1 matching credential.\n1. Jim2 Preprod\n   ID: item-1",
            },
          ],
        },
      },
    },
    {
      toolName: "mcp__passbolt__search_credentials",
      result: {
        content:
          "Searched Passbolt for: Jim2\nFound 1 matching credential.\n1. Jim2 Preprod\n   ID: item-1",
      },
    },
  ])("keeps short MCP results in the activity preview", (data) => {
    const projected = projectActivityPayload(activity({ itemType: "mcp_tool_call", data }));
    const projectedAgain = projectActivityPayload(projected);
    expect(JSON.stringify(projectedAgain.payload)).toContain("Found 1 matching credential.");
    expect(JSON.stringify(projectedAgain.payload)).toContain("Jim2 Preprod");
  });

  it("keeps the full short result for other MCP calls", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "mcp_tool_call",
        data: {
          item: {
            type: "mcpToolCall",
            server: "passbolt",
            tool: "run_with_credentials",
            result: {
              content: [
                { type: "text", text: '{\n  "outcome": "completed",\n  "exit_code": 0\n}' },
              ],
            },
          },
        },
      }),
    );
    expect(projected.payload).toMatchObject({
      data: { item: { result: { content: '{\n  "outcome": "completed",\n  "exit_code": 0\n}' } } },
    });
  });

  it.each([
    {
      item: {
        server: "t3-code",
        tool: "preview_open",
        result: { structuredContent: { url: "https://example.com/" } },
      },
    },
    {
      toolName: "mcp__t3-code__preview_navigate",
      result: { content: '{"url":"https://example.com/"}' },
    },
    { tool: "t3-code_preview_status", state: { output: '{"url":"https://example.com/"}' } },
    {
      toolName: "mcp__t3_code__preview_snapshot",
      result: {
        content: [
          { type: "text", text: '{"url":"https://example.com/"}' },
          { type: "text", text: "Snapshot text was bounded. Omitted: accessibilityTree." },
        ],
      },
    },
    {
      toolName: "mcp__t3-code__preview_click",
      result: { content: '{"toolIcon":{"_tag":"website","pageUrl":"https://example.com/"}}' },
    },
    {
      toolName: "mcp__t3_code__preview_snapshot",
      result: { content: '{"url":"https://example.com/"}\n{"accessibilityTree":"truncated' },
    },
    ...[false, true].map((truncated) => ({
      toolName: "mcp__t3_code__preview_snapshot",
      result: {
        content: JSON.stringify({
          content: [{ type: "text", text: '{"url":"https://example.com/"}' }],
          structuredContent: { url: "https://example.com/", visibleText: "page" },
        }).slice(0, truncated ? -5 : undefined),
      },
    })),
    ...[
      "type",
      "press",
      "scroll",
      "resize",
      "set_appearance",
      "evaluate",
      "wait_for",
      "recording_start",
      "recording_stop",
    ].map((action) => ({
      toolName: `mcp__t3_code__preview_${action}`,
      result: { content: '{"toolIcon":{"_tag":"website","pageUrl":"https://example.com/"}}' },
    })),
  ])("preserves the preview page favicon through result slimming", (data) => {
    const projected = projectActivityPayload(activity({ itemType: "mcp_tool_call", data }));
    const icon = { _tag: "website", pageUrl: "https://example.com/" };
    expect(projected.payload).toMatchObject({ toolIcon: icon });
    expect(projectActivityPayload(projected).payload).toMatchObject({ toolIcon: icon });
  });

  it.each([
    { toolName: "mcp__other__preview_open", result: { content: '{"url":"https://example.com/"}' } },
    {
      toolName: "mcp__t3-code__preview_evaluate",
      result: { content: '{"url":"https://example.com/"}' },
    },
    {
      toolName: "mcp__t3-code__preview_open",
      result: { isError: true, content: '{"url":"https://example.com/"}' },
    },
    { toolName: "mcp__t3-code__preview_open", result: { content: "malformed JSON" } },
    { toolName: "mcp__t3-code__preview_open", result: { content: '{"url":"about:blank"}' } },
  ])("keeps the fallback for unrelated tools, failed navigation, and missing page URLs", (data) => {
    expect(
      projectActivityPayload(activity({ itemType: "mcp_tool_call", data })).payload,
    ).not.toHaveProperty("toolIcon");
  });

  it("passes task lifecycle payloads (no data field) through untouched", () => {
    const source = activity({
      taskId: "task-9",
      title: "Audit auth",
      role: "explorer",
      model: "opus",
      effort: "high",
      workflowName: "audit-flow",
      phases: [{ index: 0, title: "Audit" }],
      typedUsage: { totalTokens: 1200 },
      runHandles: { runId: "run-1", scriptPath: "/tmp/wf.js" },
      timelineBypass: true,
    });
    const projected = projectActivityPayload(source);
    expect(projected.payload).toEqual(source.payload);
  });
});

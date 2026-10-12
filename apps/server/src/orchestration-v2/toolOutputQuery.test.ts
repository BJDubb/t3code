import { assert, it } from "@effect/vitest";
import { toolOutputPage, retainedToolOutput, TOOL_OUTPUT_PAGE_SIZE } from "./toolOutputQuery.ts";

it("makes every retained web result available beyond the bounded wire summary", () => {
  const item = {
    type: "webSearch",
    results: Array.from({ length: 30 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
    })),
  };
  assert.deepStrictEqual(
    JSON.parse(retainedToolOutput({ itemType: "web_search", data: { item } })!),
    item,
  );
});

it("extracts output across provider shapes without returning tool inputs", () => {
  assert.strictEqual(
    retainedToolOutput({ data: { item: { aggregatedOutput: "first\nlast" } } }),
    "first\nlast",
  );
  assert.strictEqual(
    retainedToolOutput({
      data: {
        result: {
          content: [
            { type: "text", text: "a" },
            { type: "image", data: "ignored" },
            { type: "text", text: "b" },
          ],
        },
      },
    }),
    "a\nb",
  );
  assert.strictEqual(
    retainedToolOutput({ data: { rawOutput: { stdout: "out", stderr: "err" } } }),
    "out\nerr",
  );
  assert.strictEqual(retainedToolOutput({ data: { command: "secret input" } }), null);
  assert.strictEqual(retainedToolOutput({ data: { item: { aggregatedOutput: "" } } }), "");
});

it("returns saved edit patches and converts added file contents into a diff", () => {
  const patch = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
  assert.strictEqual(
    retainedToolOutput({
      itemType: "file_change",
      data: { item: { changes: [{ path: "a.ts", diff: patch }] } },
    }),
    patch,
  );
  assert.strictEqual(
    retainedToolOutput({
      itemType: "file_change",
      data: {
        item: { changes: [{ path: "new.ts", kind: { type: "add" }, diff: "hello\nworld\n" }] },
      },
    }),
    "--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1,2 @@\n+hello\n+world\n",
  );
  assert.strictEqual(
    retainedToolOutput({
      itemType: "file_change",
      data: { item: { changes: [{ path: "missing.ts" }] } },
    }),
    null,
  );
});

it("pages V2 command output without splitting unicode or exposing input", () => {
  const output = "a".repeat(TOOL_OUTPUT_PAGE_SIZE - 1) + "😀tail\n";
  const item = { type: "command_execution", input: "private command", output };
  const first = toolOutputPage(item, 0);
  const second = toolOutputPage(item, first.nextOffset!);
  assert.strictEqual(first.contents.length, TOOL_OUTPUT_PAGE_SIZE - 1);
  assert.strictEqual(first.contents + second.contents, output);
  assert.strictEqual(second.nextOffset, null);
  assert.strictEqual(
    retainedToolOutput({ type: "command_execution", input: "private command" }),
    null,
  );
});
it("retains a V2 saved edit without returning command inputs", () => {
  assert.strictEqual(
    retainedToolOutput({
      type: "file_change",
      fileName: "src/a.ts",
      diffStr: "@@ -1 +1 @@\n-old\n+new\n",
    }),
    "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n",
  );
  assert.strictEqual(
    retainedToolOutput({
      type: "dynamic_tool",
      input: { password: "input-only" },
      output: { value: "result" },
    }),
    JSON.stringify({ value: "result" }, null, 2),
  );
});

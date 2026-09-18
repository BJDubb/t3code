import { assert, it } from "@effect/vitest";
import { EventId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { readToolOutput, retainedToolOutput, TOOL_OUTPUT_PAGE_SIZE } from "./toolOutputQuery.ts";

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

it.layer(SqlitePersistenceMemory)("retained output query", (it) => {
  it.effect("pages an exact activity, preserves unicode and rejects a different thread", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // A temporary table isolates this query fixture from unrelated projection constraints.
      yield* sql`CREATE TEMP TABLE projection_thread_activities (thread_id TEXT, activity_id TEXT, kind TEXT, payload_json TEXT)`;
      const output = "a".repeat(TOOL_OUTPUT_PAGE_SIZE - 1) + "😀tail\n";
      const payload = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
        data: { item: { aggregatedOutput: output } },
      });
      yield* sql`INSERT INTO projection_thread_activities VALUES ('thread-a', 'activity-a', 'tool.completed', ${payload})`;
      const input = {
        threadId: ThreadId.make("thread-a"),
        activityId: EventId.make("activity-a"),
        offset: 0,
      };
      const first = yield* readToolOutput(input);
      assert.strictEqual(first.contents.length, TOOL_OUTPUT_PAGE_SIZE - 1);
      const second = yield* readToolOutput({ ...input, offset: first.nextOffset! });
      assert.strictEqual(first.contents + second.contents, output);
      assert.strictEqual(second.nextOffset, null);
      const rejected = yield* readToolOutput({
        ...input,
        threadId: ThreadId.make("thread-b"),
      }).pipe(Effect.flip);
      assert.strictEqual(rejected._tag, "OrchestrationGetToolOutputError");
    }),
  );
});

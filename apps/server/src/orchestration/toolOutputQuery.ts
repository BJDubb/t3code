import {
  OrchestrationGetToolOutputError,
  type OrchestrationGetToolOutputInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const decodePayload = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const RecordValue = Schema.Record(Schema.String, Schema.Unknown);
const record = Schema.decodeUnknownOption(RecordValue);
function object(value: unknown): Record<string, unknown> {
  const result = record(value);
  return result._tag === "Some" ? result.value : {};
}
function text(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const blocks = value.flatMap((block) => {
      const entry = object(block);
      return entry.type === "text" && typeof entry.text === "string" ? [entry.text] : [];
    });
    return blocks.length ? blocks.join("\n") : undefined;
  }
  const content = object(value).content;
  return typeof content === "string" || Array.isArray(content) ? text(content) : undefined;
}

/** Only output fields, never serialize the entire activity (which also has inputs). */
export function retainedToolOutput(payload: unknown): string | null {
  const root = object(payload);
  const data = object(root.data);
  const item = object(data.item);
  const result = object(item.result);
  const raw = object(data.rawOutput);
  for (const candidate of [
    item.aggregatedOutput,
    result.aggregatedOutput,
    data.output,
    data.result,
    item.result,
    data.content,
  ]) {
    const output = text(candidate);
    if (output !== undefined) return output;
  }
  if (typeof raw.stdout === "string" || typeof raw.stderr === "string") {
    return [raw.stdout, raw.stderr].filter((value) => typeof value === "string").join("\n");
  }
  return text(data.rawOutput) ?? null;
}

export const TOOL_OUTPUT_PAGE_SIZE = 64 * 1024;
export const readToolOutput = Effect.fn("orchestration.readToolOutput")(function* (
  input: OrchestrationGetToolOutputInput,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ payload: string }>`
    SELECT payload_json AS payload FROM projection_thread_activities
    WHERE thread_id = ${input.threadId} AND activity_id = ${input.activityId}
      AND kind IN ('tool.started', 'tool.updated', 'tool.completed')
    LIMIT 1
  `.pipe(
    Effect.mapError(
      () =>
        new OrchestrationGetToolOutputError({ message: "Could not read retained tool output." }),
    ),
  );
  const row = rows[0];
  if (!row)
    return yield* new OrchestrationGetToolOutputError({
      message: "This tool activity is no longer available.",
    });
  const payload = yield* decodePayload(row.payload).pipe(
    Effect.mapError(
      () =>
        new OrchestrationGetToolOutputError({
          message: "The retained tool output could not be decoded.",
        }),
    ),
  );
  const output = retainedToolOutput(payload);
  const offset = input.offset;
  // Keep surrogate pairs together at page boundaries.
  let end = Math.min(offset + TOOL_OUTPUT_PAGE_SIZE, output?.length ?? 0);
  if (output && end < output.length && /[\uD800-\uDBFF]/.test(output[end - 1] ?? "")) end--;
  return {
    available: output !== null,
    contents: output?.slice(offset, end) ?? "",
    totalChars: output?.length ?? 0,
    nextOffset: output && end < output.length ? end : null,
  };
});

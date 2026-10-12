import * as Schema from "effect/Schema";
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
  // V2 stores typed turn items instead of the V1 activity envelope.
  if (root.type === "command_execution") return text(root.output) ?? null;
  if (root.type === "dynamic_tool") return text(root.output) ?? (root.output === undefined ? null : JSON.stringify(root.output, null, 2));
  if (root.type === "file_change" && typeof root.patch === "string") return root.patch;
  if (root.type === "web_search" && root.results !== undefined) return JSON.stringify(root.results, null, 2);
  const data = object(root.data);
  const item = object(data.item);
  if (root.itemType === "web_search" && Array.isArray(item.results)) {
    return JSON.stringify(item, null, 2);
  }
  if (root.itemType === "file_change" && Array.isArray(item.changes)) {
    const patches = item.changes.flatMap((value) => {
      const change = object(value);
      if (typeof change.diff !== "string" || typeof change.path !== "string") return [];
      if (/^(?:diff --git|--- )/m.test(change.diff)) return [change.diff];
      const path = change.path.replace(/\\/g, "/");
      const kind = object(change.kind).type ?? change.kind;
      const lines = change.diff.replace(/\n$/, "").split("\n");
      const body =
        kind === "add" || kind === "delete"
          ? `@@ -${kind === "add" ? "0,0" : `1,${lines.length}`} +${kind === "delete" ? "0,0" : `1,${lines.length}`} @@\n${lines.map((line) => `${kind === "delete" ? "-" : "+"}${line}`).join("\n")}\n`
          : change.diff;
      return [
        `--- ${kind === "add" ? "/dev/null" : `a/${path}`}\n+++ ${kind === "delete" ? "/dev/null" : `b/${path}`}\n${body}`,
      ];
    });
    return patches.length ? patches.join("\n") : null;
  }
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
export function toolOutputPage(payload: unknown, offset: number) {
 const output = retainedToolOutput(payload);
 let end = Math.min(offset + TOOL_OUTPUT_PAGE_SIZE, output?.length ?? 0);
 if (output && end < output.length && /[\uD800-\uDBFF]/.test(output[end - 1] ?? "")) end--;
 return {available: output !== null, contents: output?.slice(offset,end) ?? "", totalChars: output?.length ?? 0, nextOffset: output && end < output.length ? end : null};
}

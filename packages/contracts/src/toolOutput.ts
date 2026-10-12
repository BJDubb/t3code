import * as Schema from "effect/Schema";
import { EventId, ThreadId } from "./baseSchemas.ts";
import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
export const PERSONAL_WS_METHODS = { getToolOutput: "orchestration.getToolOutput" } as const;
export const OrchestrationGetToolOutputInput = Schema.Struct({
  threadId: ThreadId,
  activityId: EventId,
  offset: NonNegativeInt,
});
export type OrchestrationGetToolOutputInput = typeof OrchestrationGetToolOutputInput.Type;
export const OrchestrationGetToolOutputResult = Schema.Struct({
  available: Schema.Boolean,
  contents: Schema.String,
  totalChars: NonNegativeInt,
  nextOffset: Schema.NullOr(NonNegativeInt),
});
export type OrchestrationGetToolOutputResult = typeof OrchestrationGetToolOutputResult.Type;
export class OrchestrationGetToolOutputError extends Schema.TaggedError<OrchestrationGetToolOutputError>()(
  "OrchestrationGetToolOutputError",
  { message: TrimmedNonEmptyString },
) {}


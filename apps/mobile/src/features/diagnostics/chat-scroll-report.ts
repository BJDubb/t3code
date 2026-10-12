export type ChatScrollEventKind =
  | "mount"
  | "data"
  | "layout"
  | "drag-start"
  | "drag-end"
  | "momentum-start"
  | "momentum-end"
  | "scroll"
  | "adjust"
  | "lifecycle"
  | "restore"
  | "follow"
  | "command"
  | "native-top"
  | "jump";

export interface ChatScrollMetrics {
  readonly offset?: number;
  readonly nativeOffset?: number;
  readonly contentHeight?: number;
  readonly viewportHeight?: number;
  readonly insetTop?: number;
  readonly insetBottom?: number;
  readonly rowCount?: number;
  readonly firstIndex?: number;
  readonly adjustment?: number;
  readonly targetIndex?: number;
  readonly targetOffset?: number;
  readonly pendingRestore?: boolean;
  readonly restoring?: boolean;
  readonly following?: boolean;
  readonly atEnd?: boolean;
  readonly phase?:
    | "active"
    | "inactive"
    | "background"
    | "unknown"
    | "extension"
    | "ready"
    | "loading"
    | "unavailable";
  readonly source?:
    | "scrollAdjust"
    | "scrollAdjustPending"
    | "scrollAdjustUserOffset"
    | "totalSize"
    | "alignItemsAtEndPadding"
    | "scrollTo"
    | "scrollToEnd"
    | "setNativeProps";
}

const NUMERIC_FIELDS = [
  "offset",
  "nativeOffset",
  "contentHeight",
  "viewportHeight",
  "insetTop",
  "insetBottom",
  "rowCount",
  "firstIndex",
  "adjustment",
  "targetIndex",
  "targetOffset",
] as const;
const PHASES = new Set([
  "active",
  "inactive",
  "background",
  "unknown",
  "extension",
  "ready",
  "loading",
  "unavailable",
]);
const SOURCES = new Set([
  "scrollAdjust",
  "scrollAdjustPending",
  "scrollAdjustUserOffset",
  "totalSize",
  "alignItemsAtEndPadding",
  "scrollTo",
  "scrollToEnd",
  "setNativeProps",
]);

/** Observe JS native commands without changing their receiver, arguments, or result. */
export function traceNativeScrollCommands(
  view: object,
  record: (metrics: ChatScrollMetrics) => void,
) {
  const cleanups: Array<() => void> = [];
  for (const source of ["scrollTo", "scrollToEnd", "setNativeProps"] as const) {
    const original: unknown = Reflect.get(view, source);
    if (typeof original !== "function") continue;
    const descriptor = Object.getOwnPropertyDescriptor(view, source);
    const wrapped = function (this: unknown, ...args: unknown[]) {
      const first = args[0];
      let targetOffset: number | undefined;
      if (first !== null && typeof first === "object") {
        const offset: unknown =
          source === "setNativeProps" ? Reflect.get(first, "contentOffset") : first;
        if (offset !== null && typeof offset === "object") {
          const y: unknown = Reflect.get(offset, "y");
          if (typeof y === "number") targetOffset = y;
        }
      } else if (source === "scrollTo" && typeof first === "number") {
        targetOffset = first;
      }
      // Insets and unrelated native props are not scroll commands.
      if (source !== "setNativeProps" || targetOffset !== undefined)
        record({ source, targetOffset });
      return Reflect.apply(original, this, args);
    };
    if (!Reflect.set(view, source, wrapped)) continue;
    cleanups.push(() => {
      if (Reflect.get(view, source) !== wrapped) return;
      if (descriptor) Object.defineProperty(view, source, descriptor);
      else Reflect.deleteProperty(view, source);
    });
  }
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

/** Bounded per-launch trace; retain the lead-up and a short tail when a top jump occurs. */
export class ChatScrollRecorder {
  private events: Array<ChatScrollMetrics & { time: number; kind: ChatScrollEventKind }> = [];
  private previousNativeOffset: number | undefined;
  private tailRemaining: number | undefined;

  record(kind: ChatScrollEventKind, metrics: ChatScrollMetrics = {}) {
    if (this.tailRemaining === 0) return;
    const safe: { -readonly [Key in keyof ChatScrollMetrics]: ChatScrollMetrics[Key] } = {};
    for (const key of NUMERIC_FIELDS) {
      const value = metrics[key];
      if (typeof value === "number" && Number.isFinite(value))
        safe[key] = Math.round(value * 100) / 100;
    }
    if (typeof metrics.following === "boolean") safe.following = metrics.following;
    if (typeof metrics.atEnd === "boolean") safe.atEnd = metrics.atEnd;
    if (typeof metrics.pendingRestore === "boolean") safe.pendingRestore = metrics.pendingRestore;
    if (typeof metrics.restoring === "boolean") safe.restoring = metrics.restoring;
    if (metrics.phase && PHASES.has(metrics.phase)) safe.phase = metrics.phase;
    if (metrics.source && SOURCES.has(metrics.source)) safe.source = metrics.source;
    const previous = this.previousNativeOffset;
    const next = safe.nativeOffset;
    const viewport = safe.viewportHeight ?? 400;
    const jumped =
      kind === "scroll" &&
      next !== undefined &&
      previous !== undefined &&
      previous > viewport &&
      next <= 100 &&
      previous - next > Math.max(400, viewport);
    if ((kind === "scroll" || kind === "drag-start") && next !== undefined)
      this.previousNativeOffset = next;
    if (jumped && this.tailRemaining === undefined) this.tailRemaining = 20;
    else if (this.tailRemaining !== undefined) this.tailRemaining--;
    this.events.push({ time: Date.now(), kind: jumped ? "jump" : kind, ...safe });
    if (this.tailRemaining === undefined && this.events.length > 120) this.events.shift();
  }

  clear() {
    this.events = [];
    this.previousNativeOffset = undefined;
    this.tailRemaining = undefined;
  }

  report(identity: {
    version: string;
    build: string;
    updateId: string | null;
    runtime: string | null;
  }) {
    return JSON.stringify(
      {
        identity,
        capturedTopJump: this.events.some((event) => event.kind === "jump"),
        events: this.events,
      },
      null,
      2,
    );
  }
}

export const chatScrollRecorder = new ChatScrollRecorder();

import { describe, expect, it } from "vite-plus/test";
import { ChatScrollRecorder, traceNativeScrollCommands } from "./chat-scroll-report";

const identity = {
  version: "1.4.0",
  build: "13",
  updateId: "installed-update",
  runtime: "runtime",
};

describe("phone scrolling report", () => {
  it("captures native command destinations while preserving the call and restoring inherited methods", () => {
    const trace = new ChatScrollRecorder();
    const calls: unknown[][] = [];
    const prototype = {
      scrollTo(this: { position: number }, options: { y: number }, marker: unknown) {
        calls.push([this, options, marker]);
        this.position = options.y;
        return "native-result";
      },
      setNativeProps(props: object) {
        calls.push([props]);
      },
    };
    const view = Object.assign(Object.create(prototype), { position: 106249 });
    const stop = traceNativeScrollCommands(view, (metrics) => trace.record("command", metrics));
    const options = { y: 0, privateText: "do-not-record" };
    expect(view.scrollTo(options, 42)).toBe("native-result");
    expect(view.position).toBe(0);
    expect(calls[0]).toEqual([view, options, 42]);
    view.setNativeProps({ contentInset: { bottom: 60 } });
    view.setNativeProps({ contentOffset: { x: 0, y: 9000 } });
    const report = JSON.parse(trace.report(identity));
    expect(report.events).toMatchObject([
      { kind: "command", source: "scrollTo", targetOffset: 0 },
      { kind: "command", source: "setNativeProps", targetOffset: 9000 },
    ]);
    expect(trace.report(identity)).not.toContain("do-not-record");
    stop();
    expect(Object.hasOwn(view, "scrollTo")).toBe(false);
    expect(view.scrollTo).toBe(prototype.scrollTo);
    view.scrollTo({ y: 1 }, 7);
    expect(JSON.parse(trace.report(identity)).events).toHaveLength(2);
  });
  it("keeps the lead-up and a bounded tail after a top jump", () => {
    const trace = new ChatScrollRecorder();
    trace.record("drag-start", { offset: 7000, viewportHeight: 800 });
    trace.record("scroll", { nativeOffset: 6985, viewportHeight: 800 });
    trace.record("adjust", { source: "scrollAdjust", adjustment: -7000 });
    trace.record("scroll", { nativeOffset: 0, viewportHeight: 800 });
    for (let i = 0; i < 200; i++) trace.record("layout", { contentHeight: i });
    const report = JSON.parse(trace.report(identity));
    expect(report.capturedTopJump).toBe(true);
    expect(report.events[0].kind).toBe("drag-start");
    expect(report.events[3].kind).toBe("jump");
    expect(report.events).toHaveLength(24);
    expect(report.identity.updateId).toBe("installed-update");
  });
  it("bounds ordinary scrolling and excludes values outside the numeric/lifecycle fields", () => {
    const trace = new ChatScrollRecorder();
    for (let i = 0; i < 200; i++) trace.record("scroll", { nativeOffset: 1000 + i });
    trace.record("layout", {
      rowCount: 42,
      offset: Infinity,
      command: "private-command",
      message: "private-message",
    } as { rowCount: number });
    const text = trace.report(identity);
    const report = JSON.parse(text);
    expect(report.events).toHaveLength(120);
    expect(text).not.toContain("private-");
    expect(report.events.at(-1)).toMatchObject({ kind: "layout", rowCount: 42 });
    expect(report.events.at(-1).offset).toBeUndefined();
    trace.clear();
    expect(JSON.parse(trace.report(identity)).events).toEqual([]);
  });
});

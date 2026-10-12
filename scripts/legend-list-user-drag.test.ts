// @effect-diagnostics nodeBuiltinImport:off - exercises the installed native JS patch in a synchronous VM.
import * as NodeFS from "node:fs";
import * as NodeVM from "node:vm";
import { describe, expect, it, vi } from "vite-plus/test";

function createList(bundle: string) {
  const source = NodeFS.readFileSync(
    new URL(`../apps/mobile/node_modules/@legendapp/list/${bundle}`, import.meta.url),
    "utf8",
  );
  const cancel = source.slice(
    source.indexOf("function cancelScrollCompletionChecks("),
    source.indexOf("// src/core/deferredPublicOnScroll.ts"),
  );
  const supersede = source.slice(
    source.indexOf("function supersedeInitialScroll("),
    source.indexOf("function finishInitialScroll("),
  );
  const nativeScroll = source.slice(
    source.indexOf("function onScroll(ctx, event)"),
    source.indexOf("// src/core/ScheduledWork.ts"),
  );
  const dragBody =
    /onScrollBeginDrag: \(event\) => \{([\s\S]*?)\n      \},\n      onScrollEnd:/.exec(source)?.[1];
  if (!dragBody) throw new Error("Native drag handler not found");
  const frames: Array<() => void> = [];
  const scrollTo = vi.fn();
  const pendingResolve = vi.fn();
  const finish = vi.fn();
  const state = {
    props: {
      horizontal: false,
      onScrollBeginDrag: vi.fn(),
      onScroll: vi.fn(),
      maintainScrollAtEnd: { animated: false },
    },
    initialScroll: { index: 49, viewPosition: 1 },
    initialScrollSession: { kind: "bootstrap", bootstrap: { frameHandle: 1 } },
    scrollingTo: { offset: 8000, index: 49, isInitialScroll: true },
    scrollTargetPinnedRange: { start: 49, end: 49 },
    pendingScrollResolve: pendingResolve,
    pendingMaintainScrollAtEnd: true,
    maintainingScrollAtEnd: "pending-instant",
    scroll: 8000,
    scrollLength: 800,
    didUserDrag: false,
    isUserDragging: false,
    refScroller: { current: { scrollTo: vi.fn(), scrollToEnd: vi.fn() } },
    didContainersLayout: true,
    scheduledWork: { cancel: vi.fn() },
  };
  const ctx = { state };
  const endMaintenance = source.slice(
    source.indexOf("function doMaintainScrollAtEnd("),
    source.indexOf("// src/utils/requestAdjust.ts"),
  );
  const globals = {
    ctx,
    state,
    scrollTo,
    Platform: { OS: "ios" },
    prepareReachedEdgeForNextUserScroll: vi.fn(),
    cancelAnimationFrame: vi.fn(),
    initialScrollCompletion: { resetFlags: vi.fn() },
    setInitialScrollSession: vi.fn(),
    finishInitialScroll: (context: typeof ctx) => {
      finish();
      Object.assign(context.state, { initialScroll: undefined, initialScrollSession: undefined });
    },
    updateScroll: (context: typeof ctx, offset: number) => {
      context.state.scroll = offset;
    },
    trackInitialScrollNativeProgress: vi.fn(),
    clearFinishedBootstrapInitialScrollTargetIfMovedAway: vi.fn(),
    checkFinishedScroll: vi.fn(),
    clampScrollOffset: () => 0,
    shouldDeferPublicOnScroll: () => false,
    requestAnimationFrame: (callback: () => void) => {
      frames.push(callback);
      return frames.length;
    },
    peek$: () => true,
    getContentSize: () => 8800,
    getContentInsetStartAdjustment: () => 100,
    isHorizontalRTL: () => false,
    setTimeout: vi.fn(),
  };
  const api = NodeVM.runInNewContext(
    `${cancel}\n${supersede}\n${nativeScroll}\n${endMaintenance}\n({drag: (event) => {${dragBody}}, scroll: (event) => onScroll(ctx,event), maintain: () => doMaintainScrollAtEnd(ctx)})`,
    globals,
  ) as {
    drag: (event: unknown) => void;
    scroll: (event: unknown) => void;
    maintain: () => void;
  };
  const event = {
    nativeEvent: { contentOffset: { x: 0, y: 7985 }, contentSize: { width: 400, height: 8800 } },
  };
  return {
    state,
    api,
    event,
    scrollTo,
    pendingResolve,
    finish,
    advance: () => {
      for (const frame of frames.splice(0)) frame();
    },
  };
}

for (const bundle of ["react-native.js", "react-native.mjs"]) {
  describe(`first drag after startup (${bundle})`, () => {
    it("lets a small upward drag take ownership before a stale startup target can clamp it to the top", () => {
      const list = createList(bundle);
      list.api.drag(list.event);
      list.api.scroll(list.event);
      expect(list.scrollTo).not.toHaveBeenCalled();
      expect(list.state.scroll).toBe(7985);
      expect(list.state.scrollingTo).toBeUndefined();
      expect(list.pendingResolve).toHaveBeenCalledOnce();
    });
    it("also retires a stale ordinary imperative target when the user takes over", () => {
      const list = createList(bundle);
      Object.assign(list.state, {
        initialScroll: undefined,
        initialScrollSession: undefined,
        scrollingTo: { offset: 8000, isInitialScroll: false },
      });
      list.api.drag(list.event);
      list.api.scroll(list.event);
      expect(list.scrollTo).not.toHaveBeenCalled();
      expect(list.state.scroll).toBe(7985);
      expect(list.pendingResolve).toHaveBeenCalledOnce();
    });
    it("still performs normal end maintenance when no gesture interrupts it", () => {
      const list = createList(bundle);
      Object.assign(list.state, { maintainingScrollAtEnd: undefined, scrollingTo: undefined });
      list.api.maintain();
      list.advance();
      expect(list.state.refScroller.current.scrollTo).toHaveBeenCalledWith({
        animated: false,
        x: 0,
        y: 8000,
      });
    });
    it("cancels an end pin queued before the finger touches down, even before the first scroll event", () => {
      const list = createList(bundle);
      Object.assign(list.state, { maintainingScrollAtEnd: undefined, scrollingTo: undefined });
      list.api.maintain();
      list.api.drag(list.event);
      list.advance();
      expect(list.state.refScroller.current.scrollTo).not.toHaveBeenCalled();
      expect(list.state.refScroller.current.scrollToEnd).not.toHaveBeenCalled();
    });
  });
}

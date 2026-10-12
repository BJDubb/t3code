import { describe, expect, it } from "vite-plus/test";

import {
  resolveThreadFeedLiveFollow,
  resolveThreadFeedSnapshot,
  resolveThreadFeedReturnScroll,
  threadFeedReturnScrollIsPending,
  resolveThreadFeedSubmissionAnchor,
  resolveThreadWorkGroupInitialScroll,
  shouldFollowThreadWorkGroupAppend,
} from "./thread-feed-live-follow";

describe("tool-group scroll restoration", () => {
  const position = {
    rowId: "read-output",
    offsetWithinRow: 80,
    scrollOffset: 600,
    contentHeight: 1_000,
  };

  it("restores the visible row and its detail offset rather than stale absolute pixels", () => {
    const before = [{ id: "first" }, { id: "read-output" }, { id: "last" }];
    const after = [{ id: "older" }, ...before];
    expect(resolveThreadWorkGroupInitialScroll(before, position)).toEqual({
      index: 1,
      viewOffset: -80,
    });
    expect(resolveThreadWorkGroupInitialScroll(after, position)).toEqual({
      index: 2,
      viewOffset: -80,
    });
  });

  it("starts normally when the saved row no longer belongs to the group", () => {
    expect(resolveThreadWorkGroupInitialScroll([{ id: "other" }], position)).toBeUndefined();
    expect(resolveThreadWorkGroupInitialScroll([{ id: "read-output" }], undefined)).toBeUndefined();
  });
});

describe("tool-group append following", () => {
  const previousRows = Array.from({ length: 10 }, (_, index) => ({ id: `call-${index}` }));
  const appendedRows = [...previousRows, { id: "new-call" }];
  const atEnd = {
    previousRows,
    rows: appendedRows,
    previousContentHeight: 289,
    contentHeight: 318,
    viewportHeight: 256,
    scrollOffset: 33,
    detailsChanged: false,
    userScrolling: false,
  };

  it("follows a new call when the reader was at the end", () => {
    expect(shouldFollowThreadWorkGroupAppend(atEnd)).toBe(true);
  });

  it("follows the first overflowing append as a short group reaches its height cap", () => {
    expect(
      shouldFollowThreadWorkGroupAppend({
        ...atEnd,
        previousRows: previousRows.slice(0, 8),
        rows: previousRows.slice(0, 9),
        previousContentHeight: 231,
        contentHeight: 260,
        viewportHeight: 231,
        scrollOffset: 0,
      }),
    ).toBe(true);
  });

  it.each([
    { name: "reading earlier calls", changes: { scrollOffset: 20 } },
    { name: "dragging before leaving the edge", changes: { userScrolling: true } },
    { name: "opening detail during an append", changes: { detailsChanged: true } },
    { name: "streaming a result", changes: { rows: previousRows, contentHeight: 600 } },
    { name: "updating a lifecycle label", changes: { rows: previousRows, contentHeight: 289 } },
    { name: "prepending old calls", changes: { rows: [{ id: "older" }, ...previousRows] } },
    {
      name: "replacing a call while appending",
      changes: { rows: [{ id: "replacement" }, ...appendedRows.slice(1)] },
    },
  ])("does not steal the reader's position when $name", ({ changes }) => {
    expect(shouldFollowThreadWorkGroupAppend({ ...atEnd, ...changes })).toBe(false);
  });
});

describe("resolveThreadFeedSubmissionAnchor", () => {
  it("anchors the first user message in a thread", () => {
    expect(
      resolveThreadFeedSubmissionAnchor({
        currentAnchorMessageId: null,
        submittedMessageId: "first-message",
        hasStartedTurn: false,
        hasUserMessage: false,
        queuedMessageCount: 0,
      }),
    ).toBe("first-message");
  });

  it("preserves the first-message anchor when another message is queued", () => {
    expect(
      resolveThreadFeedSubmissionAnchor({
        currentAnchorMessageId: "first-message",
        submittedMessageId: "second-message",
        hasStartedTurn: false,
        hasUserMessage: false,
        queuedMessageCount: 1,
      }),
    ).toBe("first-message");
  });

  it("preserves the first-message anchor after its outbox entry drains", () => {
    expect(
      resolveThreadFeedSubmissionAnchor({
        currentAnchorMessageId: "first-message",
        submittedMessageId: "second-message",
        hasStartedTurn: false,
        hasUserMessage: false,
        queuedMessageCount: 0,
      }),
    ).toBe("first-message");
  });

  it("does not anchor a follow-up after a user message appears", () => {
    expect(
      resolveThreadFeedSubmissionAnchor({
        currentAnchorMessageId: "first-message",
        submittedMessageId: "second-message",
        hasStartedTurn: false,
        hasUserMessage: true,
        queuedMessageCount: 0,
      }),
    ).toBeNull();
  });

  it("does not anchor a thread that has already started a turn", () => {
    expect(
      resolveThreadFeedSubmissionAnchor({
        currentAnchorMessageId: null,
        submittedMessageId: "second-message",
        hasStartedTurn: true,
        hasUserMessage: false,
        queuedMessageCount: 0,
      }),
    ).toBeNull();
  });
});

describe("resolveThreadFeedLiveFollow", () => {
  it("pauses immediately when the user starts scrolling", () => {
    expect(resolveThreadFeedLiveFollow(true, { type: "user-scroll-begin" })).toBe(false);
  });

  it("stays paused away from the actual end", () => {
    expect(
      resolveThreadFeedLiveFollow(false, {
        type: "scroll",
        isAtEnd: false,
        userScrollSessionActive: true,
      }),
    ).toBe(false);
  });

  it("does not mistake programmatic layout compensation for a user scroll", () => {
    expect(
      resolveThreadFeedLiveFollow(true, {
        type: "scroll",
        isAtEnd: false,
        userScrollSessionActive: false,
      }),
    ).toBe(true);
  });

  it("does not re-arm at the end while a user scroll session is active", () => {
    expect(
      resolveThreadFeedLiveFollow(false, {
        type: "scroll",
        isAtEnd: true,
        userScrollSessionActive: true,
      }),
    ).toBe(false);
  });

  it.each([
    { isAtEnd: false, userScrollSessionActive: false, expected: false },
    { isAtEnd: true, userScrollSessionActive: false, expected: true },
    { isAtEnd: false, userScrollSessionActive: true, expected: false },
    { isAtEnd: true, userScrollSessionActive: true, expected: false },
  ])("reconciles follow after a disclosure settles: %j", ({ expected, ...state }) => {
    expect(resolveThreadFeedLiveFollow(!expected, { type: "disclosure-settled", ...state })).toBe(
      expected,
    );
  });

  it("re-arms at the actual end only after the user scroll session ends", () => {
    expect(
      resolveThreadFeedLiveFollow(false, {
        type: "user-scroll-end",
        isAtEnd: true,
        userScrollSessionActive: true,
      }),
    ).toBe(true);
    expect(
      resolveThreadFeedLiveFollow(false, {
        type: "user-scroll-end",
        isAtEnd: false,
        userScrollSessionActive: true,
      }),
    ).toBe(false);
  });

  it("ignores momentum-end events from programmatic scrolling", () => {
    expect(
      resolveThreadFeedLiveFollow(true, {
        type: "user-scroll-end",
        isAtEnd: false,
        userScrollSessionActive: false,
      }),
    ).toBe(true);
  });

  it("re-arms after an explicit reset", () => {
    expect(resolveThreadFeedLiveFollow(false, { type: "reset" })).toBe(true);
  });
});

describe("conversation snapshot during reconnect", () => {
  it("retains populated rows during loading, replaces them after recovery, and clears on deletion or thread switch", () => {
    const previous = { threadKey: "env:thread", feed: [{ id: "reading-here" }] };
    expect(resolveThreadFeedSnapshot(previous, previous.threadKey, [], true)).toBe(previous);
    const recovered = [...previous.feed, { id: "new-call" }];
    expect(resolveThreadFeedSnapshot(previous, previous.threadKey, recovered, false).feed).toBe(
      recovered,
    );
    expect(resolveThreadFeedSnapshot(previous, previous.threadKey, [], false).feed).toEqual([]);
    expect(resolveThreadFeedSnapshot(previous, "other:thread", [], true).feed).toEqual([]);
  });
});

describe("returning to a conversation", () => {
  it("restores the reading row after new history arrives, while followers return to the live edge", () => {
    const saved = { rowId: "reading", offsetWithinRow: 74, followEnd: false };
    expect(
      resolveThreadFeedReturnScroll(
        [{ id: "older" }, { id: "reading" }, { id: "new-call" }],
        saved,
      ),
    ).toEqual({ index: 1, viewOffset: -74 });
    expect(
      resolveThreadFeedReturnScroll([{ id: "reading" }], { ...saved, followEnd: true }),
    ).toBeUndefined();
    expect(resolveThreadFeedReturnScroll([{ id: "other-thread" }], saved)).toBeUndefined();
  });
});

describe("reading-position restoration while history downloads", () => {
  it("waits through an empty and partial snapshot until the reading row arrives", () => {
    const saved = { rowId: "reading", offsetWithinRow: 74, followEnd: false };
    expect(threadFeedReturnScrollIsPending([], saved)).toBe(true);
    const partial = [{ id: "recent-only" }];
    expect(threadFeedReturnScrollIsPending(partial, saved)).toBe(true);
    const synced = [{ id: "older" }, { id: "reading" }, ...partial];
    expect(threadFeedReturnScrollIsPending(synced, saved)).toBe(false);
    expect(resolveThreadFeedReturnScroll(synced, saved)).toEqual({ index: 1, viewOffset: -74 });
    expect(threadFeedReturnScrollIsPending(partial, { ...saved, followEnd: true })).toBe(false);
    expect(threadFeedReturnScrollIsPending([], undefined)).toBe(false);
  });
});

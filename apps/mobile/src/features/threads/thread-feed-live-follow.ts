export type ThreadFeedLiveFollowEvent =
  | { readonly type: "reset" }
  | { readonly type: "user-scroll-begin" }
  | {
      readonly type: "user-scroll-end";
      readonly isAtEnd: boolean;
      readonly userScrollSessionActive: boolean;
    }
  | {
      readonly type: "scroll" | "disclosure-settled";
      readonly isAtEnd: boolean;
      readonly userScrollSessionActive: boolean;
    };

/** A reconnect can briefly remove detail data; keep the mounted reader's snapshot. */
export function resolveThreadFeedSnapshot<T>(
  previous: { readonly threadKey: string; readonly feed: ReadonlyArray<T> },
  threadKey: string,
  feed: ReadonlyArray<T>,
  retainWhileLoading: boolean,
) {
  return retainWhileLoading && feed.length === 0 && previous.threadKey === threadKey
    ? previous
    : previous.threadKey === threadKey && previous.feed === feed
      ? previous
      : { threadKey, feed };
}

export interface ThreadWorkGroupScrollPosition {
  readonly rowId: string;
  readonly offsetWithinRow: number;
  readonly scrollOffset: number;
  readonly contentHeight: number;
}

export function resolveThreadWorkGroupInitialScroll(
  rows: ReadonlyArray<{ readonly id: string }>,
  position: ThreadWorkGroupScrollPosition | undefined,
) {
  const index = position ? rows.findIndex((row) => row.id === position.rowId) : -1;
  return index >= 0 && position ? { index, viewOffset: -position.offsetWithinRow } : undefined;
}

export function shouldFollowThreadWorkGroupAppend(input: {
  readonly previousRows: ReadonlyArray<{ readonly id: string }>;
  readonly rows: ReadonlyArray<{ readonly id: string }>;
  readonly previousContentHeight: number;
  readonly contentHeight: number;
  readonly viewportHeight: number;
  readonly scrollOffset: number;
  readonly detailsChanged: boolean;
  readonly userScrolling: boolean;
}) {
  return (
    !input.detailsChanged &&
    !input.userScrolling &&
    input.contentHeight > input.previousContentHeight &&
    input.rows.length > input.previousRows.length &&
    input.previousRows.every((row, index) => row.id === input.rows[index]?.id) &&
    input.previousContentHeight - input.viewportHeight - input.scrollOffset <= 1
  );
}

export function resolveThreadFeedSubmissionAnchor<AnchorId>(input: {
  readonly currentAnchorMessageId: AnchorId | null;
  readonly submittedMessageId: AnchorId;
  readonly hasStartedTurn: boolean;
  readonly hasUserMessage: boolean;
  readonly queuedMessageCount: number;
}): AnchorId | null {
  if (input.hasStartedTurn || input.hasUserMessage) {
    return null;
  }

  if (input.currentAnchorMessageId !== null) {
    return input.currentAnchorMessageId;
  }

  return input.queuedMessageCount > 0 ? null : input.submittedMessageId;
}

export function resolveThreadFeedLiveFollow(
  current: boolean,
  event: ThreadFeedLiveFollowEvent,
): boolean {
  switch (event.type) {
    case "reset":
      return true;
    case "user-scroll-begin":
      return false;
    case "user-scroll-end":
      return event.userScrollSessionActive ? event.isAtEnd : current;
    case "disclosure-settled":
      return !event.userScrollSessionActive && event.isAtEnd;
    case "scroll":
      if (event.userScrollSessionActive) {
        return false;
      }
      if (event.isAtEnd) {
        return true;
      }
      return current;
  }
}

export interface ThreadFeedReadingPosition {
  readonly rowId: string;
  readonly offsetWithinRow: number;
  readonly followEnd: boolean;
}

export function resolveThreadFeedReturnScroll(
  rows: ReadonlyArray<{ readonly id: string }>,
  position: ThreadFeedReadingPosition | undefined,
) {
  if (!position || position.followEnd) return undefined;
  const index = rows.findIndex((row) => row.id === position.rowId);
  return index >= 0 ? { index, viewOffset: -position.offsetWithinRow } : undefined;
}

/** Missing history is a pending restore, not permission to follow the live edge. */
export function threadFeedReturnScrollIsPending(
  rows: ReadonlyArray<{ readonly id: string }>,
  position: ThreadFeedReadingPosition | undefined,
) {
  return !!position && !position.followEnd && !rows.some((row) => row.id === position.rowId);
}

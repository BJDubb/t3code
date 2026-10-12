import { useEffect, useRef } from "react";

export function workspaceMutationRefreshToken(
  resourceKey: string,
  mutationId: string | null,
): string | null {
  return mutationId === null ? null : `${resourceKey}\u0000${mutationId}`;
}

/**
 * Refreshes once per mutation and resource. Disabled mutations stay pending,
 * which lets an editable file catch up after its local save finishes.
 */
export function useWorkspaceMutationRefresh(input: {
  readonly enabled?: boolean;
  readonly isPending?: boolean;
  readonly mutationId: string | null;
  readonly refresh: () => void;
  readonly resourceKey: string;
}): void {
  const { enabled = true, isPending = false, mutationId, refresh, resourceKey } = input;
  const handledTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || isPending) return;
    const token = workspaceMutationRefreshToken(resourceKey, mutationId);
    if (token === null || token === handledTokenRef.current) return;
    handledTokenRef.current = token;
    refresh();
  }, [enabled, isPending, mutationId, refresh, resourceKey]);
}

import { beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ handled: { current: null as string | null } }));
vi.mock("react", () => ({
  useRef: () => state.handled,
  useEffect: (effect: () => void) => effect(),
}));
import { useWorkspaceMutationRefresh } from "./useWorkspaceMutationRefresh";

beforeEach(() => {
  state.handled.current = null;
});

it("lets a running read finish and refreshes once for the newest workspace mutation", () => {
  const refresh = vi.fn();
  const render = (mutationId: string, isPending: boolean) =>
    useWorkspaceMutationRefresh({ resourceKey: "diff:thread", mutationId, isPending, refresh });
  render("first", false);
  render("second", true);
  render("third", true);
  expect(refresh).toHaveBeenCalledTimes(1);
  render("third", false);
  render("third", false);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("keeps a mutation pending while the resource is disabled", () => {
  const refresh = vi.fn();
  const input = { resourceKey: "diff:thread", mutationId: "first", refresh };
  useWorkspaceMutationRefresh({ ...input, enabled: false });
  expect(refresh).not.toHaveBeenCalled();
  useWorkspaceMutationRefresh(input);
  expect(refresh).toHaveBeenCalledTimes(1);
});

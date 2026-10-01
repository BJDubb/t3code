import { beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  wait: vi.fn(),
  open: vi.fn(),
  id: 0,
}));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
}));
vi.mock("../state/projects", () => ({
  projectEnvironment: { create: "create", update: "update" },
}));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "create" ? state.create : state.update),
}));
vi.mock("../state/entities", () => ({ waitForProject: state.wait }));
vi.mock("./useHandleNewThread", () => ({ useNewThreadHandler: () => state.open }));
vi.mock("../lib/utils", () => ({
  newProjectId: () => `scratch-${++state.id}`,
  randomUUID: () => "command-id",
}));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  squashAtomCommandFailure: () => new Error("Creation failed"),
}));
import { useNewScratchThread } from "./useNewScratchThread";

beforeEach(() => {
  vi.clearAllMocks();
  state.create.mockResolvedValue({ _tag: "Success" });
  state.update.mockResolvedValue({ _tag: "Success" });
  state.wait.mockResolvedValue({});
  state.open.mockResolvedValue({});
});

it("gives successive scratch chats different child folders on the requested environment", async () => {
  const start = useNewScratchThread();
  const remote = EnvironmentId.make("remote-machine");
  await start(remote);
  await start(remote);
  const requests = state.create.mock.calls.map(([request]) => request);
  expect(new Set(requests.map((request) => request.input.workspaceRoot)).size).toBe(2);
  for (const request of requests) {
    expect(request.environmentId).toBe(remote);
    expect(request.input.workspaceRoot).toMatch(
      /^~\/Documents\/t3code\/projects\/chat-scratch-\d+$/,
    );
    expect(request.input.createWorkspaceRootIfMissing).toBe(true);
  }
  expect(state.open.mock.calls).toHaveLength(2);
  for (const [ref, options] of state.open.mock.calls) {
    expect(ref.environmentId).toBe(remote);
    expect(options).toMatchObject({ envMode: "local", branch: null, worktreePath: null });
  }
});

it("waits for project publication and coalesces repeated clicks while creation is pending", async () => {
  let publish = () => {};
  state.wait.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        publish = resolve;
      }),
  );
  const start = useNewScratchThread();
  const first = start(EnvironmentId.make("local-machine"));
  expect(start(EnvironmentId.make("local-machine"))).toBe(first);
  await Promise.resolve();
  await Promise.resolve();
  expect(state.open).not.toHaveBeenCalled();
  publish();
  await first;
  expect(state.create).toHaveBeenCalledTimes(1);
  expect(state.open).toHaveBeenCalledTimes(1);
});

it("keeps a failed creation from opening a chat and allows a fresh retry", async () => {
  state.create.mockResolvedValueOnce({ _tag: "Failure" });
  const start = useNewScratchThread();
  await expect(start(EnvironmentId.make("local-machine"))).rejects.toThrow("Creation failed");
  expect(state.open).not.toHaveBeenCalled();
  await start(EnvironmentId.make("local-machine"));
  expect(state.open).toHaveBeenCalledTimes(1);
});

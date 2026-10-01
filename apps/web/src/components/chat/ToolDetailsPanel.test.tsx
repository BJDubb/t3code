// @vitest-environment jsdom
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { ToolDetailsPanel } from "./ToolDetailsPanel";
import { selectActiveRightPanelSurface, useRightPanelStore } from "../../rightPanelStore";

vi.mock("@pierre/diffs/react", () => ({ FileDiff: () => null }));
vi.mock("../../lib/syntaxHighlighting", () => ({
  getSyntaxHighlighterPromise: () => Promise.resolve(null),
  PREFERRED_HIGHLIGHTER: "shiki",
}));

it.each([
  {
    path: "src/example.ts",
    workspaceRoot: "/remote/workspace",
    expectedPath: "/remote/workspace/src/example.ts",
    added: false,
  },
  {
    path: "b/my example.ts",
    workspaceRoot: "/remote/workspace",
    expectedPath: "/remote/workspace/b/my example.ts",
    added: false,
  },
  {
    path: "src/new.ts",
    workspaceRoot: "/remote/workspace",
    expectedPath: "/remote/workspace/src/new.ts",
    added: true,
  },
  {
    path: "C:/remote/workspace/src/example.ts",
    workspaceRoot: "C:\\remote\\workspace",
    expectedPath: "C:/remote/workspace/src/example.ts",
    added: false,
  },
])(
  "opens $path in the thread's internal viewer",
  async ({ path, workspaceRoot, expectedPath, added }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const threadRef = {
      environmentId: EnvironmentId.make("remote-environment"),
      threadId: ThreadId.make("edited-file-thread"),
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <ToolDetailsPanel
            title="Edited file"
            text=""
            theme="dark"
            data={{
              changes: [
                {
                  path,
                  diff: added
                    ? `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+new\n`
                    : `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new\n`,
                },
              ],
            }}
            fileActions={{ threadRef, workspaceRoot, onOpenDiff: undefined }}
          />,
        ),
      );
      const link = container.querySelector<HTMLButtonElement>(
        `button[aria-label="Open file for ${path}"]`,
      );
      expect(link, container.innerHTML).not.toBeNull();
      await act(async () => link!.click());
      expect(
        selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, threadRef),
      ).toMatchObject({
        kind: "file",
        relativePath: expectedPath,
      });
      expect(container.textContent).not.toContain("Full output");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);

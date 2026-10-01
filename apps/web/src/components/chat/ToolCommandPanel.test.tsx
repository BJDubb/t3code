// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { ToolCommandPanel } from "./ToolCommandPanel";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";

vi.mock("../../hooks/useCopyToClipboard", () => ({ writeTextToClipboard: vi.fn() }));
vi.mock("../../lib/syntaxHighlighting", () => ({
  getSyntaxHighlighterPromise: () => Promise.reject(new Error("No grammar in this test")),
}));

it("shows the script body while copying and opening the exact full invocation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const source = "@'\nprint('hello')\n'@ | python -";
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ToolCommandPanel command={source} theme="dark" />));
    expect(container.querySelector("pre")?.textContent).toBe("print('hello')");
    const copy = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Copy",
    );
    await act(async () => copy!.click());
    expect(writeTextToClipboard).toHaveBeenCalledWith(source, "tool details");
    const original = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Original invocation",
    );
    await act(async () => original!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(source);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

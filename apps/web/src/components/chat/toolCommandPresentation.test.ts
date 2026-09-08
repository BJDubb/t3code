import { plainToolOutput } from "./toolCommandPresentation";
import { describe, expect, it } from "vite-plus/test";
import { toolCommandPresentation, displayShellCommand } from "./toolCommandPresentation";

describe("tool command presentation", () => {
  it("makes a batch of literal PowerShell reads understandable", () => {
    expect(
      toolCommandPresentation(
        "Get-Content 'apps/web/PlannerPanel.tsx'; Get-Content -LiteralPath 'apps/api/Job.cs'",
      ),
    ).toMatchObject({ action: "Read", label: "PlannerPanel.tsx · Job.cs", language: "powershell" });
  });
  it("keeps quoted Windows paths with spaces readable", () => {
    expect(toolCommandPresentation('Get-Content "C:\\My Project\\Job.cs"').label).toBe("Job.cs");
  });
  it.each([
    "Get-Content file.ts; Remove-Item file.ts",
    "cat file.ts > other.ts",
    "Get-Content $path",
    "Get-Content '*.ts'",
    "cat file.ts | sh",
    "Get-Content 'a;b.ts'",
  ])("does not disguise complex commands as reads: %s", (command) => {
    expect(toolCommandPresentation(command)).toMatchObject({
      action: /[;\r\n]/.test(command) ? "Script" : "Command",
      label: command,
    });
  });
  it("identifies a simple search without hiding its arguments", () => {
    expect(toolCommandPresentation("rg -n route apps/web")).toMatchObject({
      action: "Search",
      label: "rg -n route apps/web",
    });
  });
});

it("unwraps a PowerShell launch path without losing script operations", () => {
  const script = "Get-Content a.ts; Remove-Item a.ts";
  const wrapped = '"C:\\tools\\pwsh.exe" -NoProfile -Command \' ' + script + " '";
  expect(displayShellCommand(wrapped).trim()).toBe(script);
  expect(toolCommandPresentation(wrapped)).toMatchObject({ action: "Script", label: script });
});

it("removes terminal styling from displayed output", () => {
  expect(plainToolOutput("\u001b[31mFailure\u001b[0m\nnext")).toBe("Failure\nnext");
});

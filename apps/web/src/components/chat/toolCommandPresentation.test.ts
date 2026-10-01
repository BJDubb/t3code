import {
  commandNames,
  commandScriptBody,
  plainToolOutput,
  shellDisplayTokens,
} from "./toolCommandPresentation";
import { describe, expect, it } from "vite-plus/test";
import { toolCommandPresentation, displayShellCommand } from "./toolCommandPresentation";
import { toolTextPreview } from "./toolCommandPresentation";

describe("tool command presentation", () => {
  it("decodes a complete provider argument assembled from alternating quote fragments", () => {
    const command = `pwsh -Command '$r='"'C:/reports'; "'$rows=Get-Content "$r/results.json"; $rows|Where-Object Status -eq '"'Exception'|Select-Object Name"`;
    const script = `$r='C:/reports'; $rows=Get-Content "$r/results.json"; $rows|Where-Object Status -eq 'Exception'|Select-Object Name`;
    expect(displayShellCommand(command)).toBe(script);
    expect(commandScriptBody(command)).toMatchObject({ text: script, language: "powershell" });
    expect(toolCommandPresentation(command).label).toBe("Run PowerShell script");
    expect(commandNames(command)).toEqual([]);
  });
  it("does not mistake quoted PowerShell source for an executable", () => {
    const source =
      '\'$r="C:/reports"; $rows=Get-Content "$r/results.json"; $rows | Select-Object Name\'';
    expect(commandNames(source)).toEqual([]);
    expect(toolCommandPresentation(source)).toMatchObject({
      action: "Script",
      label: "PowerShell script text",
    });
    expect(commandScriptBody(source)).toMatchObject({
      language: "powershell",
      text: source.slice(1, -1),
    });
    expect(toolCommandPresentation('$r="C:/reports"; Get-Content "$r/results.json"').label).toBe(
      "Run PowerShell script",
    );
    expect(commandNames('"C:/Program Files/tools/python.exe" --version')).toEqual(["python.exe"]);
  });
  it.each([
    ["@'\nprint('hello')\n'@ | python -", "python", "print('hello')", "Run Python script"],
    ['@"\nconsole.log(1)\n"@ | node -', "javascript", "console.log(1)", "Run Node script"],
    ["python3 - <<'PY'\nprint('hello')\nPY", "python", "print('hello')", "Run Python script"],
    ["bash <<EOF\nprintf hello\nEOF", "shellscript", "printf hello", "Run Shell script"],
    [
      "@('Get-Content ''file.ts''', 'Get-Date') | powershell -Command -",
      "powershell",
      "Get-Content 'file.ts'\nGet-Date",
      "Run PowerShell script",
    ],
  ])(
    "presents complete script containers in their own language: %s",
    (source, language, text, label) => {
      expect(commandScriptBody(source)).toMatchObject({ language, text });
      expect(toolCommandPresentation(source)).toMatchObject({ action: "Script", label });
      expect(commandNames(source)).toEqual([]);
      expect(displayShellCommand(source)).toBe(source);
    },
  );
  it.each([
    "@'\nprint(1)\n'@ | python -; git status",
    "python - <<PY\nprint(1)\nWRONG",
    "'print(1)' | python script.py",
    "'not source'",
    "echo 'print(1)' | python -",
    "'print(''hello'')' | python -",
    "bash <<EOF\necho one\nEOF\necho two\nEOF",
    "@'\necho one\n'@\necho two\n'@ | sh",
  ])(
    "preserves ambiguous or compound invocations instead of extracting a partial script: %s",
    (source) => {
      expect(commandScriptBody(source)).toBeNull();
      expect(displayShellCommand(source)).toBe(source);
    },
  );
  it("uses nearby intent for generic titles and concise fallback descriptions", () => {
    expect(
      toolCommandPresentation(
        "node --version",
        "Ran command",
        "Checking the installed Node version.",
      ).label,
    ).toBe("Checking the installed Node version");
    expect(toolCommandPresentation("node --version", "Ran command").label).toBe(
      "Check node version",
    );
    expect(toolCommandPresentation("git status --short").label).toBe("Inspect working tree");
  });
  it("colors shell command positions without splitting quoted code", () => {
    const source = 'node -e "console.log(1); process.exit(0)"; git status --short';
    const tokens = shellDisplayTokens(source);
    expect(tokens.map((token) => token.text).join("")).toBe(source);
    expect(tokens.filter((token) => token.kind === "command").map((token) => token.text)).toEqual([
      "node",
      "git",
    ]);
    expect(tokens.find((token) => token.text === "--short")?.kind).toBe("parameter");
  });
  it("unescapes quotes in a display wrapper without changing the saved invocation", () => {
    expect(displayShellCommand('powershell -Command "node -e \\"console.log(1)\\""')).toBe(
      'node -e "console.log(1)"',
    );
  });
  it("summarizes compound commands without treating quoted text as commands", () => {
    expect(
      commandNames(
        'powershell -NoProfile -Command "node --version; git status --short; Get-Content printer.ts"',
      ),
    ).toEqual(["node", "git", "Get-Content"]);
    expect(commandNames("echo 'hello; fake-command' | cat; cat file")).toEqual(["echo", "cat"]);
  });
  it("uses a supplied intent while keeping generic provider titles out of the heading", () => {
    expect(toolCommandPresentation("vp test run", "Verify the command cards").label).toBe(
      "Verify the command cards",
    );
    expect(toolCommandPresentation("vp test run", "Ran command").label).toBe("Run vp");
    expect(toolCommandPresentation("vp test run", "Bash").label).toBe("Run vp");
  });
  it("bounds multiline and minified previews without changing the source", () => {
    expect(toolTextPreview("a\nb\nc", 2)).toEqual({ text: "a\nb", truncated: true });
    expect(toolTextPreview("123456", 12, 4)).toEqual({ text: "1234", truncated: true });
    expect(toolTextPreview("a\nb", 2)).toEqual({ text: "a\nb", truncated: false });
  });
  it("makes a batch of literal PowerShell reads understandable", () => {
    expect(
      toolCommandPresentation(
        "Get-Content 'apps/web/PlannerPanel.tsx'; Get-Content -LiteralPath 'apps/api/Job.cs'",
      ),
    ).toMatchObject({
      action: "Read",
      label: "Read PlannerPanel.tsx · Job.cs",
      language: "powershell",
    });
  });
  it("keeps quoted Windows paths with spaces readable", () => {
    expect(toolCommandPresentation('Get-Content "C:\\My Project\\Job.cs"').label).toBe(
      "Read Job.cs",
    );
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
      label: expect.not.stringContaining("Remove-Item"),
    });
  });
  it("identifies a simple search without hiding its arguments", () => {
    expect(toolCommandPresentation("rg -n route apps/web")).toMatchObject({
      action: "Search",
      label: "Search workspace",
    });
  });
});

it("unwraps a PowerShell launch path without losing script operations", () => {
  const script = "Get-Content a.ts; Remove-Item a.ts";
  const wrapped = '"C:\\tools\\pwsh.exe" -NoProfile -Command \' ' + script + " '";
  expect(displayShellCommand(wrapped).trim()).toBe(script);
  expect(toolCommandPresentation(wrapped)).toMatchObject({
    action: "Script",
    label: "Run shell commands",
  });
});

it("removes terminal styling from displayed output", () => {
  expect(plainToolOutput("\u001b[31mFailure\u001b[0m\nnext")).toBe("Failure\nnext");
});

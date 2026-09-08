/** Display-only unwrapping. Never used to execute or alter the saved invocation. */
export function displayShellCommand(command: string): string {
  const match =
    /^(?:"[^"\r\n]*[\\/](?:pwsh|powershell)\.exe"|(?:pwsh|powershell)(?:\.exe)?)\s+(?:(?:-NoProfile|-NonInteractive|-NoLogo)\s+)*-Command\s+([\s\S]+)$/i.exec(
      command.trim(),
    );
  if (!match) return command;
  const body = match[1]!.trim();
  const quote = body[0];
  return (quote === "'" || quote === '"') && body.endsWith(quote) ? body.slice(1, -1) : body;
}

export function toolCommandPresentation(original: string) {
  const command = displayShellCommand(original);
  // Recognize only literal file reads. Compound scripts and dynamic paths stay
  // visible as commands so a read label cannot conceal another operation.
  if (/^(?:rg|grep)\s/.test(command) && !/[;\r\n&|<>`$]/.test(command)) {
    return { action: "Search", label: command.trim(), language: shellLanguage(command) };
  }
  const segments = command
    .trim()
    .split(/;\s*|\r?\n/)
    .filter(Boolean);
  const paths: string[] = [];
  for (const segment of segments) {
    const match =
      /^(?:Get-Content|cat)\s+(?:-LiteralPath\s+|-Path\s+)?(?:'([^']+)'|"([^"$`]+)"|([^\s;|&<>$`]+))\s*$/i.exec(
        segment,
      );
    const path = match?.[1] ?? match?.[2] ?? match?.[3];
    if (!path || /[$`*?]/.test(path)) {
      const script = /[;\r\n]|^\s*@['"]/.test(command);
      return {
        action: script ? "Script" : "Command",
        label: command.trim(),
        language: shellLanguage(original),
      };
    }
    paths.push(path.replace(/\\/g, "/").split("/").at(-1)!);
  }
  return paths.length
    ? {
        action: "Read",
        label: `${paths.slice(0, 3).join(" · ")}${paths.length > 3 ? ` +${paths.length - 3} more` : ""}`,
        language: shellLanguage(command),
      }
    : { action: "Command", label: command, language: shellLanguage(command) };
}

export function shellLanguage(command: string): string {
  return /\b(?:pwsh|powershell|Get-Content|Get-ChildItem|Select-Object|Set-Location)\b/i.test(
    command,
  )
    ? "powershell"
    : "shellscript";
}

/** Remove terminal styling for plain-text previews; saved and copied output stays intact. */
export function plainToolOutput(output: string): string {
  // eslint-disable-next-line no-control-regex -- SGR escape sequences are terminal formatting.
  return output.replace(/\u001b\[[0-9;:]*m/g, "");
}

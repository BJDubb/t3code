/** Display-only unwrapping. Never used to execute or alter the saved invocation. */
export function displayShellCommand(command: string): string {
  const match =
    /^(?:"[^"\r\n]*[\\/](?:pwsh|powershell)\.exe"|(?:pwsh|powershell)(?:\.exe)?)\s+(?:(?:-NoProfile|-NonInteractive|-NoLogo)\s+)*-Command\s+([\s\S]+)$/i.exec(
      command.trim(),
    );
  if (!match) return command;
  const body = match[1]!.trim();
  const quote = body[0];
  if ((quote === "'" || quote === '"') && body.endsWith(quote)) {
    const inner = body.slice(1, -1);
    return quote === '"' ? inner.replace(/\\"/g, '"') : inner;
  }
  return body;
}

export function toolCommandPresentation(original: string, title?: string, description?: string) {
  const command = displayShellCommand(original);
  const intent = title?.trim();
  if (
    intent &&
    !/^(?:(?:ran|run|running|execute|executed)\s+)?(?:commands?|scripts?|shell|bash|powershell|terminal)$/i.test(
      intent,
    ) &&
    intent !== original.trim() &&
    intent !== command.trim()
  ) {
    return { action: "Command", label: intent, language: shellLanguage(original) };
  }
  if (description?.trim())
    return {
      action: "Command",
      label: description.replace(/`([^`]+)`/g, "$1").replace(/\.$/, ""),
      language: shellLanguage(original),
    };
  // Recognize only literal file reads. Compound scripts and dynamic paths stay
  // visible as commands so a read label cannot conceal another operation.
  if (/^(?:rg|grep)\s/.test(command) && !/[;\r\n&|<>`$]/.test(command)) {
    return { action: "Search", label: "Search workspace", language: shellLanguage(command) };
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
        label: shellCommandDescription(command),
        language: shellLanguage(original),
      };
    }
    paths.push(path.replace(/\\/g, "/").split("/").at(-1)!);
  }
  return paths.length
    ? {
        action: "Read",
        label: `Read ${paths.slice(0, 3).join(" · ")}${paths.length > 3 ? ` +${paths.length - 3} more` : ""}`,
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

/** A conservative display summary; quoted separators are not command boundaries. */
export function commandNames(original: string): string[] {
  const command = displayShellCommand(original);
  const segments: string[] = [];
  let quote = "";
  let start = 0;
  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;
    if (char === "`" || (char === "\\" && quote !== "'")) {
      i++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/[;|&\n]/.test(char)) {
      segments.push(command.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(command.slice(start));
  const names = segments.flatMap((segment) => {
    const match = /^\s*(?:[A-Za-z_][\w]*=\S+\s+)*(?:"([^"\n]+)"|'([^'\n]+)'|([\w./\\-]+))/.exec(
      segment,
    );
    const name = (match?.[1] ?? match?.[2] ?? match?.[3])?.split(/[\\/]/).at(-1);
    return name && !/^(?:if|then|else|fi|for|do|done)$/.test(name) ? [name] : [];
  });
  return [...new Set(names)].slice(0, 6);
}

/** Remove terminal styling for plain-text previews; saved and copied output stays intact. */
export function plainToolOutput(output: string): string {
  // eslint-disable-next-line no-control-regex -- SGR escape sequences are terminal formatting.
  return output.replace(/\u001b\[[0-9;:]*m/g, "");
}

/** Bound both line count and bytes so a minified line cannot flood the timeline. */
export function toolTextPreview(text: string, maxLines = 12, maxChars = 2400) {
  const prefix = text.slice(0, maxChars);
  const lines = prefix.split("\n");
  const visible = lines.slice(0, maxLines).join("\n");
  return { text: visible, truncated: visible.length < text.length };
}

/** Lightweight shell display tokens. Strings stay intact, including embedded separators. */
export function shellDisplayTokens(source: string) {
  const parts =
    source.match(
      /#[^\n]*|"(?:`.|\\.|[^"`\\])*"|'(?:''|[^'])*'|\$[\w:]+|--?[\w-]+|[;|&]+|\r?\n|[^\s;|&"'#$]+|[ \t]+|./g,
    ) ?? [];
  let command = true;
  let offset = 0;
  return parts.map((text) => {
    const start = offset;
    offset += text.length;
    let kind:
      | "plain"
      | "command"
      | "operator"
      | "comment"
      | "string"
      | "variable"
      | "parameter"
      | "number" = "plain";
    if (/^[;|&\r\n]/.test(text)) {
      kind = "operator";
      command = true;
    } else if (/^\s+$/.test(text)) {
      /* Preserve spacing. */
    } else if (text.startsWith("#")) kind = "comment";
    else if (/^["']/.test(text)) {
      kind = "string";
      command = false;
    } else if (text.startsWith("$")) {
      kind = "variable";
      command = false;
    } else if (text.startsWith("-")) kind = "parameter";
    else if (command) {
      kind = "command";
      command = false;
    } else if (/^\d+(?:\.\d+)?$/.test(text)) kind = "number";
    return { text, kind, start };
  });
}

function shellCommandDescription(command: string): string {
  const trimmed = command.trim();
  if (/^git status(?:\s|$)/i.test(trimmed) && !/[;|&\n]/.test(trimmed))
    return "Inspect working tree";
  if (/^git diff(?:\s|$)/i.test(trimmed) && !/[;|&\n]/.test(trimmed)) return "Review file changes";
  if (/^(node|bun|npm|pnpm|python|git) (?:--version|-v)$/i.test(trimmed))
    return `Check ${trimmed.split(" ")[0]} version`;
  const names = commandNames(command);
  if (names.length > 1) return "Run shell commands";
  if (names[0] === "node" && /\s-e\s/.test(trimmed)) return "Run Node script";
  if (/^(Get-ChildItem|ls|dir)\b/i.test(trimmed)) return "List workspace files";
  if (names.length === 1) return `Run ${names[0]}`;
  return "Run shell script";
}

/** Display-only unwrapping. Never used to execute or alter the saved invocation. */
export function displayShellCommand(command: string): string {
  const match =
    /^(?:"[^"\r\n]*[\\/](?:pwsh|powershell)\.exe"|(?:pwsh|powershell)(?:\.exe)?)\s+(?:(?:-NoProfile|-NonInteractive|-NoLogo)\s+)*-Command\s+([\s\S]+)$/i.exec(
      command.trim(),
    );
  if (!match) return command;
  const body = match[1]!.trim();
  // Some provider launchers encode one script argument using adjacent quoted
  // fragments, e.g. '$r='"'reports'; "'Get-Content $r'. Decode only a complete,
  // balanced argument; a partial parse must never hide another command.
  const fragments = displayQuotedArgument(body);
  if (fragments !== null) return fragments;
  const quote = body[0];
  if ((quote === "'" || quote === '"') && body.endsWith(quote)) {
    const inner = body.slice(1, -1);
    return quote === '"' ? inner.replace(/\\"/g, '"') : inner;
  }
  return body;
}

function displayQuotedArgument(source: string): string | null {
  if (!/^["']/.test(source)) return null;
  let quote = "";
  const quoteKinds = new Set<string>();
  let text = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quote) {
      if (char === quote) quote = "";
      else if (char === "\\" && quote === '"' && /["\\$`]/.test(source[i + 1] ?? ""))
        text += source[++i];
      else text += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      quoteKinds.add(char);
    } else if (/[\s;$`|&<>]/.test(char)) return null;
    else text += char;
  }
  return quote || quoteKinds.size < 2 ? null : text;
}

function interpreterPresentation(invocation: string) {
  const match =
    /^(python(?:3(?:\.\d+)?)?|py|node|bash|sh|pwsh|powershell)(?:\.exe)?(?:\s+(-|(?:-Command\s+|-c\s+)-))?\s*$/i.exec(
      invocation.trim(),
    );
  if (!match) return null;
  const interpreter = match[1]!.toLowerCase();
  if (!match[2] && !/^(bash|sh|pwsh|powershell)$/.test(interpreter)) return null;
  if (/^(python|py)/.test(interpreter)) return { language: "python", label: "Python script" };
  if (interpreter === "node") return { language: "javascript", label: "Node script" };
  if (interpreter === "pwsh" || interpreter === "powershell")
    return { language: "powershell", label: "PowerShell script" };
  return { language: "shellscript", label: "Shell script" };
}

/** Recognize complete literal script containers for display, never execution.
 * Keep the full invocation available: interpolation and shell options still matter.
 */
export function commandScriptBody(original: string) {
  const command = displayShellCommand(original).trim();
  if (/^\$[\w:]+\s*=/.test(command))
    return { language: "powershell", label: "PowerShell script", text: command };
  const hereString = /^@(['"])\r?\n([\s\S]*?)\r?\n\1@\s*\|\s*([^\r\n]+)$/.exec(command);
  if (hereString) {
    const interpreter = interpreterPresentation(hereString[3]!);
    if (interpreter && !new RegExp(`(?:^|\\n)${hereString[1]}@`).test(hereString[2]!))
      return { ...interpreter, text: hereString[2]! };
  }
  const heredoc = /^([^\r\n]+?)\s*<<\s*(['"]?)([A-Za-z_][\w]*)\2\s*\r?\n([\s\S]*?)\r?\n\3$/.exec(
    command,
  );
  if (heredoc) {
    const interpreter = interpreterPresentation(heredoc[1]!);
    if (interpreter && !heredoc[4]!.split(/\r?\n/).includes(heredoc[3]!))
      return { ...interpreter, text: heredoc[4]! };
  }
  // A PowerShell array of literal lines is often piped into a shell's stdin.
  const arrayPipe =
    /^@\(\s*('(?:''|[^'])*'(?:\s*,\s*'(?:''|[^'])*')*)\s*\)\s*\|\s*([^\r\n]+)$/.exec(command);
  if (arrayPipe) {
    const interpreter = interpreterPresentation(arrayPipe[2]!);
    if (interpreter)
      return {
        ...interpreter,
        text: [...arrayPipe[1]!.matchAll(/'((?:''|[^'])*)'/g)]
          .map((line) => line[1]!.replace(/''/g, "'"))
          .join("\n"),
      };
  }
  // Avoid guessing at escape rules across different host shells.
  const literalPipe = /^'([^']*)'\s*\|\s*([^\r\n]+)$/.exec(command);
  if (literalPipe) {
    const interpreter = interpreterPresentation(literalPipe[2]!);
    if (interpreter) return { ...interpreter, text: literalPipe[1]! };
  }
  // Providers sometimes send a quoted PowerShell script as the display command.
  // Label it as script text rather than assuming that the shell executed it.
  const quotedScript = /^(['"])(\$[\w:]+\s*=[\s\S]+)\1$/.exec(command);
  if (quotedScript)
    return { language: "powershell", label: "PowerShell script text", text: quotedScript[2]! };
  return null;
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
  const body = commandScriptBody(original);
  if (body)
    return {
      action: "Script",
      label: body.label === "PowerShell script text" ? body.label : `Run ${body.label}`,
      language: body.language,
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
  return /\b(?:pwsh|powershell|Get-Content|Get-ChildItem|Select-Object|Set-Location)\b|^\s*(?:@['"]|\$[\w:]+\s*=)/i.test(
    command,
  )
    ? "powershell"
    : "shellscript";
}

/** A conservative display summary; quoted separators are not command boundaries. */
export function commandNames(original: string): string[] {
  if (commandScriptBody(original)) return [];
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
    const candidate = match?.[1] ?? match?.[2] ?? match?.[3];
    // A quoted string is only an executable name if it looks like a name or
    // path. Script source and assignments must never become "Run $r=".
    if (
      !candidate ||
      /[$;|&=\r\n]/.test(candidate) ||
      (/\s/.test(candidate) && !/[\\/]/.test(candidate))
    )
      return [];
    const name = candidate.split(/[\\/]/).at(-1);
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
  if (/^\$[\w:]+\s*=/.test(trimmed)) return "Run PowerShell script";
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

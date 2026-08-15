const SHELL_TYPE_RE =
  /(^|[.])executeCommand(Tool)?$|(^|[.])ssh$|(^|[.])sshTool$/i;

const SHELL_NAME_HINTS = ["execute command", "shell", "ssh"];

export function isShellNodeType(typeName: string, displayName = "", description = ""): boolean {
  if (SHELL_TYPE_RE.test(typeName)) return true;
  const hay = `${displayName} ${description}`.toLowerCase();
  if (typeName.toLowerCase().includes("executecommand")) return true;
  return SHELL_NAME_HINTS.some((h) => hay.includes(h) && typeName.toLowerCase().includes("command"));
}

export function rankTierFor(typeName: string, category: string, isShell: boolean):
  | "domain"
  | "core"
  | "ai"
  | "shell-fallback" {
  if (isShell) return "shell-fallback";
  const t = typeName.toLowerCase();
  // Integration / product nodes first (even if categorized under Actions)
  if (
    t.includes("github") ||
    /(^|[.])git$/.test(t) ||
    t.includes("gitlab") ||
    t.includes("httprequest") ||
    t.includes("email") ||
    t.includes("slack") ||
    t.includes("gmail")
  ) {
    return "domain";
  }
  const c = (category || "").toLowerCase();
  if (c.includes("ai")) return "ai";
  if (
    c === "actions" ||
    c === "flow" ||
    c === "transform" ||
    c === "helpers" ||
    c === "core" ||
    c === "triggers" ||
    c === "utility" ||
    c === "development"
  ) {
    return "core";
  }
  return "domain";
}

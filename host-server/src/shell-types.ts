export type ShellKind = "cmd" | "powershell";

export function isShellKind(value: unknown): value is ShellKind {
  return value === "cmd" || value === "powershell";
}

export function defaultShellKind(): ShellKind {
  if (process.platform !== "win32") {
    return "cmd";
  }
  const env = (process.env.TITUS_SHELL ?? process.env.PAPAT_SHELL ?? "cmd").toLowerCase();
  return env === "powershell" || env === "pwsh" ? "powershell" : "cmd";
}

export function availableShells(): ShellKind[] {
  return process.platform === "win32" ? ["cmd", "powershell"] : ["cmd"];
}

export function resolveShellSpawn(kind: ShellKind, command: string): {
  executable: string;
  args: string[];
} {
  if (process.platform === "win32") {
    if (kind === "powershell") {
      return {
        executable: "powershell.exe",
        args: ["-NoProfile", "-NonInteractive", "-Command", command],
      };
    }
    return {
      executable: "cmd.exe",
      args: ["/c", command],
    };
  }

  return {
    executable: "/bin/sh",
    args: ["-c", command],
  };
}

export function shellLabel(kind: ShellKind): string {
  if (process.platform !== "win32") {
    return "sh";
  }
  return kind === "powershell" ? "PowerShell" : "CMD";
}

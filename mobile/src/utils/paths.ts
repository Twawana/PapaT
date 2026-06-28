/** Path helpers for workspace-relative and absolute PC paths on mobile. */

export function isAbsolutePcPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return /^[A-Za-z]:\//.test(normalized);
}

export function joinPath(dir: string, name: string): string {
  if (isAbsolutePcPath(dir)) {
    const base = dir.replace(/\\/g, "/").replace(/\/+$/, "");
    return `${base}/${name}`.replace(/\/+/g, "/");
  }
  if (dir === "." || dir === "") return name;
  return `${dir}/${name}`.replace(/\/+/g, "/");
}

export function parentPath(current: string): string {
  if (isAbsolutePcPath(current)) {
    const normalized = current.replace(/\\/g, "/").replace(/\/+$/, "");
    const parts = normalized.split("/");
    if (parts.length <= 1) return parts[0] + "/";
    parts.pop();
    if (parts.length === 1) return parts[0] + "/";
    return parts.join("/");
  }

  if (current === "." || current === "") return ".";
  const parts = current.split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "." : parts.join("/");
}

export function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  return parentPath(path);
}

export function pathLabel(current: string): string {
  if (current === ".") return "workspace";
  if (isAbsolutePcPath(current)) {
    const parts = current.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.slice(-2).join("/") || current;
  }
  return current;
}

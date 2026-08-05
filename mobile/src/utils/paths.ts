/** Path helpers for workspace-relative and absolute PC paths on mobile. */

/** Normalize separators so Windows `C:\...` and `C:/...` compare equal. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function pathsEqual(a: string, b: string): boolean {
  const left = normalizePath(a).replace(/\/+$/, "") || ".";
  const right = normalizePath(b).replace(/\/+$/, "") || ".";
  return left.toLowerCase() === right.toLowerCase();
}

export function isAbsolutePcPath(path: string): boolean {
  const normalized = normalizePath(path);
  // Accept `C:/...`, `C:\...`, and bare drive roots like `C:` / `C:/`
  return /^[A-Za-z]:(\/|$)/.test(normalized);
}

export function joinPath(dir: string, name: string): string {
  if (isAbsolutePcPath(dir)) {
    const base = normalizePath(dir).replace(/\/+$/, "");
    return `${base}/${name}`.replace(/\/+/g, "/");
  }
  if (dir === "." || dir === "") return name;
  return `${normalizePath(dir)}/${name}`.replace(/\/+/g, "/");
}

export function parentPath(current: string): string {
  if (isAbsolutePcPath(current)) {
    const normalized = normalizePath(current).replace(/\/+$/, "");
    const parts = normalized.split("/").filter(Boolean);
    // Already at drive root (`C:` / `C:/`)
    if (parts.length <= 1) {
      return `${parts[0] || normalized}/`;
    }
    parts.pop();
    if (parts.length === 1) return `${parts[0]}/`;
    return parts.join("/");
  }

  if (current === "." || current === "") return ".";
  const parts = normalizePath(current).split("/").filter(Boolean);
  parts.pop();
  return parts.length === 0 ? "." : parts.join("/");
}

/** True when navigating to the parent would stay on the same folder. */
export function isPathRoot(current: string): boolean {
  if (!current || current === ".") return true;
  return pathsEqual(parentPath(current), current);
}

export function basename(path: string): string {
  const normalized = normalizePath(path).replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  return parentPath(path);
}

export function pathLabel(current: string): string {
  if (current === ".") return "workspace";
  if (isAbsolutePcPath(current)) {
    const parts = normalizePath(current).split("/").filter(Boolean);
    return parts.slice(-2).join("/") || current;
  }
  return current;
}

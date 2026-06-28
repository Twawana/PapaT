import * as fs from "fs";
import * as path from "path";
import { getWorkspaceRoot } from "./workspace-state";

export interface PackageScript {
  name: string;
  command: string;
}

export function listPackageScripts(): PackageScript[] {
  const pkgPath = path.join(getWorkspaceRoot(), "package.json");
  if (!fs.existsSync(pkgPath)) {
    return [];
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    return Object.entries(scripts).map(([name, command]) => ({ name, command }));
  } catch {
    return [];
  }
}

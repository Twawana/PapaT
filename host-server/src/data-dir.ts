import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const TITUS_DIR = path.join(os.homedir(), ".titus");
const LEGACY_DIR = path.join(os.homedir(), ".papat");

export function getDataDir(): string {
  if (fs.existsSync(TITUS_DIR)) return TITUS_DIR;
  if (fs.existsSync(LEGACY_DIR)) return LEGACY_DIR;
  return TITUS_DIR;
}

export function ensureDataDir(): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
}

function envString(primary: string, legacy: string, fallback: string): string {
  return process.env[primary] ?? process.env[legacy] ?? fallback;
}

function envNumber(primary: string, legacy: string, fallback: number): number {
  const raw = process.env[primary] ?? process.env[legacy];
  return raw ? Number(raw) : fallback;
}

function envBool(primary: string, legacy: string, defaultEnabled: boolean): boolean {
  const raw = process.env[primary] ?? process.env[legacy];
  if (raw === undefined) return defaultEnabled;
  return raw !== "false";
}

export const config = {
  port: envNumber("TITUS_PORT", "PAPAT_PORT", 3847),
  host: envString("TITUS_HOST", "PAPAT_HOST", "0.0.0.0"),
  executionTimeoutMs: envNumber("TITUS_EXEC_TIMEOUT", "PAPAT_EXEC_TIMEOUT", 30_000),
  workspaceDir: envString("TITUS_WORKSPACE", "PAPAT_WORKSPACE", "./workspace"),
  maxFileBytes: envNumber("TITUS_MAX_FILE_SIZE", "PAPAT_MAX_FILE_SIZE", 512_000),
  commandTimeoutMs: envNumber("TITUS_COMMAND_TIMEOUT", "PAPAT_COMMAND_TIMEOUT", 60_000),
  maxCommandOutputBytes: envNumber(
    "TITUS_MAX_COMMAND_OUTPUT",
    "PAPAT_MAX_COMMAND_OUTPUT",
    64_000
  ),
  llmProvider: envString("TITUS_LLM_PROVIDER", "PAPAT_LLM_PROVIDER", "cursor"),
  llmModel: envString("TITUS_LLM_MODEL", "PAPAT_LLM_MODEL", "gpt-4o-mini"),
  llmApiKey:
    process.env.OPENAI_API_KEY ??
    process.env.TITUS_LLM_API_KEY ??
    process.env.PAPAT_LLM_API_KEY ??
    "",
  cursorApiKey: process.env.CURSOR_API_KEY || "",
  cursorModel: envString("TITUS_CURSOR_MODEL", "PAPAT_CURSOR_MODEL", "auto"),
  agentMaxTurns: envNumber("TITUS_AGENT_MAX_TURNS", "PAPAT_AGENT_MAX_TURNS", 15),
  /** Max time for a single Cursor agent run (npm start, etc. can be slow). */
  agentTimeoutMs: envNumber("TITUS_AGENT_TIMEOUT", "PAPAT_AGENT_TIMEOUT", 600_000),
  requireAuth: envBool("TITUS_REQUIRE_AUTH", "PAPAT_REQUIRE_AUTH", true),
  pairingTtlMs: envNumber("TITUS_PAIRING_TTL_MS", "PAPAT_PAIRING_TTL_MS", 120_000),
};

export const config = {
  port: Number(process.env.PAPAT_PORT) || 3847,
  host: process.env.PAPAT_HOST || "0.0.0.0",
  executionTimeoutMs: Number(process.env.PAPAT_EXEC_TIMEOUT) || 30_000,
  workspaceDir: process.env.PAPAT_WORKSPACE || "./workspace",
  maxFileBytes: Number(process.env.PAPAT_MAX_FILE_SIZE) || 512_000,
  commandTimeoutMs: Number(process.env.PAPAT_COMMAND_TIMEOUT) || 60_000,
  maxCommandOutputBytes: Number(process.env.PAPAT_MAX_COMMAND_OUTPUT) || 64_000,
  llmProvider: process.env.PAPAT_LLM_PROVIDER || "cursor",
  llmModel: process.env.PAPAT_LLM_MODEL || "gpt-4o-mini",
  llmApiKey: process.env.OPENAI_API_KEY || process.env.PAPAT_LLM_API_KEY || "",
  cursorApiKey: process.env.CURSOR_API_KEY || "",
  cursorModel: process.env.PAPAT_CURSOR_MODEL || "auto",
  agentMaxTurns: Number(process.env.PAPAT_AGENT_MAX_TURNS) || 15,
  /** Max time for a single Cursor agent run (npm start, etc. can be slow). */
  agentTimeoutMs: Number(process.env.PAPAT_AGENT_TIMEOUT) || 600_000,
  requireAuth: process.env.PAPAT_REQUIRE_AUTH !== "false",
  pairingTtlMs: Number(process.env.PAPAT_PAIRING_TTL_MS) || 120_000,
};

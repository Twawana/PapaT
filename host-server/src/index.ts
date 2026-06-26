import { createServer } from "./server";
import { config } from "./config";
import { checkCursorAuth, isAgentInstalled } from "./agent/cursor-cli";

const wss = createServer();

function shutdown(): void {
  console.log("\n[PapaT Host] Shutting down...");
  wss.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (err) => {
  console.error("[PapaT Host] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[PapaT Host] Unhandled rejection:", reason);
});

console.log(`[PapaT Host] PapaT v0.5.0 — port ${config.port}`);
console.log(`[PapaT Host] Agent provider: ${config.llmProvider}`);

if (config.llmProvider === "cursor") {
  if (!isAgentInstalled()) {
    console.log(
      "[PapaT Host] Cursor CLI: not installed (Agent tab only). VS Code + phone still work."
    );
  } else {
    void checkCursorAuth().then((auth) => {
      if (auth.ok) {
        console.log(`[PapaT Host] Cursor CLI: ${auth.message.split("\n")[0]}`);
      } else {
        console.warn(`[PapaT Host] Cursor CLI: ${auth.message}`);
      }
    });
  }
} else if (!config.llmApiKey) {
  console.warn("[PapaT Host] OPENAI_API_KEY is not set — agent will fail until configured");
}

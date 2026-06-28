/**
 * CLI test client for PapaT host server.
 * Set PAPAT_REQUIRE_AUTH=false to skip auth, or pair via mobile first and use PAPAT_TEST_TOKEN.
 */
const WebSocket = require("ws");

const HOST = process.env.PAPAT_TEST_HOST || "localhost";
const PORT = Number(process.env.PAPAT_TEST_PORT) || 3847;
const TOKEN = process.env.PAPAT_TEST_TOKEN || "";

const code = `
console.log("PapaT CLI test");
console.log("Node version:", process.version);
console.log("1 + 1 =", 1 + 1);
`;

const ws = new WebSocket(`ws://${HOST}:${PORT}`);
const execId = `test-${Date.now()}`;
let authed = false;

ws.on("open", () => {
  console.log(`Connected to ws://${HOST}:${PORT}`);
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  switch (msg.type) {
    case "auth_required":
      if (TOKEN) {
        ws.send(JSON.stringify({ type: "auth", token: TOKEN }));
      } else {
        console.error("Auth required. Set PAPAT_TEST_TOKEN or PAPAT_REQUIRE_AUTH=false on host.");
        ws.close();
        process.exit(1);
      }
      break;
    case "auth_ok":
    case "connected":
      if (!authed) {
        authed = true;
        console.log(`Server: ${msg.hostname} v${msg.version}`);
        ws.send(
          JSON.stringify({
            type: "execute",
            id: execId,
            code,
            language: "javascript",
          })
        );
      }
      break;
    case "output":
      if (msg.id === execId) process.stdout.write(msg.data);
      break;
    case "done":
      if (msg.id === execId) {
        console.log(`\n--- Done (exit ${msg.exitCode}) ---`);
        ws.close();
        process.exit(0);
      }
      break;
    case "error":
      console.error("Error:", msg.message);
      ws.close();
      break;
    case "auth_error":
      console.error("Auth error:", msg.message);
      ws.close();
      process.exit(1);
      break;
  }
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error("Test timed out");
  ws.close();
  process.exit(1);
}, 10000);

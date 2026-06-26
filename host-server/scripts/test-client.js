/**
 * CLI test client for PapaT host server.
 * Run while host-server is running: node scripts/test-client.js
 */
const WebSocket = require("ws");

const HOST = process.env.PAPAT_TEST_HOST || "localhost";
const PORT = Number(process.env.PAPAT_TEST_PORT) || 3847;

const code = `
console.log("PapaT CLI test");
console.log("Node version:", process.version);
console.log("1 + 1 =", 1 + 1);
`;

const ws = new WebSocket(`ws://${HOST}:${PORT}`);
const execId = `test-${Date.now()}`;

ws.on("open", () => {
  console.log(`Connected to ws://${HOST}:${PORT}`);
  ws.send(
    JSON.stringify({
      type: "execute",
      id: execId,
      code,
      language: "javascript",
    })
  );
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  switch (msg.type) {
    case "connected":
      console.log(`Server: ${msg.hostname} v${msg.version}`);
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

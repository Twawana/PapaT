/**
 * CLI test client for Titus host server.
 * Run while host-server is running: npx tsx scripts/test-client.ts
 */
import WebSocket from "ws";

const HOST = process.env.TITUS_TEST_HOST || process.env.PAPAT_TEST_HOST || "localhost";
const PORT = Number(process.env.TITUS_TEST_PORT || process.env.PAPAT_TEST_PORT) || 3847;

const ws = new WebSocket(`ws://${HOST}:${PORT}`);
const execId = `test-${Date.now()}`;
const listId = `list-${Date.now()}`;
const writeId = `write-${Date.now()}`;
const readId = `read-${Date.now()}`;
const deleteId = `delete-${Date.now()}`;

let phase: "execute" | "list" | "write" | "read" | "delete" | "done" = "execute";

const code = `
console.log("Titus CLI test");
console.log("Node version:", process.version);
console.log("1 + 1 =", 1 + 1);
`;

function send(msg: object): void {
  ws.send(JSON.stringify(msg));
}

ws.on("open", () => {
  console.log(`Connected to ws://${HOST}:${PORT}`);
  send({ type: "execute", id: execId, code, language: "javascript" });
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  switch (msg.type) {
    case "connected":
      console.log(`Server: ${msg.hostname} v${msg.version}`);
      break;
    case "output":
      if (msg.id === execId) {
        process.stdout.write(msg.data);
      }
      break;
    case "done":
      if (msg.id === execId && phase === "execute") {
        console.log(`\n--- Execute done (exit ${msg.exitCode}) ---`);
        phase = "list";
        send({ type: "fs_list", id: listId, path: "." });
      }
      break;
    case "fs_list_result":
      if (msg.id === listId) {
        console.log(`\n--- Workspace (${msg.entries.length} entries) ---`);
        for (const entry of msg.entries) {
          console.log(`  ${entry.entryType === "directory" ? "d" : "f"} ${entry.name}`);
        }
        phase = "write";
        send({
          type: "fs_write",
          id: writeId,
          path: "cli-test.txt",
          content: "hello from Titus MVP2\n",
        });
      }
      break;
    case "fs_write_result":
      if (msg.id === writeId) {
        console.log(`\n--- Wrote ${msg.path} (${msg.size} bytes) ---`);
        phase = "read";
        send({ type: "fs_read", id: readId, path: "cli-test.txt" });
      }
      break;
    case "fs_read_result":
      if (msg.id === readId) {
        console.log(`\n--- Read ${msg.path} ---\n${msg.content}`);
        phase = "delete";
        send({ type: "fs_delete", id: deleteId, path: "cli-test.txt" });
      }
      break;
    case "fs_delete_result":
      if (msg.id === deleteId) {
        console.log(`\n--- Deleted ${msg.path} ---`);
        phase = "done";
        ws.close();
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
}, 15_000);

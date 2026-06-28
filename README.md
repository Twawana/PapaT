# PapaT — Phone-as-PC Terminal

PapaT turns your phone into a remote coding environment. All computation runs on your PC; the phone is the interface.

## Architecture

```
mobile/          React Native (Expo) app — code editor, file explorer, terminal
host-server/     Node.js WebSocket server — executes JS and manages workspace files on your PC
```

The PC workspace (`PAPAT_WORKSPACE`) is the default file root. The mobile **Files** tab can also browse any allowed folder on your PC (home directory and drives), edit files in place, and create, rename, move, or delete files and folders.

## Quick Start

### 1. Start the PC Host Server

```bash
cd host-server
npm install ws
npm start
```

The server listens on `ws://0.0.0.0:3847` by default.

Find your PC's local IP (e.g. `192.168.1.42`):

- **Windows:** `ipconfig`
- **macOS/Linux:** `ifconfig` or `ip addr`

### 2. Start the Mobile App

```bash
cd mobile
npm install
npx expo start
```

- Scan the QR code with **Expo Go** on your phone (same Wi-Fi as PC)
- Enter your PC's IP address in the connection bar
- Tap **Connect**
- **Code** tab — write JavaScript and tap **Run**
- **Files** tab — browse workspace or any PC folder, edit files, create/rename/move/delete

### 3. Test from CLI (optional)

```bash
cd host-server
node scripts/test-client.js
```

## Environment Variables (Host)

| Variable | Default | Description |
|----------|---------|-------------|
| `PAPAT_PORT` | `3847` | WebSocket port |
| `PAPAT_HOST` | `0.0.0.0` | Bind address |
| `PAPAT_WORKSPACE` | `./workspace` | File root + execution working directory |
| `PAPAT_EXEC_TIMEOUT` | `30000` | Max execution time (ms) |
| `PAPAT_MAX_FILE_SIZE` | `512000` | Max file read/write size (bytes) |
| `PAPAT_COMMAND_TIMEOUT` | `60000` | Max shell command time (ms) |
| `PAPAT_LLM_PROVIDER` | `cursor` | Agent backend: `cursor` (logged-in Cursor CLI) or `openai` |
| `PAPAT_CURSOR_MODEL` | `auto` | Cursor model (`auto`, `composer-2.5`, etc.) |
| `CURSOR_API_KEY` | — | Optional Cursor API key (otherwise uses `agent login` session) |
| `OPENAI_API_KEY` | — | OpenAI API key (only if `PAPAT_LLM_PROVIDER=openai`) |
| `PAPAT_LLM_MODEL` | `gpt-4o-mini` | OpenAI model when using OpenAI provider |
| `PAPAT_AGENT_MAX_TURNS` | `15` | Max tool-calling loops per message (OpenAI provider only) |
| `PAPAT_REQUIRE_AUTH` | `true` | Require QR pairing / device token for mobile clients |
| `PAPAT_PAIRING_TTL_MS` | `120000` | Pairing code lifetime (ms); QR refreshes on host |

## Auth & QR Pairing (MVP 6)

By default, the host **requires authentication**. Unpaired clients cannot read files, run code, or use the agent.

### Pair your phone

1. Start the host — a **QR code** prints in the terminal (refreshes every 2 minutes)
2. Open the PapaT app → tap **Scan QR**
3. Point your camera at the QR on your PC
4. Your phone is paired and receives a secure token stored in the device keychain

After pairing, tap **Connect** to reconnect using the saved token (no QR needed).

### Manual pairing

If scanning fails, enter on your phone:

- **Host:** your PC LAN IP (shown in the terminal)
- **Port:** `3847`
- **Code:** the 6-character code shown under the QR

Then tap **Scan QR** is not needed — use the code from terminal with a future manual-code UI, or scan JSON from terminal.

### Disable auth (development only)

```bash
PAPAT_REQUIRE_AUTH=false npm start
```

Paired device tokens are stored in `%USERPROFILE%\.papat\tokens.json` on the PC.

## VS Code Integration (MVP 7)

PapaT connects **directly to VS Code** through a companion extension. When linked:

- Your phone shows **VS Code linked** in the connection bar
- **Open in VS Code** switches the workspace without launching a new window
- Saving a file from the phone **opens it in VS Code** on your PC
- The **Files** tab can push any file to your open editor

### Install the VS Code extension

1. Start the PapaT host on your PC (`host-server`)
2. **Open the repo root** `PapaT` in VS Code or Cursor (not the `mobile` or `host-server` subfolder)
3. Build the extension:
   ```bash
   cd vscode-extension
   npm install
   npm run build
   ```
4. **Run and Debug** → **PapaT VS Code Extension** → **F5**

   If you see *“Extension host did not start in 10 seconds”*:
   - Turn off **Stop on Entry** in the Debug toolbar (pause icon with a dot)
   - Remove breakpoints in `vscode-extension/src`
   - Make sure the workspace folder is the **PapaT repo root**
   - Retry — the launch config waits up to 2 minutes and rebuilds first

5. A **second window** opens with the extension loaded. The status bar shows **PapaT: connected** when linked to `ws://127.0.0.1:3847`

**Without debugging (easier):** package and install a `.vsix`:
```bash
cd vscode-extension
npm install && npm run build
npx @vscode/vsce package
```
Then in VS Code/Cursor: **Extensions** → **⋯** → **Install from VSIX…**

Extension settings (`papat.host`, `papat.port`, `papat.autoConnect`) are in VS Code Settings.

## AI Agent (MVP 4)

The **Agent** tab sends messages to your PC host, which runs the **Cursor CLI** (`agent`) using your logged-in Cursor account. That gives you the same smart agent as Cursor on desktop — file edits, shell commands, debugging, and more.

### One-time setup on your PC

1. Install the Cursor CLI (if you don't have `agent` yet):

   **Windows PowerShell:**
   ```powershell
   irm 'https://cursor.com/install?win32=true' | iex
   ```

2. Log in with your Cursor account:
   ```bash
   agent login
   ```

3. Rebuild and start the host:
   ```bash
   cd host-server && npm run build && npm start
   ```

Optional: set `CURSOR_API_KEY` instead of `agent login` for automation. To use OpenAI instead, set `PAPAT_LLM_PROVIDER=openai` and `OPENAI_API_KEY`.

## File System Protocol (MVP 2)

All paths are relative to `PAPAT_WORKSPACE`. The mobile app syncs on demand (list/read/write/delete over WebSocket).

| Client message | Server response |
|----------------|-----------------|
| `fs_list` | `fs_list_result` with `entries[]` |
| `fs_read` | `fs_read_result` with `content` |
| `fs_write` | `fs_write_result` |
| `fs_delete` | `fs_delete_result` |
| `fs_mkdir` | `fs_mkdir_result` |

## Development Phases

- [x] **MVP 1** — WebSocket connection, JS execution, terminal output
- [x] **MVP 2** — File system (read/write/list/delete)
- [x] **MVP 2b** — Open projects in Cursor/VS Code, browse PC folders, recent folders
- [ ] **MVP 3** — Mobile code editor enhancements
- [x] **MVP 4** — AI agent with tool calling
- [ ] **MVP 5** — Python + multi-language
- [x] **MVP 6** — Auth & QR pairing
- [x] **MVP 7** — VS Code extension (direct WebSocket bridge)

## License

MIT
